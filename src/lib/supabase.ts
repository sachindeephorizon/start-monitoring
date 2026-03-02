/**
 * Supabase Client Configuration — ZERO-LOGOUT ARCHITECTURE
 *
 * SINGLE AUTH AUTHORITY for the DeepHorizon mobile security platform.
 * All token refresh, session validation, and SDK mutex coordination live here.
 * No service-level refreshSession calls are permitted.
 *
 * Architecture guarantees:
 * - No logout when token expires in background
 * - No logout during refreshSession race conditions
 * - No logout from SIGNED_OUT event storms
 * - No logout when app resumes after long inactivity
 * - No logout from SDK mutex deadlocks
 * - No logout from concurrent ensureValidSession() calls
 *
 * Session is ONLY destroyed when:
 * 1. User explicitly signs out (markExplicitSignOut → signOut)
 * 2. Refresh token is truly revoked by backend (verified via refresh attempt)
 *
 * MOBILE-FIRST: Expo React Native only. detectSessionInUrl=false.
 * No browser session logic. No URL-based auth detection.
 *
 * IMPORTANT: Real-time subscriptions are ONLY active when the app
 * is in the foreground. Background updates are handled via push
 * notifications.
 */

import { createClient, Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { AuthSession } from '@/core/auth/auth.session';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: ENVIRONMENT & CLIENT INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

// Exported for raw REST API calls that bypass the SDK lock
export const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  '';

export const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  if (__DEV__) {
    console.warn(
      '[Supabase] URL or Anon Key missing. ' +
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env.',
    );
  }
}

/**
 * Supabase client instance — MOBILE-FIRST configuration.
 *
 * autoRefreshToken: true  — SDK manages its internal refresh timer.
 * persistSession: true    — uses AsyncStorage for SDK's own persistence.
 * detectSessionInUrl: false — mobile app, no URL-based detection.
 *
 * WHY autoRefreshToken stays true:
 * The SDK's internal timer is unreliable in React Native (killed on background,
 * coalesced by OS). However, it provides a baseline safety net. This file layers
 * enterprise-grade proactive refresh ON TOP of the SDK's basic support.
 * Disabling it would remove the safety net with no upside.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: SDK MUTEX BARRIER
//
// ALL SDK auth mutations (setSession, refreshSession, signOut) MUST be wrapped:
//
//   beginSdkSync();
//   try { /* mutation */ } finally { completeSdkSync(success); }
//
// WHY this prevents logouts:
// - Supabase GoTrueClient has an internal _callRefreshToken mutex.
// - Concurrent setSession/refreshSession calls queue behind this mutex.
// - If a queued call times out waiting for the lock, the SDK fires SIGNED_OUT.
// - Service queries during a token swap get the OLD (stale) session.
// - The barrier ensures ALL consumers wait until the mutation is done,
//   then proceed with the fresh session — no races, no stale tokens.
// ═══════════════════════════════════════════════════════════════════════════════

let _sdkReadyResolve: ((value: boolean) => void) | null = null;
let _sdkReadyPromise: Promise<boolean> | null = null;
let _sdkReady = true;

/**
 * Wait for SDK auth state to be stable (no setSession/refreshSession in flight).
 * Returns immediately if no sync is in progress.
 *
 * EVENT-DRIVEN: resolves when completeSdkSync() is called.
 * 15s timeout is a DEADLOCK SAFETY NET — force-cleans module state so
 * subsequent callers don't queue behind an orphaned promise forever.
 */
