// Supabase Edge Function: verify_razorpay_payment
// Android (Razorpay): verify subscription authentication payment and activate server-owned subscription.
//
// IMPORTANT:
// - Signature verification is performed server-side using Razorpay key secret.
// - We also fetch Payment + Subscription from Razorpay API for status and integrity checks.
// - The server is the source of truth. The app only reads `user_subscriptions`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Plan = {
  id: string; // App plan id (also used for iOS mapping). Razorpay plan id may differ.
  billing_cycle?: "monthly" | "yearly";
  price?: number;
  currency?: string;
  type?: "individual" | "family";
  name?: string;
};

type RequestBody = {
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
  // Legacy field (some clients might still send this)
  razorpay_order_id?: string;
  plan?: Plan;
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const RAZORPAY_PLAN_MAP_JSON = Deno.env.get("RAZORPAY_PLAN_MAP_JSON") || "";

function getPlanMap(): Record<string, string> {
  if (RAZORPAY_PLAN_MAP_JSON) {
    try {
      const parsed = JSON.parse(RAZORPAY_PLAN_MAP_JSON) as any;
      if (parsed && typeof parsed === "object") {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof k === "string" && typeof v === "string" && k.length && v.length) {
            out[k] = v;
          }
        }
        return out;
      }
    } catch {
      // ignore
    }
  }
  return {};
}

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

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  });
}

function basicAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
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
  for (let i = 0; i < aa.length; i++) {
    out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
  }
  return out === 0;
}

