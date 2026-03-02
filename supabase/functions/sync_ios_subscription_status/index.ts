// Supabase Edge Function: sync_ios_subscription_status
// Purpose:
// - Force-refresh iOS subscription fields (auto_renew, end_date, status) from Apple
//   so the app UI reflects changes made in iOS Settings/App Store quickly.
//
// Security:
// - Requires Supabase authenticated user (Authorization header).
// - Calls Apple App Store Server API using a server-signed JWT (APPLE_IAP_* secrets).
//
// Notes:
// - This does NOT rely on Apple JWKS endpoints (which may 401/404 in some edge environments).
// - Instead, it queries Apple's subscription status endpoint and parses the returned JWS payloads.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { importPKCS8, SignJWT } from "https://deno.land/x/jose@v4.15.5/index.ts"

const EXPECTED_BUNDLE_ID = Deno.env.get('IOS_BUNDLE_ID') || 'com.deephorizon.security'

const APPLE_IAP_KEY_ID = Deno.env.get('APPLE_IAP_KEY_ID') || ''
const APPLE_IAP_ISSUER_ID = Deno.env.get('APPLE_IAP_ISSUER_ID') || ''
const APPLE_IAP_PRIVATE_KEY = Deno.env.get('APPLE_IAP_PRIVATE_KEY') || ''
const APPLE_SERVER_API_AUD = 'appstoreconnect-v1'

const APPLE_SUBSCRIPTION_STATUS_URL_PROD =
  Deno.env.get('APPLE_SUBSCRIPTION_STATUS_URL') ||
  'https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/'
const APPLE_SUBSCRIPTION_STATUS_URL_SANDBOX =
  Deno.env.get('APPLE_SUBSCRIPTION_STATUS_URL_SANDBOX') ||
  'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/subscriptions/'

// Mapping: productId -> planId (must match App Store Connect products)
const PRODUCT_ID_TO_PLAN_ID: Record<string, string> = {
  'com.deephorizon.security.individual.monthly.v1': 'plan_RIADHZ91GxVCUn',
  'com.deephorizon.security.individual.yearly.v1': 'plan_RIAOwgHa1uhibd',
  'com.deephorizon.security.family.monthly.v1': 'plan_RIADmXQMERsApy',
  'com.deephorizon.security.family.yearly.v1': 'plan_RIAOC4tpe6q41z',
}

let appleBearerCache: { token: string; expiresAtMs: number } | null = null
async function getAppleServerApiBearerToken(): Promise<string | null> {
  if (!APPLE_IAP_KEY_ID || !APPLE_IAP_ISSUER_ID || !APPLE_IAP_PRIVATE_KEY) return null
  const nowMs = Date.now()
  if (appleBearerCache && appleBearerCache.expiresAtMs > nowMs + 10_000) return appleBearerCache.token

  const privateKey = APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, '\n')
  const key = await importPKCS8(privateKey, 'ES256')
  const nowSec = Math.floor(nowMs / 1000)
  const expSec = nowSec + 600

  const token = await new SignJWT({ bid: EXPECTED_BUNDLE_ID } as any)
    .setProtectedHeader({ alg: 'ES256', kid: APPLE_IAP_KEY_ID, typ: 'JWT' })
    .setIssuer(APPLE_IAP_ISSUER_ID)
    .setAudience(APPLE_SERVER_API_AUD)
    .setIssuedAt(nowSec)
    .setExpirationTime(expSec)
    .sign(key)

  appleBearerCache = { token, expiresAtMs: expSec * 1000 }
  return token
}

function decodeJwtPayloadUnsafe(jws: string): any | null {
  try {
    const parts = String(jws || '').split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = atob(b64 + pad)
    return JSON.parse(json)
  } catch {
    return null
  }
}

const parseMs = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

async function fetchAppleSubscriptionStatus(originalTransactionId: string, environment?: string | null): Promise<any> {
  const bearer = await getAppleServerApiBearerToken()
  if (!bearer) throw new Error('Apple server API credentials not configured (APPLE_IAP_*)')

  const isSandbox =
    String(environment || '').toLowerCase() === 'sandbox' ||
    String(environment || '').toLowerCase() === 'xcode'
  const base = isSandbox ? APPLE_SUBSCRIPTION_STATUS_URL_SANDBOX : APPLE_SUBSCRIPTION_STATUS_URL_PROD
  const url = `${base}${encodeURIComponent(originalTransactionId)}`

  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${bearer}`,
        'User-Agent': 'DeepHorizonSecurity-SupabaseEdge/1.0',
      },
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Apple subscription status fetch failed (${res.status}): ${text.slice(0, 200)}`)
    }
    return JSON.parse(text)
  } finally {
    clearTimeout(id)
  }
}