export async function waitForSdkReady(): Promise<boolean> {
  if (_sdkReady && !_sdkReadyPromise) return true;
  if (!_sdkReadyPromise) return true;

  const targetPromise = _sdkReadyPromise;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<boolean>((resolve) => {
    timeoutId = setTimeout(() => {
      // DEADLOCK SAFETY NET — should never fire in normal operation.
      // Only force-complete if the same sync is still active.
      if (_sdkReadyPromise === targetPromise && !_sdkReady) {
        if (__DEV__) {
          console.error(
            '[Supabase] DEADLOCK: waitForSdkReady safety net (15s) — force-completing',
          );
        }
        completeSdkSync(false);
        resolve(false);
        return;
      }
      resolve(true);
    }, 15_000);
  });

  const result = await Promise.race([targetPromise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  return result;
}

/**
 * Signal that an SDK auth mutation is starting.
 * Creates a barrier that services await via waitForSdkReady().
 *
 * Self-healing: if a previous sync was orphaned (no completeSdkSync),
 * resolves old waiters first to prevent cascading hangs.
 */
export function beginSdkSync(): void {
  if (_sdkReadyResolve) {
    // Previous sync never completed — resolve old waiters so they don't hang.
    _sdkReadyResolve(true);
    _sdkReadyResolve = null;
  }
  _sdkReady = false;
  _sdkReadyPromise = new Promise<boolean>((resolve) => {
    _sdkReadyResolve = resolve;
  });
}

/**
 * Signal that an SDK auth mutation completed.
 * Resolves the barrier so all waiting services can proceed.
 */
export function completeSdkSync(success: boolean = true): void {
  _sdkReady = true;
  if (_sdkReadyResolve) {
    _sdkReadyResolve(success);
    _sdkReadyResolve = null;
  }
  _sdkReadyPromise = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: ZERO-LOGOUT REFRESH GUARD
//
// Singleton refresh — prevents "refresh storms" on foreground resume.
//
// WITHOUT this guard (actual production failure scenario):
//   1. App returns to foreground after 2+ hours
//   2. 15+ hooks/services call ensureValidSession() simultaneously
//   3. Each detects expired token → calls supabase.auth.refreshSession()
//   4. First call consumes the refresh token (rotation enabled)
//   5. All subsequent calls get "invalid refresh token" error
//   6. SDK fires SIGNED_OUT for EACH failed refresh → cascade event storm
//   7. Auth context processes first SIGNED_OUT → user logged out
//
// WITH this guard:
//   1. First caller starts the refresh, gets the guard promise
//   2. All subsequent callers await the SAME promise
//   3. ONE refresh call → ONE new token → ONE success result shared by all
//   4. Zero SIGNED_OUT events → zero logout risk
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Typed refresh result ────────────────────────────────────────────────

export type RefreshFailureReason =
  | 'ok'
  | 'invalid_refresh'
  | 'network'
  | 'timeout'
  | 'unknown';

export interface GuardedRefreshResult {
  session: Session | null;
  reason: RefreshFailureReason;
  error?: unknown;
}

/**
 * Classify a refresh error into a structured failure reason.
 * Callers use this to distinguish unrecoverable auth errors
 * (invalid refresh token → must logout) from transient failures
 * (network/timeout → keep session, retry later).
 */
function classifyRefreshError(err: any): RefreshFailureReason {
  if (!err) return 'unknown';
  const msg = String(err?.message || '').toLowerCase();
  const status = Number(err?.status ?? err?.statusCode ?? 0);

  // Definitive auth death — refresh token revoked or invalid
  if (
    status === 400 ||
    status === 403 ||
    (status === 401 &&
      (msg.includes('invalid refresh token') ||
        msg.includes('refresh token is not found') ||
        msg.includes('token is expired') ||
        msg.includes('invalid claim'))) ||
    msg.includes('invalid refresh token') ||
    (msg.includes('refresh token') && msg.includes('not found'))
  ) {
    return 'invalid_refresh';
  }

  if (msg.includes('abort') || msg.includes('timed out') || msg.includes('timeout')) {
    return 'timeout';
  }

  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('socket') ||
    msg.includes('econn')
  ) {
    return 'network';
  }

  return 'unknown';
}

// ─── Singleton refresh guard ─────────────────────────────────────────────

let _refreshGuardPromise: Promise<GuardedRefreshResult> | null = null;

/**
 * Guarded token refresh — singleton pattern, with typed failure reason.
 *
 * Only ONE refreshSession() runs across the entire app at any time.
 * All concurrent callers share the same result.
 *
 * Strategy:
 * 1. Try SDK refreshSession() (uses AsyncStorage refresh token)
 * 2. If that fails, try SecureStore refresh token (may be fresher)
 * 3. If both fail, return reason (invalid_refresh / network / timeout / unknown)
 *
 * Callers use `reason` to decide:
 *   'ok'              → session is valid
 *   'invalid_refresh' → token truly dead → force logout
 *   'network'|'timeout'|'unknown' → transient → keep session, retry later
 */
export function guardedRefreshDetailed(): Promise<GuardedRefreshResult> {
  if (_refreshGuardPromise) return _refreshGuardPromise;

  _refreshGuardPromise = _guardedRefreshImplDetailed().finally(() => {
    _refreshGuardPromise = null;
  });

  return _refreshGuardPromise;
}

/**
 * Backward-compatible wrapper — returns Session | null.
 * Prefer guardedRefreshDetailed() for new code that needs the failure reason.
 */
export function guardedRefresh(): Promise<Session | null> {
  return guardedRefreshDetailed().then((r) => r.session);
}

async function _guardedRefreshImplDetailed(): Promise<GuardedRefreshResult> {
  const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // If another SDK sync is already in progress (e.g. boot), wait for it.
  if (!_sdkReady && _sdkReadyPromise) {
    if (__DEV__) console.log('[Supabase] guardedRefresh: waiting for existing SDK sync...');
    await waitForSdkReady();

    // After the existing sync completed, check if we even need a refresh.
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const expiresAt = data.session.expires_at ?? 0;
        const nowSec = Math.floor(Date.now() / 1000);
        if (expiresAt - nowSec > 120) {
          if (__DEV__) console.log('[Supabase] guardedRefresh: session already valid after sync');
          return { session: data.session, reason: 'ok' };
        }
      }
    } catch {
      // Fall through to refresh
    }
  }

  beginSdkSync();
  let sdkError: any = null;
  let fallbackError: any = null;

  try {
    // Attempt 1: SDK refreshSession (uses AsyncStorage refresh token)
    const { data, error } = await withTimeout(
      supabase.auth.refreshSession(),
      8_000,
      'supabase.auth.refreshSession',
    );
    sdkError = error;

    if (!error && data?.session) {
      if (__DEV__) console.log('[Supabase] guardedRefresh: SDK refresh succeeded');
      try {
        await AuthSession.save(data.session);
      } catch (saveErr) {
        if (__DEV__)
          console.warn('[Supabase] guardedRefresh: SecureStore save failed (non-fatal):', saveErr);
      }
      return { session: data.session, reason: 'ok' };
    }

    // Attempt 2: SecureStore refresh token fallback.
    if (__DEV__)
      console.warn('[Supabase] guardedRefresh: SDK refresh failed, trying SecureStore fallback');

    try {
      const stored = await AuthSession.load();
      if (stored?.refresh_token) {
        const { data: fallbackData, error: fbErr } = await withTimeout(
          supabase.auth.refreshSession({
            refresh_token: stored.refresh_token,
          }),
          8_000,
          'supabase.auth.refreshSession(fallback)',
        );
        fallbackError = fbErr;

        if (!fbErr && fallbackData?.session) {
          if (__DEV__) console.log('[Supabase] guardedRefresh: SecureStore fallback succeeded');
          await AuthSession.save(fallbackData.session);
          return { session: fallbackData.session, reason: 'ok' };
        }
      }
    } catch (fbErr) {
      fallbackError = fbErr;
      if (__DEV__)
        console.warn('[Supabase] guardedRefresh: SecureStore fallback failed:', fbErr);
    }

    // Both attempts failed — classify WHY
    const reason1 = classifyRefreshError(sdkError);
    const reason2 = classifyRefreshError(fallbackError);
    const reason: RefreshFailureReason =
      reason1 === 'invalid_refresh' || reason2 === 'invalid_refresh'
        ? 'invalid_refresh'
        : reason1 !== 'unknown'
          ? reason1
          : reason2 !== 'unknown'
            ? reason2
            : 'unknown';

    if (__DEV__) console.warn('[Supabase] guardedRefresh: all attempts failed, reason:', reason);
    return { session: null, reason, error: fallbackError || sdkError };
  } catch (e) {
    if (__DEV__) console.warn('[Supabase] guardedRefresh: unexpected error:', e);
    return { session: null, reason: classifyRefreshError(e), error: e };
  } finally {
    completeSdkSync(true);
  }
}

