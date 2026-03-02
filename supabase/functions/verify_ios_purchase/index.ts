// Supabase Edge Function: verify_ios_purchase
// Verifies iOS App Store purchase receipts and creates/updates subscriptions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLocalJWKSet, importPKCS8, jwtVerify, SignJWT } from "https://deno.land/x/jose@v4.15.5/index.ts";

const APPLE_VERIFY_RECEIPT_URL_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt"
const APPLE_VERIFY_RECEIPT_URL_PRODUCTION = "https://buy.itunes.apple.com/verifyReceipt"
const APPLE_STOREKIT_JWKS_URL_PROD =
  Deno.env.get('APPLE_TRANSACTION_JWKS_URL') ||
  "https://api.storekit.itunes.apple.com/inApps/v1/keys"
const APPLE_STOREKIT_JWKS_URL_SANDBOX =
  Deno.env.get('APPLE_TRANSACTION_JWKS_URL_SANDBOX') ||
  // NOTE:
  // Apple may return 401 from the sandbox JWKS host in some environments.
  // The production JWKS endpoint is sufficient for verifying StoreKit JWS signatures
  // across environments. Keep sandbox as an override only.
  "https://api.storekit.itunes.apple.com/inApps/v1/keys"

// App Store Server API transaction info endpoints (authenticated).
// These can be used as a fallback when JWKS fetch/verification is unavailable.
const APPLE_TRANSACTION_INFO_URL_PROD =
  Deno.env.get('APPLE_TRANSACTION_INFO_URL') ||
  'https://api.storekit.itunes.apple.com/inApps/v1/transactions/'
const APPLE_TRANSACTION_INFO_URL_SANDBOX =
  Deno.env.get('APPLE_TRANSACTION_INFO_URL_SANDBOX') ||
  'https://api.storekit-sandbox.itunes.apple.com/inApps/v1/transactions/'
// Expected bundle id for hardening (prevents accepting JWS for a different app)
const EXPECTED_BUNDLE_ID = Deno.env.get('IOS_BUNDLE_ID') || 'com.deephorizon.security'

// Apple JWKS endpoints may return 401 unless authenticated via an App Store Server API token.
// Configure these secrets in Supabase (Project Settings -> Edge Functions -> Secrets):
// - APPLE_IAP_KEY_ID: App Store Connect API Key ID (kid)
// - APPLE_IAP_ISSUER_ID: App Store Connect Issuer ID (iss)
// - APPLE_IAP_PRIVATE_KEY: the .p8 private key contents (including header/footer)
const APPLE_IAP_KEY_ID = Deno.env.get('APPLE_IAP_KEY_ID') || ''
const APPLE_IAP_ISSUER_ID = Deno.env.get('APPLE_IAP_ISSUER_ID') || ''
const APPLE_IAP_PRIVATE_KEY = Deno.env.get('APPLE_IAP_PRIVATE_KEY') || ''
const APPLE_SERVER_API_AUD = 'appstoreconnect-v1'

// Server-side mapping for integrity: planId -> productId
// (prevents clients from claiming a different plan for the same purchase)
const PLAN_ID_TO_PRODUCT_ID: Record<string, string> = {
  plan_RIADHZ91GxVCUn: 'com.deephorizon.security.individual.monthly.v1',
  plan_RIAOwgHa1uhibd: 'com.deephorizon.security.individual.yearly.v1',
  plan_RIADmXQMERsApy: 'com.deephorizon.security.family.monthly.v1',
  plan_RIAOC4tpe6q41z: 'com.deephorizon.security.family.yearly.v1',
}

interface RequestBody {
  // One of these must be provided:
  // - receipt: classic App Store receipt (base64)
  // - transactionJws: StoreKit 2 signed transaction JWS (preferred; works with Xcode StoreKit testing too)
  receipt?: string | null
  transactionJws?: string | null
  // transactionId from client is optional; authoritative id comes from Apple's signed payload/receipt.
  transactionId?: string
  productId: string
  planId: string
  plan: {
    id: string
    name: string
    type: 'individual' | 'family'
    billing_cycle: 'monthly' | 'yearly'
    price: number
    currency: string
  }
}

interface AppleVerifyResponse {
  status: number
  receipt?: {
    in_app?: Array<{
      transaction_id: string
      original_transaction_id?: string
      product_id: string
      purchase_date_ms: string
      expires_date_ms?: string
    }>
  }
  latest_receipt_info?: Array<{
    transaction_id: string
    original_transaction_id?: string
    product_id: string
    purchase_date_ms: string
    expires_date_ms?: string
  }>
}