function parseUnixSecondsToIso(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function computeEndDateFallback(
  startIso: string,
  billingCycle: "monthly" | "yearly" | undefined,
): string {
  const start = new Date(startIso);
  const end = new Date(start);
  if (billingCycle === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end.toISOString();
}

function isMissingColumn(err: any): { table?: string; column?: string } | null {
  const msg = String(err?.message || "");
  if (err?.code !== "PGRST204") return null;
  // Message typically contains: "Could not find the 'foo' column of 'bar' in the schema cache"
  const m = msg.match(/'([^']+)'\s+column\s+of\s+'([^']+)'/i);
  if (!m) return { column: undefined, table: undefined };
  return { column: m[1], table: m[2] };
}

async function safeInsertUserSubscription(
  supabaseClient: any,
  payload: Record<string, unknown>,
): Promise<any> {
  // Retry once or twice removing unknown columns so purchases can still be activated
  // on older schemas.
  let current = { ...payload };
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabaseClient
      .from("user_subscriptions")
      .insert(current)
      .select()
      .single();

    if (!error) return data;
    const missing = isMissingColumn(error);
    if (missing?.column && Object.prototype.hasOwnProperty.call(current, missing.column)) {
      delete (current as any)[missing.column];
      continue;
    }
    throw error;
  }
  throw new Error("Failed to insert subscription (schema mismatch)");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight();
  if (req.method !== "POST") return json(405, { success: false, error: "Method not allowed" });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json(401, { success: false, error: "Missing authorization header" });
    }

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return json(500, {
        success: false,
        error: "Server misconfigured (missing Razorpay API keys)",
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return json(401, { success: false, error: "Unauthorized" });
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const paymentId = String(body.razorpay_payment_id || "").trim();
    const subscriptionId = String(body.razorpay_subscription_id || "").trim();
    const signature = String(body.razorpay_signature || "").trim();
    const plan = body.plan;

    if (!paymentId || !subscriptionId || !signature) {
      return json(400, { success: false, error: "Missing required Razorpay fields" });
    }
    if (!plan?.id || !String(plan.id).startsWith("plan_")) {
      return json(400, { success: false, error: "Missing/invalid plan" });
    }
    const appPlanId = String(plan.id);
    const planMap = getPlanMap();
    const mappedRazorpayPlanId = planMap[appPlanId] ? String(planMap[appPlanId]) : "";

    // Idempotency: if we have already stored this payment_id, return the existing subscription row (if any).
    try {
      const { data: existingPay } = await supabaseClient
        .from("razorpay_payments")
        .select("razorpay_payment_id")
        .eq("razorpay_payment_id", paymentId)
        .maybeSingle();
      if (existingPay?.razorpay_payment_id) {
        const { data: existingSub } = await supabaseClient
          .from("user_subscriptions")
          .select("*")
          .eq("user_id", user.id)
          .eq("razorpay_payment_id", paymentId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingSub) {
          return json(200, { success: true, subscription: existingSub, idempotent: true });
        }
      }
    } catch {
      // Non-fatal if schema/table doesn't exist yet.
    }

    // Signature verification (Subscriptions):
    // generated_signature = hmac_sha256(razorpay_payment_id + "|" + subscription_id, secret)
    const expected = await hmacSha256Hex(`${paymentId}|${subscriptionId}`, RAZORPAY_KEY_SECRET);
    if (!timingSafeEqualHex(expected, signature)) {
      return json(400, { success: false, error: "Invalid payment signature" });
    }

    // Fetch payment from Razorpay to confirm status and linkage.
    const payRes = await fetchWithTimeout(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          "Authorization": basicAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
          "Accept": "application/json",
        },
      },
      12_000,
    );
    const payText = await payRes.text();
    if (!payRes.ok) {
      // Return 200 so mobile gets actionable body (Supabase client can hide non-2xx body).
      return json(200, {
        success: false,
        error: "Unable to verify payment right now. Please try again.",
        details: payText.slice(0, 500),
        razorpayStatus: payRes.status,
      });
    }
    const payJson = JSON.parse(payText) as any;

    const rpSubId = payJson?.subscription_id ? String(payJson.subscription_id) : "";
    if (rpSubId && rpSubId !== subscriptionId) {
      return json(400, { success: false, error: "Payment does not match subscription" });
    }

    // IMPORTANT (Subscriptions / mandates):
    // For UPI/mandate authentication, Razorpay can return payment status "authorized"
    // during authentication, and it may not be "captured" yet.
    // We consider the payment acceptable if it is not failed AND the subscription is authenticated/active.
    const paymentStatus = String(payJson?.status || "unknown").toLowerCase();
    const isPaymentFailed = paymentStatus === "failed";

    // Fetch subscription from Razorpay to confirm plan.
    const subRes = await fetchWithTimeout(
      `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        method: "GET",
        headers: {
          "Authorization": basicAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
          "Accept": "application/json",
        },
      },
      12_000,
    );
    const subText = await subRes.text();
    if (!subRes.ok) {
      return json(200, {
        success: false,
        error: "Unable to verify subscription right now. Please try again.",
        details: subText.slice(0, 500),
        razorpayStatus: subRes.status,
      });
    }
    const subJson = JSON.parse(subText) as any;
    const rpPlanId = subJson?.plan_id ? String(subJson.plan_id) : "";
    if (rpPlanId) {
      const expectedRpPlanId = mappedRazorpayPlanId || appPlanId;
      if (expectedRpPlanId && rpPlanId !== expectedRpPlanId) {
        return json(200, {
          success: false,
          error: "Subscription plan mismatch. Please contact support.",
          details: JSON.stringify({
            appPlanId,
            mappedRazorpayPlanId: mappedRazorpayPlanId || null,
            razorpayPlanId: rpPlanId,
          }).slice(0, 500),
        });
      }
    }

    const subStatus = String(subJson?.status || "unknown").toLowerCase();
    const subIsAuthenticatedOrActive =
      subStatus === "authenticated" || subStatus === "active" || subStatus === "charged";

    if (isPaymentFailed) {
      return json(200, {
        success: false,
        error: `Payment failed (status=${paymentStatus})`,
      });
    }
    if (!subIsAuthenticatedOrActive) {
      return json(200, {
        success: false,
        error: `Subscription not active yet (status=${subStatus}). Please wait a moment and try again.`,
      });
    }

    const captured =
      payJson?.captured === true ||
      paymentStatus === "captured" ||
      paymentStatus === "authorized";

    // Persist payment (idempotent).
    await supabaseClient
      .from("razorpay_payments")
      .upsert(
        {
          user_id: user.id,
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: subscriptionId,
          razorpay_order_id: payJson?.order_id ? String(payJson.order_id) : null,
          amount_subunits: typeof payJson?.amount === "number" ? payJson.amount : null,
          currency: payJson?.currency ? String(payJson.currency) : null,
          status: payJson?.status ? String(payJson.status) : null,
          method: payJson?.method ? String(payJson.method) : null,
          captured: !!captured,
          raw: payJson,
        },
        { onConflict: "razorpay_payment_id" },
      );

    // Upsert subscription tracking row (best-effort).
    await supabaseClient
      .from("razorpay_subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_id: appPlanId,
          razorpay_subscription_id: subscriptionId,
          razorpay_plan_id: rpPlanId || mappedRazorpayPlanId || appPlanId,
          status: String(subJson?.status || "unknown"),
          current_start: parseUnixSecondsToIso(subJson?.current_start),
          current_end: parseUnixSecondsToIso(subJson?.current_end),
          total_count: typeof subJson?.total_count === "number" ? subJson.total_count : null,
          paid_count: typeof subJson?.paid_count === "number" ? subJson.paid_count : null,
          remaining_count: typeof subJson?.remaining_count === "number" ? subJson.remaining_count : null,
          short_url: subJson?.short_url ? String(subJson.short_url) : null,
          notes: subJson?.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "razorpay_subscription_id" },
      );

    // Derive start/end dates.
    const startIso = parseUnixSecondsToIso(subJson?.current_start) ||
      parseUnixSecondsToIso(subJson?.start_at) ||
      new Date().toISOString();
    const endIso = parseUnixSecondsToIso(subJson?.current_end) ||
      computeEndDateFallback(startIso, plan.billing_cycle);

    // Ensure we don't create multiple active rows for Android purchases.
    // IMPORTANT: do NOT touch iOS StoreKit rows.
    try {
      await supabaseClient
        .from("user_subscriptions")
        .update({
          status: "expired",
          auto_renew: false,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("status", "active")
        .neq("payment_method", "ios_storekit");
    } catch {
      // Non-fatal if schema is older (e.g. payment_method column missing).
    }

    // Create subscription record (server-owned).
    const insertPayload: Record<string, unknown> = {
      user_id: user.id,
      plan_id: appPlanId,
      status: "active",
      start_date: startIso,
      end_date: endIso,
      auto_renew: true,
      payment_method: "razorpay",
      payment_provider: "razorpay",
      payment_status: String(payJson?.status || subStatus || "authorized"),
      razorpay_subscription_id: subscriptionId,
      razorpay_payment_id: paymentId,
      razorpay_order_id: payJson?.order_id ? String(payJson.order_id) : null,
      payment_amount_subunits: typeof payJson?.amount === "number" ? payJson.amount : null,
      payment_currency: payJson?.currency ? String(payJson.currency) : (plan.currency || "INR"),
      payment_captured: !!captured,
      updated_at: new Date().toISOString(),
    };

    const subscriptionRow = await safeInsertUserSubscription(supabaseClient, insertPayload);

    return json(200, { success: true, subscription: subscriptionRow });
  } catch (e: any) {
    console.error("[verify_razorpay_payment] Error:", e?.message || e);
    return json(500, { success: false, error: e?.message || "Unexpected error" });
  }
});

