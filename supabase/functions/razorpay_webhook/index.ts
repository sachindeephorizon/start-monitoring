// Supabase Edge Function: razorpay_webhook
// Receives Razorpay webhook events for subscription lifecycle + payments.
//
// Security:
// - Razorpay calls this endpoint without Supabase auth.
// - We verify the `x-razorpay-signature` header using RAZORPAY_WEBHOOK_SECRET and the raw request body.
//
// Reliability:
// - We store every payload with `dedupe_key = sha256(rawBody)` to make processing idempotent.
// - We update `user_subscriptions` so the app entitlement reflects recurring charges/cancellations.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RAZORPAY_WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") || "";

function json(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders,
    },
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return toHex(new Uint8Array(digest));
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(new Uint8Array(sig));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const aa = (a || "").toLowerCase();
  const bb = (b || "").toLowerCase();
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  return out === 0;
}

function parseUnixSecondsToIso(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function deriveSubscriptionUpdate(eventName: string, subscriptionEntity: any): {
  status?: "active" | "expired" | "cancelled";
  autoRenew?: boolean;
} {
  const e = String(eventName || "").toLowerCase();
  const subStatus = String(subscriptionEntity?.status || "").toLowerCase();

  if (e.includes("cancelled") || subStatus === "cancelled") {
    return { status: "cancelled", autoRenew: false };
  }
  if (e.includes("completed") || subStatus === "completed") {
    return { status: "expired", autoRenew: false };
  }
  if (e.includes("halted") || subStatus === "halted") {
    return { status: "cancelled", autoRenew: false };
  }
  if (e.includes("activated") || e.includes("charged") || e.includes("authenticated")) {
    return { status: "active", autoRenew: true };
  }
  // Default: don't override
  return {};
}

serve(async (req) => {
  // CORS preflight (useful for manual debugging; Razorpay itself doesn't use OPTIONS).
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type, x-razorpay-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  // Read raw body first (required for signature verification).
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") || "";

  if (!RAZORPAY_WEBHOOK_SECRET) {
    // Misconfigured server — return 200 to avoid webhook retry storms, but mark failure.
    console.error("[razorpay_webhook] Missing RAZORPAY_WEBHOOK_SECRET");
    return json(200, { ok: false, error: "Server misconfigured" });
  }

  try {
    const expected = await hmacSha256Hex(rawBody, RAZORPAY_WEBHOOK_SECRET);
    if (!signature || !timingSafeEqualHex(expected, signature)) {
      return json(401, { ok: false, error: "Invalid webhook signature" });
    }

    const dedupeKey = await sha256Hex(rawBody);
    const payload = JSON.parse(rawBody) as any;
    const eventName = String(payload?.event || "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Persist webhook event for idempotency/audit. If already processed, exit 200.
    const { error: insEvtErr } = await supabaseAdmin
      .from("razorpay_webhook_events")
      .insert({
        dedupe_key: dedupeKey,
        event_name: eventName || "unknown",
        razorpay_entity_id:
          payload?.payload?.subscription?.entity?.id ||
          payload?.payload?.payment?.entity?.id ||
          null,
        signature,
        raw: payload,
      });

    if (insEvtErr) {
      // Unique violation => already processed.
      const msg = String(insEvtErr?.message || "");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        return json(200, { ok: true, idempotent: true });
      }
      // Non-fatal; continue best-effort.
      console.warn("[razorpay_webhook] Failed to persist event (non-fatal):", msg);
    }

    const subscriptionEntity = payload?.payload?.subscription?.entity || null;
    const paymentEntity = payload?.payload?.payment?.entity || null;

    const razorpaySubscriptionId = subscriptionEntity?.id ? String(subscriptionEntity.id) : "";
    const planId = subscriptionEntity?.plan_id ? String(subscriptionEntity.plan_id) : "";
    const notes = subscriptionEntity?.notes || {};

    // Try to locate user_id:
    // 1) notes.supabase_user_id (set when we create the subscription)
    // 2) razorpay_subscriptions table
    let userId: string | null = notes?.supabase_user_id ? String(notes.supabase_user_id) : null;
    if (!userId && razorpaySubscriptionId) {
      const { data } = await supabaseAdmin
        .from("razorpay_subscriptions")
        .select("user_id")
        .eq("razorpay_subscription_id", razorpaySubscriptionId)
        .limit(1)
        .maybeSingle();
      if (data?.user_id) userId = String(data.user_id);
    }

    // Upsert subscription tracking row.
    if (razorpaySubscriptionId) {
      await supabaseAdmin
        .from("razorpay_subscriptions")
        .upsert(
          {
            ...(userId ? { user_id: userId } : null),
            plan_id: planId || null,
            razorpay_subscription_id: razorpaySubscriptionId,
            razorpay_plan_id: planId || null,
            status: subscriptionEntity?.status ? String(subscriptionEntity.status) : null,
            current_start: parseUnixSecondsToIso(subscriptionEntity?.current_start),
            current_end: parseUnixSecondsToIso(subscriptionEntity?.current_end),
            total_count: typeof subscriptionEntity?.total_count === "number" ? subscriptionEntity.total_count : null,
            paid_count: typeof subscriptionEntity?.paid_count === "number" ? subscriptionEntity.paid_count : null,
            remaining_count: typeof subscriptionEntity?.remaining_count === "number" ? subscriptionEntity.remaining_count : null,
            short_url: subscriptionEntity?.short_url ? String(subscriptionEntity.short_url) : null,
            notes: notes || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "razorpay_subscription_id" },
        );
    }

    // Upsert payment tracking row (if present).
    if (paymentEntity?.id) {
      await supabaseAdmin
        .from("razorpay_payments")
        .upsert(
          {
            ...(userId ? { user_id: userId } : null),
            razorpay_payment_id: String(paymentEntity.id),
            razorpay_subscription_id: paymentEntity?.subscription_id ? String(paymentEntity.subscription_id) : null,
            razorpay_order_id: paymentEntity?.order_id ? String(paymentEntity.order_id) : null,
            amount_subunits: typeof paymentEntity?.amount === "number" ? paymentEntity.amount : null,
            currency: paymentEntity?.currency ? String(paymentEntity.currency) : null,
            status: paymentEntity?.status ? String(paymentEntity.status) : null,
            method: paymentEntity?.method ? String(paymentEntity.method) : null,
            captured:
              paymentEntity?.captured === true ||
              String(paymentEntity?.status || "").toLowerCase() === "captured",
            raw: paymentEntity,
          },
          { onConflict: "razorpay_payment_id" },
        );
    }

    // Update canonical user_subscriptions (best-effort).
    if (userId && razorpaySubscriptionId) {
      const nowIso = new Date().toISOString();
      const endIso = parseUnixSecondsToIso(subscriptionEntity?.current_end);
      const startIso = parseUnixSecondsToIso(subscriptionEntity?.current_start) ||
        parseUnixSecondsToIso(subscriptionEntity?.start_at) ||
        nowIso;

      const derived = deriveSubscriptionUpdate(eventName, subscriptionEntity);

      // Check if a row exists; if not, create one (covers cases where app verification failed but webhook arrived).
      const { data: existing } = await supabaseAdmin
        .from("user_subscriptions")
        .select("id,status")
        .eq("user_id", userId)
        .eq("razorpay_subscription_id", razorpaySubscriptionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        await supabaseAdmin
          .from("user_subscriptions")
          .update({
            ...(planId ? { plan_id: planId } : null),
            ...(derived.status ? { status: derived.status } : null),
            ...(typeof derived.autoRenew === "boolean" ? { auto_renew: derived.autoRenew } : null),
            ...(endIso ? { end_date: endIso } : null),
            updated_at: nowIso,
            payment_provider: "razorpay",
            payment_method: "razorpay",
            payment_status: subscriptionEntity?.status ? String(subscriptionEntity.status) : null,
          })
          .eq("id", existing.id);
      } else {
        // Make sure we don't create multiple active rows for Razorpay.
        // Do NOT touch iOS storekit.
        try {
          await supabaseAdmin
            .from("user_subscriptions")
            .update({
              status: "expired",
              auto_renew: false,
              updated_at: nowIso,
            })
            .eq("user_id", userId)
            .eq("status", "active")
            .neq("payment_method", "ios_storekit");
        } catch {
          // ignore
        }

        await supabaseAdmin
          .from("user_subscriptions")
          .insert({
            user_id: userId,
            plan_id: planId || "unknown",
            status: derived.status || "active",
            start_date: startIso,
            end_date: endIso,
            auto_renew: typeof derived.autoRenew === "boolean" ? derived.autoRenew : true,
            payment_provider: "razorpay",
            payment_method: "razorpay",
            payment_status: subscriptionEntity?.status ? String(subscriptionEntity.status) : null,
            razorpay_subscription_id: razorpaySubscriptionId,
            razorpay_payment_id: paymentEntity?.id ? String(paymentEntity.id) : null,
            razorpay_order_id: paymentEntity?.order_id ? String(paymentEntity.order_id) : null,
            payment_amount_subunits: typeof paymentEntity?.amount === "number" ? paymentEntity.amount : null,
            payment_currency: paymentEntity?.currency ? String(paymentEntity.currency) : null,
            payment_captured:
              paymentEntity?.captured === true ||
              String(paymentEntity?.status || "").toLowerCase() === "captured",
            updated_at: nowIso,
          });
      }
    }

    return json(200, { ok: true });
  } catch (e: any) {
    console.error("[razorpay_webhook] Error:", e?.message || e);
    // Return 200 to avoid retry storms; log for investigation.
    return json(200, { ok: false });
  }
});