type VerifiedTransaction = {
  productId: string
  transactionId: string
  originalTransactionId?: string
  purchaseDateMs: number
  expiresDateMs?: number
  environment?: string
  bundleId?: string
}

function isMissingTransactionIdColumn(err: any): boolean {
  const msg = String(err?.message || '')
  return err?.code === 'PGRST204' && msg.includes("'transaction_id'") && msg.includes("'user_subscriptions'")
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

// Simple in-memory cache (per Edge Function instance)
const jwksCache = new Map<string, JwksCacheEntry>()

// Cache Apple server API bearer token (short-lived)
let appleBearerCache: { token: string; expiresAtMs: number } | null = null
async function getAppleServerApiBearerToken(): Promise<string | null> {
  if (!APPLE_IAP_KEY_ID || !APPLE_IAP_ISSUER_ID || !APPLE_IAP_PRIVATE_KEY) return null

  const nowMs = Date.now()
  if (appleBearerCache && appleBearerCache.expiresAtMs > nowMs + 10_000) {
    return appleBearerCache.token
  }

  const privateKey = APPLE_IAP_PRIVATE_KEY.replace(/\\n/g, '\n')
  const key = await importPKCS8(privateKey, 'ES256')
  const nowSec = Math.floor(nowMs / 1000)
  const expSec = nowSec + 600 // 10 minutes

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
  return 3600 // default 1h
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000): Promise<{ json: any; headers: Headers }> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const bearer = await getAppleServerApiBearerToken()
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        // Some CDNs/services behave better with explicit Accept and a non-empty UA.
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

async function fetchAppleTransactionInfo(transactionId: string): Promise<{ signedTransactionInfo: string } | null> {
  const tid = String(transactionId || '').trim()
  if (!tid) return null

  const bearer = await getAppleServerApiBearerToken()
  if (!bearer) {
    // Without the server API token, we cannot call App Store Server API endpoints.
    return null
  }

  const tryFetch = async (base: string) => {
    const url = `${base}${encodeURIComponent(tid)}`
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 8000)
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
        throw new Error(`TransactionInfo fetch failed (${res.status}) from ${url}: ${text.slice(0, 200)}`)
      }
      const json = JSON.parse(text)
      return json as any
    } finally {
      clearTimeout(id)
    }
  }

  try {
    const prod = await tryFetch(APPLE_TRANSACTION_INFO_URL_PROD)
    if (prod?.signedTransactionInfo) return { signedTransactionInfo: String(prod.signedTransactionInfo) }
  } catch (e) {
    // continue to sandbox
    console.warn('[verify_ios_purchase] TransactionInfo prod fetch failed (non-fatal):', (e as any)?.message || e)
  }

  try {
    const sb = await tryFetch(APPLE_TRANSACTION_INFO_URL_SANDBOX)
    if (sb?.signedTransactionInfo) return { signedTransactionInfo: String(sb.signedTransactionInfo) }
  } catch (e) {
    console.warn('[verify_ios_purchase] TransactionInfo sandbox fetch failed (non-fatal):', (e as any)?.message || e)
  }

  return null
}

function verifiedFromSignedTransactionInfoUnsafe(signedTransactionInfo: string): VerifiedTransaction | null {
  const payload = decodeJwtPayloadUnsafe(signedTransactionInfo)
  if (!payload) return null

  const productId = String((payload as any)?.productId || '')
  const transactionId = String((payload as any)?.transactionId || '')
  const originalTransactionId = (payload as any)?.originalTransactionId
    ? String((payload as any).originalTransactionId)
    : undefined
  const purchaseDateMs = parseMs((payload as any)?.purchaseDate)
  const expiresDateMs = parseMs((payload as any)?.expiresDate)
  const environment = (payload as any)?.environment ? String((payload as any).environment) : undefined
  const bundleId = (payload as any)?.bundleId ? String((payload as any).bundleId) : undefined

  if (!productId || !transactionId || !purchaseDateMs) return null
  if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error('Bundle ID mismatch in signedTransactionInfo')
  }

  return {
    productId,
    transactionId,
    originalTransactionId,
    purchaseDateMs,
    expiresDateMs: expiresDateMs ?? undefined,
    environment,
    bundleId,
  }
}