/**
 * Check if a guarded refresh is currently in progress.
 * Used by auth.context.tsx to avoid starting redundant refreshes.
 */
export function isRefreshInProgress(): boolean {
  return _refreshGuardPromise !== null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: SIGNED_OUT HARDENING
//
// Supabase SDK fires SIGNED_OUT in many NON-LOGOUT scenarios:
//
//   Scenario                       | Real logout? | Action
//   -------------------------------|-------------|---------------------------
//   Token refresh failure (network)| NO          | Retry with guardedRefresh
//   setSession with expired JWT    | NO          | Boot handles recovery
//   Internal mutex timeout         | NO          | Self-heals on next call
//   Multiple concurrent refreshes  | NO          | Prevented by refresh guard
//   User taps "Sign Out"           | YES         | Clear everything
//   Backend revokes refresh token  | YES         | guardedRefresh returns null
//
// This section provides an explicit signout flag that auth.context.tsx uses
// to distinguish real sign-outs from SDK event noise.
//
// RULE: Only clear session and show auth screen when:
//   isExplicitSignOut() === true
//   OR guardedRefresh() returns null (token truly dead)
// ═══════════════════════════════════════════════════════════════════════════════

let _explicitSignOut = false;

/**
 * Mark that a user-initiated sign-out is happening.
 * Call this BEFORE supabase.auth.signOut().
 *
 * WHY this prevents false logouts:
 * When auth.context.tsx SIGNED_OUT handler fires, it checks this flag.
 * true  → real logout: clear SecureStore, clear profile, show auth screen
 * false → SDK noise: attempt guardedRefresh() recovery before doing anything
 */
export function markExplicitSignOut(): void {
  _explicitSignOut = true;
}

/**
 * Check if the current/recent SIGNED_OUT was user-initiated.
 */
export function isExplicitSignOut(): boolean {
  return _explicitSignOut;
}

/**
 * Reset the explicit sign-out flag.
 * Called after successful login or after SIGNED_OUT is processed.
 */
export function clearExplicitSignOut(): void {
  _explicitSignOut = false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: FOREGROUND / BACKGROUND RESILIENCE
//
// PROBLEM: When app goes to background on iOS/Android:
//   - OS kills JavaScript timers → SDK auto-refresh stops silently
//   - Realtime WebSocket connections are terminated by the OS
//   - Token can expire during hours/days of inactivity
//   - On foreground resume, multiple services call ensureValidSession()
//   - SDK detects expired token, fires SIGNED_OUT before refresh completes
//
// SOLUTION: Centralized foreground resume handler that runs ONCE (deduplicated).
//   1. Wait for any in-progress SDK sync (boot may still be running)
//   2. Proactively refresh if token expires within 120 seconds
//   3. Restart SDK auto-refresh timer (killed by OS in background)
//   4. Let services proceed with a guaranteed-fresh token
//
// This runs BEFORE services call ensureValidSession(), so by the time
// they do, the token is already fresh — no races, no storms.
// ═══════════════════════════════════════════════════════════════════════════════

let _foregroundResumePromise: Promise<void> | null = null;
let _appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
let _lastAppState: AppStateStatus = AppState.currentState;

/**
 * Initialize centralized AppState monitoring.
 * Call once during app boot (in auth.context.tsx Effect 1).
 *
 * Handles:
 * - Proactive token refresh on foreground resume (120s window)
 * - SDK auto-refresh timer restart (killed by OS in background)
 * - Deduplicated: multiple foreground events share one handler
 *
 * WHY this lives in supabase.ts (not auth.context.tsx):
 * This file is the SINGLE AUTH AUTHORITY. All refresh logic lives here.
 * auth.context.tsx manages UI state (appState, profile, navigation).
 * Token refresh is infrastructure, not UI concern.
 */
export function initAppStateMonitoring(): void {
  if (_appStateSubscription) return; // Idempotent

  _appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
    const wasBg = _lastAppState === 'background' || _lastAppState === 'inactive';
    _lastAppState = nextAppState;

    if (nextAppState === 'active' && wasBg) {
      _handleForegroundResume();
    }
  });
}