function pickLatestFromStatusResponse(statusJson: any): {
  productId?: string
  transactionId?: string
  originalTransactionId?: string
  expiresDateMs?: number
  purchaseDateMs?: number
  autoRenew?: boolean
} | null {
  const dataArr: any[] = Array.isArray(statusJson?.data) ? statusJson.data : []
  if (dataArr.length === 0) return null

  // Apple returns one or more subscription status items, each can have lastTransactions.
  // We pick the lastTransaction with the max expiresDate.
  let best: any | null = null
  let bestExpires = -1
  let bestRenewal: any | null = null

  for (const item of dataArr) {
    const lastTxs: any[] = Array.isArray(item?.lastTransactions) ? item.lastTransactions : []
    for (const t of lastTxs) {
      const sti = t?.signedTransactionInfo ? String(t.signedTransactionInfo) : ''
      const sri = t?.signedRenewalInfo ? String(t.signedRenewalInfo) : ''
      if (!sti) continue
      const payload = decodeJwtPayloadUnsafe(sti)
      const expires = parseMs(payload?.expiresDate) ?? -1
      if (expires > bestExpires) {
        bestExpires = expires
        best = payload
        bestRenewal = sri ? decodeJwtPayloadUnsafe(sri) : null
      }
    }
  }

  if (!best) return null

  const autoRenewRaw = bestRenewal?.autoRenewStatus
  const autoRenew =
    autoRenewRaw === 1 || autoRenewRaw === '1' || autoRenewRaw === true
      ? true
      : autoRenewRaw === 0 || autoRenewRaw === '0' || autoRenewRaw === false
        ? false
        : undefined

  return {
    productId: best?.productId ? String(best.productId) : undefined,
    transactionId: best?.transactionId ? String(best.transactionId) : undefined,
    originalTransactionId: best?.originalTransactionId ? String(best.originalTransactionId) : undefined,
    expiresDateMs: bestExpires > 0 ? bestExpires : undefined,
    purchaseDateMs: parseMs(best?.purchaseDate) ?? undefined,
    autoRenew,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Use the latest active subscription row as the anchor.
    const { data: sub, error: subErr } = await supabaseClient
      .from('user_subscriptions')
      .select('id,user_id,plan_id,status,auto_renew,start_date,end_date,payment_method,original_transaction_id,store_environment,store_product_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subErr && (subErr as any).code !== 'PGRST116') {
      throw subErr
    }
    if (!sub?.id) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'no_active_subscription' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (String(sub.payment_method || '') !== 'ios_storekit') {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'not_ios_storekit' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const originalTransactionId = sub.original_transaction_id ? String(sub.original_transaction_id) : ''
    if (!originalTransactionId) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'missing_original_transaction_id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const statusJson = await fetchAppleSubscriptionStatus(originalTransactionId, sub.store_environment || null)
    const latest = pickLatestFromStatusResponse(statusJson)
    if (!latest) {
      return new Response(JSON.stringify({ success: true, updated: false, reason: 'apple_no_data' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const nowIso = new Date().toISOString()
    const expiresIso = latest.expiresDateMs ? new Date(latest.expiresDateMs).toISOString() : null
    const isActive = latest.expiresDateMs ? latest.expiresDateMs > Date.now() : true
    const nextStatus = isActive ? 'active' : 'expired'

    const nextPlanId =
      latest.productId && PRODUCT_ID_TO_PLAN_ID[latest.productId]
        ? PRODUCT_ID_TO_PLAN_ID[latest.productId]
        : sub.plan_id

    const updatePayload: Record<string, any> = {
      plan_id: nextPlanId,
      status: nextStatus,
      end_date: expiresIso,
      // If Apple doesn’t return renewal info, don’t overwrite (keep previous).
      ...(typeof latest.autoRenew === 'boolean' ? { auto_renew: latest.autoRenew } : null),
      ...(latest.productId ? { store_product_id: latest.productId } : null),
      ...(latest.transactionId ? { transaction_id: latest.transactionId } : null),
      ...(latest.originalTransactionId ? { original_transaction_id: latest.originalTransactionId } : null),
      store_last_verified_at: nowIso,
      updated_at: nowIso,
    }

    const { error: updErr } = await supabaseClient
      .from('user_subscriptions')
      .update(updatePayload)
      .eq('id', sub.id)
      .eq('user_id', user.id)

    if (updErr) throw updErr

    return new Response(JSON.stringify({ success: true, updated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