async function getJwks(url: string): Promise<any> {
  const now = Date.now()
  const cached = jwksCache.get(url)
  if (cached && cached.expiresAtMs > now) return cached.jwks

  // Retry a few times (transient network/CDN issues)
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
      // basic backoff
      await new Promise((r) => setTimeout(r, 250 * (i + 1)))
    }
  }
  throw lastErr || new Error(`JWKS fetch failed for ${url}`)
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

async function verifyStoreKitTransactionJws(jws: string): Promise<VerifiedTransaction> {
  // Use the unverified payload only to pick the correct JWKS host (prod vs sandbox).
  // We still fully verify the signature before trusting any fields.
  const unsafe = decodeJwtPayloadUnsafe(jws)
  const envHint = String(unsafe?.environment || '').toLowerCase()
  const preferredUrl =
    envHint === 'sandbox' || envHint === 'xcode'
      ? APPLE_STOREKIT_JWKS_URL_SANDBOX
      : APPLE_STOREKIT_JWKS_URL_PROD

  const attemptVerify = async (jwksUrl: string) => {
    const jwks = await getJwks(jwksUrl)
    const JWKS = createLocalJWKSet(jwks as any)
    return await jwtVerify(jws, JWKS, {} as any)
  }

  let payload: any
  try {
    ;({ payload } = await attemptVerify(preferredUrl))
  } catch (e) {
    // Fallback: try the other environment JWKS once (helps when envHint missing/incorrect)
    const fallbackUrl = preferredUrl === APPLE_STOREKIT_JWKS_URL_PROD ? APPLE_STOREKIT_JWKS_URL_SANDBOX : APPLE_STOREKIT_JWKS_URL_PROD
    ;({ payload } = await attemptVerify(fallbackUrl))
  }

  const productId = String((payload as any)?.productId || '');
  const transactionId = String((payload as any)?.transactionId || '');
  const originalTransactionId = (payload as any)?.originalTransactionId
    ? String((payload as any).originalTransactionId)
    : undefined;
  const purchaseDateMs = parseMs((payload as any)?.purchaseDate);
  const expiresDateMs = parseMs((payload as any)?.expiresDate);
  const environment = (payload as any)?.environment ? String((payload as any).environment) : undefined;
  const bundleId = (payload as any)?.bundleId ? String((payload as any).bundleId) : undefined;

  if (!productId || !transactionId || !purchaseDateMs) {
    throw new Error('Invalid StoreKit transaction JWS payload')
  }
  if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error('Bundle ID mismatch in StoreKit transaction JWS')
  }

  return {
    productId,
    transactionId,
    originalTransactionId,
    purchaseDateMs,
    expiresDateMs: expiresDateMs ?? undefined,
    environment,
    bundleId,
  }
}

