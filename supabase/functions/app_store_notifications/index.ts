// Supabase Edge Function: app_store_notifications
// Production: App Store Server Notifications (v2) handler
//
// Purpose:
// - Keep `user_subscriptions` in sync on renewals/cancellations/expirations/refunds.
// - This avoids the app "going stale" after the initial purchase verification.
//
// Security:
// - Requests are NOT authenticated via Supabase auth (Apple calls this endpoint).
// - We verify the `signedPayload` JWS signature using Apple's notification JWKS.
// - Then we (optionally) verify the embedded `signedTransactionInfo` JWS using Apple's transaction JWKS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createLocalJWKSet, importPKCS8, jwtVerify, SignJWT } from "https://deno.land/x/jose@v4.15.5/index.ts"

const NOTIFICATION_JWKS_URL_PROD =
  Deno.env.get('APPLE_NOTIFICATION_JWKS_URL') ||
  "https://api.storekit.itunes.apple.com/inApps/v1/notifications/keys"
const NOTIFICATION_JWKS_URL_SANDBOX =
  Deno.env.get('APPLE_NOTIFICATION_JWKS_URL_SANDBOX') ||
  "https://api.storekit-sandbox.itunes.apple.com/inApps/v1/notifications/keys"

const TRANSACTION_JWKS_URL_PROD =
  Deno.env.get('APPLE_TRANSACTION_JWKS_URL') ||
  "https://api.storekit.itunes.apple.com/inApps/v1/keys"
const TRANSACTION_JWKS_URL_SANDBOX =
  Deno.env.get('APPLE_TRANSACTION_JWKS_URL_SANDBOX') ||
  // See verify_ios_purchase: default to production JWKS endpoint for reliability.
  "https://api.storekit.itunes.apple.com/inApps/v1/keys"

const EXPECTED_BUNDLE_ID = Deno.env.get('IOS_BUNDLE_ID') || 'com.deephorizon.security'

// Optional: authenticate JWKS fetches (some environments return 401 without auth)
const APPLE_IAP_KEY_ID = Deno.env.get('APPLE_IAP_KEY_ID') || ''
const APPLE_IAP_ISSUER_ID = Deno.env.get('APPLE_IAP_ISSUER_ID') || ''
const APPLE_IAP_PRIVATE_KEY = Deno.env.get('APPLE_IAP_PRIVATE_KEY') || ''
const APPLE_SERVER_API_AUD = 'appstoreconnect-v1'

// Mapping: productId -> planId (must match App Store Connect products)
const PRODUCT_ID_TO_PLAN_ID: Record<string, string> = {
  'com.deephorizon.security.individual.monthly.v1': 'plan_RIADHZ91GxVCUn',
  'com.deephorizon.security.individual.yearly.v1': 'plan_RIAOwgHa1uhibd',
  'com.deephorizon.security.family.monthly.v1': 'plan_RIADmXQMERsApy',
  'com.deephorizon.security.family.yearly.v1': 'plan_RIAOC4tpe6q41z',
}

type VerifiedTransaction = {
  productId: string
  transactionId: string
  originalTransactionId?: string
  purchaseDateMs?: number
  expiresDateMs?: number
  environment?: string
  bundleId?: string
  appAccountToken?: string
  revocationDateMs?: number
}

const parseMs = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

type JwksCacheEntry = {
  jwks: any
  expiresAtMs: number
}
const jwksCache = new Map<string, JwksCacheEntry>()

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

function parseCacheTtlSeconds(headers: Headers): number {
  const cc = headers.get('cache-control') || ''
  const m = cc.match(/max-age=(\d+)/i)
  if (m && m[1]) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  return 3600
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000): Promise<{ json: any; headers: Headers }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const bearer = await getAppleServerApiBearerToken()
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DeepHorizonSecurity-SupabaseEdge/1.0',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : null),
      },
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`JWKS fetch failed (${res.status}) from ${url}: ${text.slice(0, 200)}`)
    }
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`JWKS fetch returned non-JSON from ${url}: ${text.slice(0, 200)}`)
    }
    return { json, headers: res.headers }
  } finally {
    clearTimeout(id)
  }
}

