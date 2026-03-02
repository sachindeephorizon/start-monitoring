// Supabase Edge Function: create_razorpay_order
// Android (Razorpay): create a Razorpay Subscription (mandate) for a given plan.
//
// Why the name still says "order":
// - The React Native code calls `create_razorpay_order` today.
// - For true recurring billing, Razorpay requires creating a Subscription and passing `subscription_id` to Checkout.
// - We return both `orderId` (legacy alias) and `subscriptionId` for compatibility.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Plan = {
  id: string; // App plan id (also used as iOS product mapping). Razorpay plan id may differ.
  name?: string;
  type?: "individual" | "family";
  billing_cycle?: "monthly" | "yearly";
  price?: number;
  currency?: string;
};

type RequestBody = {
  plan?: Plan;
  couponCode?: string | null;
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") || "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") || "";
const RAZORPAY_PLAN_MAP_JSON = Deno.env.get("RAZORPAY_PLAN_MAP_JSON") || "";

function getPlanMap(): Record<string, string> {
  // Preferred: single JSON secret so we can update without redeploys.
  // Example:
  // {
  //   "plan_RIADHZ91GxVCUn": "plan_XXXXXXXXXXXXXX",
  //   "plan_RIAOwgHa1uhibd": "plan_YYYYYYYYYYYYYY"
  // }
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
      // Ignore malformed JSON; we'll fall back to discovery / direct probe.
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

function totalCountForPlan(billingCycle: Plan["billing_cycle"]): number {
  // Razorpay requires `total_count`. Use a long horizon to approximate "auto-renew until cancelled".
  // monthly -> 10 years; yearly -> 10 years
  if (billingCycle === "yearly") return 10;
  return 120;
}

function inferRazorpayPeriod(billingCycle: Plan["billing_cycle"]): "monthly" | "yearly" | null {
  if (billingCycle === "monthly") return "monthly";
  if (billingCycle === "yearly") return "yearly";
  return null;
}

async function fetchRazorpayPlan(
  planId: string,
  authHeader: string,
): Promise<{ ok: boolean; status: number; text: string }> {
  const res = await fetchWithTimeout(
    `https://api.razorpay.com/v1/plans/${encodeURIComponent(planId)}`,
    { method: "GET", headers: { Authorization: authHeader } },
    12_000,
  );
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function findMatchingRazorpayPlanId(
  plan: Plan,
  authHeader: string,
): Promise<{ planId: string | null; debug?: Record<string, unknown> }> {
  const period = inferRazorpayPeriod(plan.billing_cycle);
  const amountSubunits =
    typeof plan.price === "number" && Number.isFinite(plan.price) ? Math.round(plan.price * 100) : null;

  if (!period || !amountSubunits) {
    return { planId: null, debug: { reason: "missing_period_or_amount", period, amountSubunits } };
  }

  // Fetch plans list (best-effort). We request up to 100 and match by amount+period+interval.
  const listRes = await fetchWithTimeout(
    "https://api.razorpay.com/v1/plans?count=100",
    { method: "GET", headers: { Authorization: authHeader } },
    12_000,
  );
  const listText = await listRes.text();
  if (!listRes.ok) {
    return {
      planId: null,
      debug: { reason: "list_failed", status: listRes.status, body: listText.slice(0, 300) },
    };
  }

  let items: any[] = [];
  try {
    const parsed = JSON.parse(listText) as any;
    items = Array.isArray(parsed?.items) ? parsed.items : [];
  } catch {
    items = [];
  }

  const matches = items.filter((p) => {
    const item = p?.item ?? {};
    const pAmount = typeof item?.amount === "number" ? item.amount : null;
    const pPeriod = typeof p?.period === "string" ? p.period : null;
    const pInterval = typeof p?.interval === "number" ? p.interval : null;
    return pAmount === amountSubunits && pPeriod === period && pInterval === 1;
  });

  if (matches.length === 1) {
    return { planId: String(matches[0].id || ""), debug: { reason: "unique_match" } };
  }

  // If multiple, try to match by name.
  const desiredName = String(plan.name || "").toLowerCase();
  if (desiredName) {
    const nameMatch = matches.find((p) => String(p?.item?.name || "").toLowerCase().includes(desiredName));
    if (nameMatch?.id) {
      return { planId: String(nameMatch.id), debug: { reason: "name_match" } };
    }
  }

  return {
    planId: null,
    debug: {
      reason: "no_unique_match",
      matchCount: matches.length,
      sample: matches.slice(0, 3).map((p) => ({
        id: p?.id,
        name: p?.item?.name,
        amount: p?.item?.amount,
        period: p?.period,
        interval: p?.interval,
      })),
    },
  };
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
    const plan = body.plan;
    const couponCode = body.couponCode ? String(body.couponCode).trim().toUpperCase() : "";

    if (!plan?.id || typeof plan.id !== "string") {
      return json(400, { success: false, error: "Missing plan.id" });
    }
    const appPlanId = plan.id;

    const total_count = totalCountForPlan(plan.billing_cycle);

    // Determine which Razorpay plan id to use:
    // - Prefer the app-provided id if it exists in Razorpay.
    // - If it does NOT exist, try to discover a matching Razorpay plan by amount + billing cycle.
    const rpAuth = basicAuthHeader(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET);
    let razorpayPlanId = appPlanId;
    let usedDiscovery = false;
    const planMap = getPlanMap();

    // Production-first: if we have an explicit mapping, always use it.
    if (planMap[appPlanId]) {
      razorpayPlanId = planMap[appPlanId];
    }

    if (razorpayPlanId) {
      const probe = await fetchRazorpayPlan(razorpayPlanId, rpAuth);
      if (!probe.ok) {
        // If we had an explicit mapping but it fails, return an actionable message immediately.
        if (planMap[appPlanId]) {
          return json(200, {
            success: false,
            error:
              "Payment plan is not configured correctly. Please contact support or try again later.",
            details: JSON.stringify({
              appPlanId,
              mappedRazorpayPlanId: planMap[appPlanId],
              probeStatus: probe.status,
              probeBody: probe.text.slice(0, 300),
              reason: "mapped_plan_invalid_or_missing_in_razorpay",
            }),
          });
        }
        // Common case: app uses internal plan ids; Razorpay plan ids differ.
        const discovered = await findMatchingRazorpayPlanId(plan, rpAuth);
        if (discovered.planId) {
          razorpayPlanId = discovered.planId;
          usedDiscovery = true;
        } else {
          // Return actionable error (200) so mobile doesn't lose the body.
          return json(200, {
            success: false,
            error:
              "No matching Razorpay plan exists for this price/billing cycle. Please contact support.",
            details: JSON.stringify({
              appPlanId,
              probeStatus: probe.status,
              probeBody: probe.text.slice(0, 300),
              discovery: discovered.debug || null,
              hint:
                "Create corresponding Razorpay plans in this Razorpay account OR set RAZORPAY_PLAN_MAP_JSON secret.",
            }),
          });
        }
      }
    }

    const createPayload: Record<string, unknown> = {
      plan_id: razorpayPlanId,
      total_count,
      quantity: 1,
      customer_notify: 1,
      notes: {
        supabase_user_id: user.id,
        app_plan_id: appPlanId,
        razorpay_plan_id: razorpayPlanId,
        used_plan_discovery: usedDiscovery,
        ...(couponCode ? { coupon_code: couponCode } : null),
        app: "deephorizon-security",
        platform: "android",
      },
    };

    const rpRes = await fetchWithTimeout(
      "https://api.razorpay.com/v1/subscriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": rpAuth,
        },
        body: JSON.stringify(createPayload),
      },
      12_000,
    );

    const rpText = await rpRes.text();
    if (!rpRes.ok) {
      /**
       * IMPORTANT (production):
       * Supabase client libraries often surface non-2xx responses as a generic FunctionsHttpError
       * and can drop the response body. To keep error messages actionable on mobile,
       * return a 200 with `success:false` for Razorpay upstream errors.
       *
       * Unauthorized / misconfigured server errors still use proper HTTP codes above.
       */
      return json(200, {
        success: false,
        error: "Unable to start payment at the moment. Please try again.",
        razorpayStatus: rpRes.status,
        // Keep a short diagnostic snippet for support/debug (never include keys).
        details: rpText.slice(0, 500),
      });
    }

    const rpJson = JSON.parse(rpText) as any;
    const razorpaySubscriptionId = String(rpJson?.id || "");
    if (!razorpaySubscriptionId) {
      return json(200, {
        success: false,
        error: "Payment provider returned an invalid response. Please try again.",
      });
    }

    // Persist attempt for idempotency and webhook linking.
    // If it already exists (shouldn't), keep the existing row.
    await supabaseClient
      .from("razorpay_subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan_id: appPlanId,
          razorpay_subscription_id: razorpaySubscriptionId,
          razorpay_plan_id: String(rpJson?.plan_id || razorpayPlanId),
          status: String(rpJson?.status || "created"),
          current_start: rpJson?.current_start ? new Date(Number(rpJson.current_start) * 1000).toISOString() : null,
          current_end: rpJson?.current_end ? new Date(Number(rpJson.current_end) * 1000).toISOString() : null,
          total_count: typeof rpJson?.total_count === "number" ? rpJson.total_count : total_count,
          paid_count: typeof rpJson?.paid_count === "number" ? rpJson.paid_count : null,
          remaining_count: typeof rpJson?.remaining_count === "number" ? rpJson.remaining_count : null,
          short_url: rpJson?.short_url ? String(rpJson.short_url) : null,
          notes: rpJson?.notes ?? createPayload.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "razorpay_subscription_id" },
      );

    return json(200, {
      success: true,
      // Legacy alias used by older client code paths
      orderId: razorpaySubscriptionId,
      // Preferred field going forward
      subscriptionId: razorpaySubscriptionId,
      // Keep these for client convenience
      amount: typeof plan.price === "number" ? plan.price : null,
      currency: plan.currency || "INR",
      status: String(rpJson?.status || "created"),
    });
  } catch (e: any) {
    console.error("[create_razorpay_order] Error:", e?.message || e);
    return json(500, { success: false, error: e?.message || "Unexpected error" });
  }
});