serve(async (req) => {
  // Handle CORS
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
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: RequestBody = await req.json()
    const { receipt, transactionJws, transactionId, productId, planId, plan } = body

    if ((!receipt && !transactionJws) || !productId || !planId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Integrity check: ensure planId maps to the claimed productId
    const expectedProductId = PLAN_ID_TO_PRODUCT_ID[planId]
    if (expectedProductId && expectedProductId !== productId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Plan/Product mismatch' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify purchase with Apple:
    // 1) Preferred (production-ready): Verify StoreKit 2 transaction JWS signature with Apple's JWKS.
    //    This works in Xcode StoreKit testing ("environmentIOS":"Xcode") and on real devices.
    // 2) Fallback: Verify classic receipt with verifyReceipt endpoints (legacy).
    let verified: VerifiedTransaction | null = null
    let isSandbox = false
    let jwsVerifyError: string | null = null

    if (transactionJws) {
      // IMPORTANT:
      // Apple’s JWKS endpoint (/inApps/v1/keys) is unreliable from some edge environments (401/404).
      // To keep production robust AND avoid noisy warnings, we prefer the authenticated
      // App Store Server API Transaction Info endpoint first. It returns Apple-signed data over TLS,
      // and is sufficient for server-side verification when authenticated with APPLE_IAP_*.
      const tidFromBody = transactionId || ''
      const tidFromJws = String((decodeJwtPayloadUnsafe(transactionJws) as any)?.transactionId || '')
      const tid = tidFromBody || tidFromJws

      if (tid) {
        try {
          const info = await fetchAppleTransactionInfo(tid)
          if (info?.signedTransactionInfo) {
            const v = verifiedFromSignedTransactionInfoUnsafe(info.signedTransactionInfo)
            if (v) {
              verified = v
              isSandbox =
                (verified.environment || '').toLowerCase() === 'sandbox' ||
                (verified.environment || '').toLowerCase() === 'xcode'
            }
          }
        } catch (e: any) {
          // Non-fatal; fall back to JWS verification or receipt.
          jwsVerifyError = e?.message ? String(e.message) : String(e)
        }
      }

      // Fallback: verify StoreKit JWS signature using JWKS (may fail with 401/404).
      if (!verified) {
        try {
          verified = await verifyStoreKitTransactionJws(transactionJws)
          isSandbox =
            (verified.environment || '').toLowerCase() === 'sandbox' ||
            (verified.environment || '').toLowerCase() === 'xcode'
        } catch (e: any) {
          // Do not warn here (it can be noisy due to JWKS 404); only surface if ALL methods fail.
          jwsVerifyError = e?.message ? String(e.message) : String(e)
          verified = null
        }
      }
    }

    if (!verified && receipt) {
      // Legacy receipt verification fallback (requires shared secret)
      const appleSharedSecret = Deno.env.get('APPLE_SHARED_SECRET')
      if (!appleSharedSecret) {
        console.error('APPLE_SHARED_SECRET not configured (needed for receipt fallback)')
        return new Response(
          JSON.stringify({ success: false, error: 'Server configuration error (missing APPLE_SHARED_SECRET)' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Verify receipt with Apple (try production first, then sandbox)
      let appleResponse: AppleVerifyResponse | null = null

      const productionResponse = await fetch(APPLE_VERIFY_RECEIPT_URL_PRODUCTION, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'receipt-data': receipt,
          'password': appleSharedSecret,
          'exclude-old-transactions': true,
        }),
      })
      const productionData: AppleVerifyResponse = await productionResponse.json()

      // Status 21007 means receipt is from sandbox, try sandbox URL
      if (productionData.status === 21007) {
        isSandbox = true
        const sandboxResponse = await fetch(APPLE_VERIFY_RECEIPT_URL_SANDBOX, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            'receipt-data': receipt,
            'password': appleSharedSecret,
            'exclude-old-transactions': true,
          }),
        })
        appleResponse = await sandboxResponse.json()
      } else {
        appleResponse = productionData
      }

      // Check if receipt is valid
      if (!appleResponse || appleResponse.status !== 0) {
        console.error('Apple receipt verification failed:', appleResponse?.status)
        return new Response(
          JSON.stringify({
            success: false,
            error: `Receipt verification failed: ${appleResponse?.status || 'Unknown error'}`
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Find the transaction in the receipt
      const latestReceiptInfo = appleResponse.latest_receipt_info || appleResponse.receipt?.in_app || []
      const transaction = latestReceiptInfo.find(
        (t) => t.transaction_id === transactionId && t.product_id === productId
      )

      if (!transaction) {
        return new Response(
          JSON.stringify({ success: false, error: 'Transaction not found in receipt' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }

      const purchaseDateMs = parseMs(transaction.purchase_date_ms)
      const expiresDateMs = parseMs(transaction.expires_date_ms)
      if (!purchaseDateMs) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid purchase date in receipt' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      verified = {
        productId: transaction.product_id,
        transactionId: transaction.transaction_id,
        originalTransactionId: transaction.original_transaction_id ? String(transaction.original_transaction_id) : undefined,
        purchaseDateMs,
        expiresDateMs: expiresDateMs ?? undefined,
      }
    }

    if (!verified) {
      return new Response(
        JSON.stringify({
          success: false,
          error: jwsVerifyError
            ? `Unable to verify purchase (StoreKit verification unavailable): ${jwsVerifyError}`
            : 'Unable to verify purchase',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Harden checks: ensure the verified product matches the request
    if (verified.productId !== productId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product mismatch during verification' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    // If client provided a transactionId, ensure it matches Apple’s verified value.
    if (transactionId && verified.transactionId !== transactionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Transaction mismatch during verification' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Anti-replay: a StoreKit transaction (or original transaction) must not be claimed by another user.
    // This prevents account-sharing/abuse if a JWS leaks.
    try {
      const txFilters: any[] = [];
      txFilters.push(`transaction_id.eq.${verified.transactionId}`);
      if (verified.originalTransactionId) {
        txFilters.push(`original_transaction_id.eq.${verified.originalTransactionId}`);
      }

      // PostgREST OR filter: "or=(a,b)"
      const or = txFilters.join(',');
      const { data: otherClaims, error: claimErr } = await supabaseClient
        .from('user_subscriptions')
        .select('id,user_id')
        .or(or)
        .limit(5);

      if (!claimErr && Array.isArray(otherClaims)) {
        const claimedByOther = otherClaims.find((r: any) => r?.user_id && r.user_id !== user.id);
        if (claimedByOther) {
          return new Response(
            JSON.stringify({ success: false, error: 'Transaction already linked to another account' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          )
        }
      }
    } catch {
      // If this check fails unexpectedly, do not block legitimate purchases, but log for review.
      console.warn('Anti-replay check failed (non-fatal)');
    }

    // Prefer authoritative expiry from StoreKit/receipt where available.
    const purchaseDate = new Date(verified.purchaseDateMs)
    let endDate: Date | null = null
    if (verified.expiresDateMs) {
      endDate = new Date(verified.expiresDateMs)
    } else {
      // If expiresDate is missing (shouldn't be for auto-renewable subs), fall back to billing_cycle
      endDate = new Date(purchaseDate)
      if (plan.billing_cycle === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1)
      } else if (plan.billing_cycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1)
      }
    }

    // Find existing subscription row to update (prefer original_transaction_id; else current active)
    let existingSubscription: any | null = null
    if (verified.originalTransactionId) {
      const { data } = await supabaseClient
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('original_transaction_id', verified.originalTransactionId)
        .maybeSingle()
      existingSubscription = data || null
    }
    if (!existingSubscription) {
      const { data } = await supabaseClient
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      existingSubscription = data || null
    }

    let subscription

    if (existingSubscription) {
      // Update existing subscription
      let updatePayload: any = {
          plan_id: planId,
          start_date: purchaseDate.toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: true,
          payment_method: 'ios_storekit',
          transaction_id: verified.transactionId,
          store_product_id: verified.productId,
          original_transaction_id: verified.originalTransactionId ?? existingSubscription.original_transaction_id ?? null,
          store_environment: verified.environment ?? existingSubscription.store_environment ?? null,
          store_bundle_id: verified.bundleId ?? existingSubscription.store_bundle_id ?? null,
          store_last_verified_at: new Date().toISOString(),
          store_last_event_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

      let { data: updatedSubscription, error: updateError } = await supabaseClient
        .from('user_subscriptions')
        .update(updatePayload)
        .eq('id', existingSubscription.id)
        .select()
        .single()

      if (updateError && isMissingTransactionIdColumn(updateError)) {
        // Backward-compat: older schemas may not have transaction_id.
        // Retry without it so purchases can still be activated.
        delete updatePayload.transaction_id
        ;({ data: updatedSubscription, error: updateError } = await supabaseClient
          .from('user_subscriptions')
          .update(updatePayload)
          .eq('id', existingSubscription.id)
          .select()
          .single())
      }

      if (updateError) {
        console.error('Error updating subscription:', updateError)
        throw updateError
      }

      subscription = updatedSubscription
    } else {
      // Create new subscription
      let insertPayload: any = {
          user_id: user.id,
          plan_id: planId,
          status: 'active',
          start_date: purchaseDate.toISOString(),
          end_date: endDate ? endDate.toISOString() : null,
          auto_renew: true,
          payment_method: 'ios_storekit',
          transaction_id: verified.transactionId,
          store_product_id: verified.productId,
          original_transaction_id: verified.originalTransactionId ?? null,
          store_environment: verified.environment ?? null,
          store_bundle_id: verified.bundleId ?? null,
          store_last_verified_at: new Date().toISOString(),
          store_last_event_at: new Date().toISOString(),
        }

      let { data: newSubscription, error: insertError } = await supabaseClient
        .from('user_subscriptions')
        .insert(insertPayload)
        .select()
        .single()

      if (insertError && isMissingTransactionIdColumn(insertError)) {
        delete insertPayload.transaction_id
        ;({ data: newSubscription, error: insertError } = await supabaseClient
          .from('user_subscriptions')
          .insert(insertPayload)
          .select()
          .single())
      }

      if (insertError) {
        console.error('Error creating subscription:', insertError)
        throw insertError
      }

      subscription = newSubscription
    }

    // Return success with subscription
    return new Response(
      JSON.stringify({
        success: true,
        subscription,
        isSandbox,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (error: any) {
    console.error('Error in verify_ios_purchase:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  }
})