async function getJwks(url: string): Promise<any> {
  const now = Date.now()
  const cached = jwksCache.get(url)
  if (cached && cached.expiresAtMs > now) return cached.jwks

  const attempts = 3
  let lastErr: any = null
  for (let i = 0; i < attempts; i++) {
    try {
      const { json, headers } = await fetchJsonWithTimeout(url, 8000)
      const ttlSeconds = parseCacheTtlSeconds(headers)
      jwksCache.set(url, { jwks: json, expiresAtMs: now + ttlSeconds * 1000 })
      return json
    } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
  }
  throw lastErr || new Error(`JWKS fetch failed for ${url}`)
}

async function jwtVerifyWithJwksUrls(jws: string, urls: string[]): Promise<any> {
  let lastErr: any = null
  for (const url of urls) {
    try {
      const jwks = await getJwks(url)
      const JWKS = createLocalJWKSet(jwks as any)
      return await jwtVerify(jws, JWKS, {} as any)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('Failed to verify JWS')
}

async function verifyNotificationSignedPayload(signedPayload: string): Promise<any> {
  // Try prod first, then sandbox (covers both environments).
  const { payload } = await jwtVerifyWithJwksUrls(signedPayload, [
    NOTIFICATION_JWKS_URL_PROD,
    NOTIFICATION_JWKS_URL_SANDBOX,
  ])
  return payload as any
}

async function verifyTransactionJws(signedTransactionInfo: string): Promise<VerifiedTransaction> {
  const { payload } = await jwtVerifyWithJwksUrls(signedTransactionInfo, [
    TRANSACTION_JWKS_URL_PROD,
    TRANSACTION_JWKS_URL_SANDBOX,
  ])

  const productId = String((payload as any)?.productId || '')
  const transactionId = String((payload as any)?.transactionId || '')
  const originalTransactionId = (payload as any)?.originalTransactionId
    ? String((payload as any).originalTransactionId)
    : undefined
  const purchaseDateMs = parseMs((payload as any)?.purchaseDate) ?? undefined
  const expiresDateMs = parseMs((payload as any)?.expiresDate) ?? undefined
  const environment = (payload as any)?.environment ? String((payload as any).environment) : undefined
  const bundleId = (payload as any)?.bundleId ? String((payload as any).bundleId) : undefined
  const appAccountToken = (payload as any)?.appAccountToken ? String((payload as any).appAccountToken) : undefined
  const revocationDateMs = parseMs((payload as any)?.revocationDate) ?? undefined

  if (!productId || !transactionId) {
    throw new Error('Invalid signedTransactionInfo payload')
  }
  if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error('Bundle ID mismatch in signedTransactionInfo')
  }

  return {
    productId,
    transactionId,
    originalTransactionId,
    purchaseDateMs,
    expiresDateMs,
    environment,
    bundleId,
    appAccountToken,
    revocationDateMs,
  }
}

async function verifyRenewalJws(signedRenewalInfo: string): Promise<{ autoRenewStatus?: boolean }> {
  // Renewal JWS uses Apple StoreKit keys as well.
  const { payload } = await jwtVerifyWithJwksUrls(signedRenewalInfo, [
    TRANSACTION_JWKS_URL_PROD,
    TRANSACTION_JWKS_URL_SANDBOX,
  ])
  const raw = (payload as any)?.autoRenewStatus
  const autoRenewStatus =
    raw === 1 || raw === '1' || raw === true
      ? true
      : raw === 0 || raw === '0' || raw === false
        ? false
        : undefined
  return { autoRenewStatus }
}

serve(async (req) => {
  // Basic CORS (harmless for Apple; useful for debugging).
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json().catch(() => ({} as any))
    const signedPayload = body?.signedPayload
    if (!signedPayload || typeof signedPayload !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'Missing signedPayload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const notification = await verifyNotificationSignedPayload(signedPayload)
    const notificationType = String(notification?.notificationType || '')
    const subtype = notification?.subtype ? String(notification.subtype) : null

    // Extract embedded transaction/renewal info (preferred).
    const signedTransactionInfo = notification?.data?.signedTransactionInfo
    const signedRenewalInfo = notification?.data?.signedRenewalInfo

    let tx: VerifiedTransaction | null = null
    let renewal: { autoRenewStatus?: boolean } | null = null

    if (signedTransactionInfo && typeof signedTransactionInfo === 'string') {
      tx = await verifyTransactionJws(signedTransactionInfo)
    }
    if (signedRenewalInfo && typeof signedRenewalInfo === 'string') {
      renewal = await verifyRenewalJws(signedRenewalInfo)
    }

    if (!tx) {
      // We require a verified transaction payload to safely update DB.
      return new Response(JSON.stringify({ ok: false, error: 'Missing signedTransactionInfo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const planId = PRODUCT_ID_TO_PLAN_ID[tx.productId] || null
    const nowIso = new Date().toISOString()

    // Derive subscription status from notification type (conservative defaults).
    let status: 'active' | 'expired' | 'cancelled' = 'active'
    if (notificationType === 'EXPIRED') status = 'expired'
    if (notificationType === 'REVOKE' || notificationType === 'REFUND') status = 'cancelled'
    if (tx.revocationDateMs) status = 'cancelled'

    const endDateIso = tx.expiresDateMs ? new Date(tx.expiresDateMs).toISOString() : null
    const startDateIso = tx.purchaseDateMs ? new Date(tx.purchaseDateMs).toISOString() : nowIso

    const autoRenew =
      typeof renewal?.autoRenewStatus === 'boolean'
        ? renewal.autoRenewStatus
        : status === 'active'

    // Initialize Supabase admin client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Find subscription row to update.
    // Preferred keys:
    // - original_transaction_id (stable across renewals)
    // - user_id (appAccountToken == Supabase user id UUID) for extra safety
    const originalTransactionId = tx.originalTransactionId || null
    const appAccountToken = tx.appAccountToken || null

    let existing: any | null = null

    if (originalTransactionId) {
      let q = supabaseClient
        .from('user_subscriptions')
        .select('*')
        .eq('original_transaction_id', originalTransactionId)
        .limit(1)

      if (appAccountToken) {
        q = q.eq('user_id', appAccountToken)
      }

      const { data } = await q.maybeSingle()
      existing = data || null
    }

    if (!existing) {
      // Fallback: match by latest transaction_id
      const { data } = await supabaseClient
        .from('user_subscriptions')
        .select('*')
        .eq('transaction_id', tx.transactionId)
        .limit(1)
        .maybeSingle()
      existing = data || null
    }

    const updatePayload: Record<string, any> = {
      status,
      auto_renew: autoRenew,
      end_date: endDateIso,
      updated_at: nowIso,
      payment_method: 'ios_storekit',
      transaction_id: tx.transactionId,
      store_product_id: tx.productId,
      original_transaction_id: originalTransactionId,
      store_environment: tx.environment || null,
      store_bundle_id: tx.bundleId || null,
      store_last_event_at: nowIso,
    }

    // Only set start_date when we have a purchaseDate and we’re inserting a new row.
    if (existing) {
      const { error: updErr } = await supabaseClient
        .from('user_subscriptions')
        .update(updatePayload)
        .eq('id', existing.id)
      if (updErr) throw updErr
    } else {
      // If we can’t map to a user, we cannot safely create a row.
      if (!appAccountToken) {
        // Still return 200 to avoid Apple retry storms; log for investigation.
        console.warn('[ASSN] No matching subscription row and missing appAccountToken; cannot create row.')
        return new Response(JSON.stringify({ ok: true, skipped: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      const insertPayload: Record<string, any> = {
        user_id: appAccountToken,
        plan_id: planId || 'unknown',
        start_date: startDateIso,
        ...updatePayload,
      }
      const { error: insErr } = await supabaseClient
        .from('user_subscriptions')
        .insert(insertPayload)
      if (insErr) throw insErr
    }

    return new Response(
      JSON.stringify({
        ok: true,
        notificationType,
        subtype,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (e: any) {
    console.error('[ASSN] Error:', e?.message || e)
    // Return 200 to prevent Apple retry storms on transient issues,
    // but include ok:false so logs can catch it.
    return new Response(JSON.stringify({ ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