async function _handleForegroundResume(): Promise<void> {
  // Deduplicate: only one foreground resume handler at a time.
  // Multiple rapid foreground events (e.g. user switching apps quickly)
  // all share the same promise — no thundering herd.
  if (_foregroundResumePromise) return;

  _foregroundResumePromise = (async () => {
    try {
      // Wait for any in-progress SDK sync (boot may still be running)
      await waitForSdkReady();

      // If user explicitly signed out while backgrounded, don't refresh
      if (_explicitSignOut) return;

      // Check current session — proactive refresh if expiring within 120s
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session;

        if (!session?.user) {
          // No session in SDK memory — don't force logout.
          // SecureStore may still have valid tokens. auth.context.tsx
          // handles recovery via its boot/INITIAL_SESSION flow.
          return;
        }

        const expiresAt = session.expires_at ?? 0;
        const nowSec = Math.floor(Date.now() / 1000);
        const secondsLeft = expiresAt - nowSec;

        if (secondsLeft < 120) {
          if (__DEV__)
            console.log(
              `[Supabase] Foreground resume: token expires in ${secondsLeft}s — proactive refresh`,
            );
          await guardedRefresh();
        }
      } catch (e) {
        if (__DEV__)
          console.warn('[Supabase] Foreground resume: session check failed (non-fatal):', e);
      }

      // Restart SDK auto-refresh timer.
      // WHY: iOS/Android kill timers when app is backgrounded.
      // startAutoRefresh() creates a new timer that fires before token expires.
      // Without this, the SDK's internal refresh never runs after background.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.auth as any).startAutoRefresh?.();
      } catch {
        // startAutoRefresh may not exist on all SDK versions — non-fatal
      }
    } catch (e) {
      if (__DEV__) console.warn('[Supabase] Foreground resume handler failed:', e);
    }
  })().finally(() => {
    _foregroundResumePromise = null;
  });
}

/**
 * Cleanup AppState monitoring. Call on app teardown if needed.
 */
export function cleanupAppStateMonitoring(): void {
  _appStateSubscription?.remove();
  _appStateSubscription = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: TYPE-SAFE SESSION VALIDATION (ensureValidSession)
//
// The core function ALL services call before authenticated queries.
//
// FLOW:
//   1. Wait for SDK mutex barrier    → no lock contention
//   2. Wait for in-progress refresh  → no double-refresh
//   3. Get session from SDK          → instant (~1ms, barrier resolved)
//   4. Token valid (>120s)           → return Session immediately
//   5. Token expiring (<120s)        → proactive guardedRefresh()
//   6. No SDK session                → FallbackIdentity from SecureStore
//   7. Nothing at all                → return null
//
// GUARANTEES:
//   - NEVER throws — returns null on failure
//   - NEVER triggers logout — that's auth.context.tsx's job
//   - NEVER starts more than one refresh — singleton guard
//   - NEVER blocks on SDK mutex — waits for barrier first
//   - Deduplicated — concurrent callers share one promise
//
// WHY 120 SECONDS (not 60):
//   Enterprise mobile safety buffer. In production:
//   - Network latency can be 2-5s on cellular
//   - The refresh HTTP round-trip adds 1-3s
//   - SDK setSession internal processing adds 0.5-1s
//   - Total: up to 9s from refresh trigger to usable token
//   - 60s buffer leaves only 51s of margin — too tight
//   - 120s buffer leaves 111s — survives slow networks, retries
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fallback identity returned when SDK session is unavailable but
 * SecureStore has stored tokens. This happens during:
 *   - SDK boot sync (setSession in progress)
 *   - SDK mutex contention (another auth op in flight)
 *   - AsyncStorage corruption (SDK lost its session)
 *
 * IMPORTANT: Marked with isFallbackIdentity=true.
 * Services SHOULD check this flag before making RLS-protected queries.
 * The access_token MAY be expired — Supabase RLS will return empty results.
 *
 * SAFE FOR:    user ID lookups, identity checks, non-auth reads
 * UNSAFE FOR:  RLS-protected queries (may get empty results or 401)
 */
export interface FallbackIdentity {
  isFallbackIdentity: true;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: {
    id: string;
    email: string;
    phone?: string;
    user_metadata: Record<string, unknown>;
  };
}

/**
 * Return type for ensureValidSession().
 * Callers can check `'isFallbackIdentity' in session` to distinguish.
 *
 * WHY a union type (not just Session | null):
 * Returning null when SecureStore has tokens would break services that
 * only need user.id (e.g. for Supabase queries using the SDK's internal
 * session). The FallbackIdentity provides the user.id while clearly
 * marking that this is NOT a live SDK session.
 */
export type SessionOrFallback = Session | FallbackIdentity | null;

// Deduplicate concurrent ensureValidSession() calls.
// WHY: On foreground resume, 15+ hooks/services call simultaneously.
// Without dedup: 15 parallel getSession() calls, each hitting SDK lock.
// With dedup: all share one promise, one getSession call, instant result.
let _ensureValidSessionPromise: Promise<SessionOrFallback> | null = null;

/**
 * Ensure the current session has a valid (non-expired) access token.
 *
 * Call this before making Supabase data queries (supabase.from()) to
 * guarantee the SDK has a fresh token for RLS.
 *
 * Returns Session (valid), FallbackIdentity (degraded), or null (no auth).
 * NEVER throws. NEVER triggers logout.
 */
export function ensureValidSession(): Promise<SessionOrFallback> {
  if (_ensureValidSessionPromise) return _ensureValidSessionPromise;
  _ensureValidSessionPromise = _ensureValidSessionImpl().finally(() => {
    _ensureValidSessionPromise = null;
  });
  return _ensureValidSessionPromise;
}

async function _ensureValidSessionImpl(): Promise<SessionOrFallback> {
  // Step 1: Wait for SDK mutex barrier.
  // If boot or login is syncing tokens, we wait here until they're done.
  // After the barrier resolves, getSession() is instant (~1ms).
  const sdkReady = await waitForSdkReady();

  // Step 2: If a refresh is already in progress, await it.
  // WHY: querying with a stale token while refresh is in flight causes
  // RLS failures. Waiting 1-3s for the refresh is better than a failed query.
  if (_refreshGuardPromise) {
    const result = await _refreshGuardPromise;
    if (result.session) return result.session;
    // Refresh failed — fall through to try getSession (might still work)
  }

  // Step 3: Get session from SDK
  let session: Session | null = null;

  if (sdkReady) {
    try {
      const { data } = await supabase.auth.getSession();
      session = data?.session ?? null;
    } catch (e) {
      if (__DEV__) console.warn('[Supabase] ensureValidSession: getSession failed:', e);
    }
  } else {
    if (__DEV__) console.warn('[Supabase] ensureValidSession: SDK sync failed/timed out');
  }

  // Step 4: No SDK session — return SecureStore fallback identity.
  // WHY not null: Services that only need user.id (most of them) can still
  // proceed. The SDK's internal session (AsyncStorage) may still be valid
  // for RLS queries even though getSession() failed (lock contention, etc).
  if (!session?.user) {
    return _buildFallbackIdentity();
  }

  // Step 5: Check token expiration with PROACTIVE 120s refresh window
  const expiresAt = session.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const secondsLeft = expiresAt - nowSec;

  // Token has > 120 seconds remaining — safe to use as-is
  if (secondsLeft > 120) return session;

  // Step 6: Token expiring within 120s — proactive refresh.
  // WHY proactive: If we wait until expiry, the next query will fail
  // while the refresh runs. By refreshing 120s early, the token is
  // always fresh when services need it.
  if (__DEV__)
    console.log(`[Supabase] ensureValidSession: token expires in ${secondsLeft}s — refreshing`);

  const refreshed = await guardedRefresh();
  if (refreshed) return refreshed;

  // Step 7: Refresh failed but token might still have marginal validity.
  // WHY return it: A 30s-remaining token is better than null.
  // The query will succeed if it completes before expiry.
  if (secondsLeft > 0) return session;

  // Step 8: Token fully expired AND refresh failed → SecureStore fallback.
  // The access_token in SecureStore is also expired, but user.id is still valid.
  // Services can at least identify the user and show appropriate UI.
  return _buildFallbackIdentity();
}

/**
 * Build a FallbackIdentity from SecureStore.
 * Returns null if no stored session exists.
 */
async function _buildFallbackIdentity(): Promise<FallbackIdentity | null> {
  try {
    const stored = await AuthSession.load();
    if (stored?.access_token && stored?.user?.id) {
      if (__DEV__)
        console.log('[Supabase] ensureValidSession: SecureStore fallback for', stored.user.id);
      return {
        isFallbackIdentity: true,
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_at: stored.expires_at ?? 0,
        token_type: 'bearer',
        user: {
          id: stored.user.id,
          email: stored.user.email ?? '',
          phone: stored.user.phone,
          user_metadata: {
            name: stored.user.name,
            phone: stored.user.phone,
            profile_email: stored.user.profileEmail,
            profile_completion_completed: stored.user.profileCompletionCompleted,
          },
        },
      };
    }
  } catch (e) {
    if (__DEV__) console.warn('[Supabase] SecureStore fallback failed:', e);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: CONVENIENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the current authenticated user from session (no network call).
 *
 * Uses getSession() — NEVER getUser().
 * WHY: getUser() makes a network call that can trigger SIGNED_OUT
 * if the access token is expired. getSession() reads from memory.
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.error('[Supabase] getCurrentUser error:', error);
    return null;
  }
  return session?.user ?? null;
}

/**
 * Get the current session (no refresh, no validation).
 * For validated session, use ensureValidSession() instead.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) {
    if (__DEV__) console.error('[Supabase] getCurrentSession error:', error);
    return null;
  }
  return session;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: DATABASE TABLE NAMES
// ═══════════════════════════════════════════════════════════════════════════════

export const TABLES = {
  MOBILE_USERS: 'mobile_users',
  CHECKINS: 'checkins',
  EMERGENCIES: 'emergencies',
  EMERGENCY_CONTACTS: 'emergency_contacts',
  INCIDENT_LOGS: 'incident_logs',
  NOTIFICATION_PREFERENCES: 'notification_preferences',
  PRIVACY_SETTINGS: 'privacy_settings',
  VIDEO_SESSIONS: 'video_sessions',
} as const;
