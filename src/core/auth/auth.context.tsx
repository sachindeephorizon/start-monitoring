/**
 * Authentication Context
 *
 * Single source of truth for auth state. Manages:
 * - Boot sequence (SecureStore → cache → ready)
 * - Session lifecycle (restore, refresh, sign out)
 * - Profile hydration (cache-first, background refresh)
 * - Supabase event handling (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED)
 *
 * Boot contract:
 *   Auth is NOT "ready" until profile has been hydrated at least once.
 *
 * AppBootState:
 *   booting → authenticating → hydrating_profile → ready
 *                                                 → unauthenticated
 *                                                 → error
 *
 * Token refresh — two paths only (no races):
 *   1. Supabase startAutoRefresh() — internal timer while foreground + connected
 *   2. Foreground check — immediate refresh when returning from background
 */

import React, { createContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import {
  supabase,
  isSupabaseConfigured,
  beginSdkSync,
  completeSdkSync,
  waitForSdkReady,
  guardedRefresh,
  guardedRefreshDetailed,
  isRefreshInProgress,
  markExplicitSignOut,
  isExplicitSignOut,
  clearExplicitSignOut,
  initAppStateMonitoring,
} from '@/lib/supabase';
import { useAppState } from '@/context/AppStateContext';
import { AuthService } from './auth.service';
import { AuthSession } from './auth.session';
import { AppBootState, AuthState, AuthUser, SignInCredentials, SignUpCredentials } from './auth.types';
import { ProfileService } from '@/core/profile/profile.service';
import { ProfileStorage } from '@/core/profile/profile.storage';
import type { MobileUserProfile } from '@/core/profile/profile.types';
import { Platform } from 'react-native';

// JWT access token expiry configured in Supabase Dashboard (seconds).
// Used as fallback when constructing minimal session objects during login.
const JWT_EXPIRY_SECONDS = 604800; // 7 days

/**
 * Decode the `exp` claim from a JWT access token.
 * Returns the Unix timestamp (seconds) or null if decoding fails.
 * This is used instead of hardcoded JWT_EXPIRY_SECONDS so the app
 * respects whatever TTL the backend actually issued.
 */
function decodeJwtExp(accessToken: string): number | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;
    // atob is available in React Native's JS engine (Hermes / JSC)
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp === 'number') return payload.exp;
    return null;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function supabaseUserToAuthUser(user: SupabaseUser): AuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, any>;
  return {
    id: user.id,
    email: user.email || '',
    phone: user.phone,
    name: meta?.name,
    profileCompletionCompleted: meta?.profile_completion_completed === true,
    profileEmail: typeof meta?.profile_email === 'string' ? meta.profile_email : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAuthRelatedProfileError(err: any) {
  const msg = String(err?.message ?? '').toLowerCase();
  const code = String(err?.code ?? '').toLowerCase();
  const status = Number((err as any)?.status ?? (err as any)?.statusCode ?? 0);
  return (
    status === 401 ||
    status === 403 ||
    code === '401' ||
    code === '403' ||
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    (msg.includes('jwt') && (msg.includes('invalid') || msg.includes('expired'))) ||
    (msg.includes('token') && (msg.includes('invalid') || msg.includes('expired'))) ||
    msg.includes('invalid refresh token')
  );
}

function isRecoverableNetworkishError(err: any) {
  const msg = String(err?.message ?? '').toLowerCase();
  return (
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('socket') ||
    msg.includes('ecconn') ||
    msg.includes('econn') ||
    msg.includes('enotfound') ||
    msg.includes('network')
  );
}

/**
 * Fire-and-forget: store device platform in mobile_users.device_info
 * so the agent dashboard can show iOS/Android badges.
 */
const _platformSyncedFor = new Set<string>();
function syncDevicePlatform(userId: string) {
  if (_platformSyncedFor.has(userId)) return; // once per app session
  _platformSyncedFor.add(userId);
  const platform = Platform.OS; // 'ios' | 'android'
  supabase
    .from('mobile_users')
    .update({ device_info: { platform, updated_at: new Date().toISOString() } })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) {
        // Non-fatal — remove from set so it retries next boot
        _platformSyncedFor.delete(userId);
        if (__DEV__) console.warn('[Auth] device_info sync failed:', error.message);
      }
    });
}

/**
 * Profile shape validation.
 * Accepts only well-formed MobileUserProfile objects.
 */
function isValidProfileForUser(profile: unknown, userId: string): profile is MobileUserProfile {
  if (!isObject(profile)) return false;

  const id = (profile as any).id;
  if (typeof id !== 'string' || id !== userId) return false;

  const requiredKeys: ReadonlyArray<string> = [
    'profile_completion_completed',
    'name',
    'email',
    'phone',
    'date_of_birth',
    'home_address',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
    'passkey_setup_completed',
    'emergency_passkey_hash',
    'created_at',
    'updated_at',
  ];

  for (const k of requiredKeys) {
    if (!(k in profile)) return false;
  }

  return true;
}

/**
 * Check if a profile marked "complete" actually has critical data.
 * Protects against RLS/network returning partial objects.
 */
function isProfileDataComplete(profile: MobileUserProfile | null): boolean {
  if (!profile) return false;
  if (profile.profile_completion_completed !== true) return false;

  const criticalFields = { name: profile.name, email: profile.email, phone: profile.phone };
  for (const [, value] of Object.entries(criticalFields)) {
    if (!value || String(value).trim() === '') return false;
  }
  return true;
}

// ─── Context type ───────────────────────────────────────────────────────────

type AuthContextType = AuthState & {
  appState: AppBootState;
  bootError?: string;
  retryBoot: () => Promise<void>;

  profile: MobileUserProfile | null;
  refreshProfile: () => Promise<MobileUserProfile | null>;

  signIn: (credentials: SignInCredentials) => Promise<{ success: boolean; error?: string }>;
  signUp: (credentials: SignUpCredentials) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  /** Called by AuthScreen after login DB write + profile cache to trigger hydration.
   *  sessionTokens: pass the access/refresh tokens so completeLogin can set user/session
   *  directly if the SIGNED_IN handler hasn't fired yet (iOS SDK lock issue). */
  completeLogin: (userId: string, sessionTokens?: { access_token: string; refresh_token: string }) => Promise<void>;

  isAuthenticated: boolean;
  isLoading: boolean;
  isUnauthenticated: boolean;
  isAuthReady: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// ─── Provider ───────────────────────────────────────────────────────────────

export function AuthProvider({ children }: AuthProviderProps) {
  // State
  const [appState, setAppState] = useState<AppBootState>('booting');
  const [bootError, setBootError] = useState<string | undefined>(undefined);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<MobileUserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const { isForeground, isConnected } = useAppState();

  // Refs
  const mountedRef = useRef(true);
  const bootIdRef = useRef(0);
  const logoutFenceRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const hydrationInFlightRef = useRef<Promise<AppBootState> | null>(null);
  const appStateRef = useRef<AppBootState>(appState);
  const userRef = useRef<AuthUser | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const profileRef = useRef<MobileUserProfile | null>(null);
  // isConnected as a ref so hydrateProfile/boot callbacks are stable
  // and Effect 1 (boot + auth listener) only runs ONCE on mount.
  // Without this, any NetInfo change causes the entire effect to re-run,
  // tearing down the auth listener and restarting boot mid-login.
  const isConnectedRef = useRef(isConnected);

  /**
   * ✅ CRITICAL FIX: Prevent cascading restore attempts.
   *
   * BUG: On cold boot, boot() sets up an optimistic session from SecureStore.
   * Then INITIAL_SESSION fires (SDK has no session) → calls AuthService.restore() (15s timeout).
   * If stored tokens are expired, restore() fails and triggers SIGNED_OUT.
   * SIGNED_OUT handler ALSO calls AuthService.restore() (another 15s timeout).
   * Total: 30+ seconds of broken app before transitioning to auth screen.
   *
   * FIX: Track whether a restore has been attempted in this boot cycle.
   * The INITIAL_SESSION handler skips restore if boot() is already handling it.
   * The SIGNED_OUT handler skips recovery if a restore was already attempted
   * (same expired tokens would fail again).
   */
  const restoreAttemptedRef = useRef(false);

  /**
   * ✅ CRITICAL FIX: Boot sync coordination.
   *
   * Problem: After 5+ hours in background, the instant boot path shows cached UI
   * immediately, then runs a background setSession() to sync tokens with the SDK.
   * Meanwhile, Effect 2 (auto-refresh), Effect 3 (foreground refresh), and the
   * background profile refresh ALL run concurrently — each making their own SDK
   * auth calls (getSession, refreshSession, setSession). These race for the SDK
   * lock and can cascade SIGNED_OUT events, causing premature logout even when
   * the refresh token is still valid.
   *
   * Fix: bootSyncPromiseRef holds a Promise that resolves when boot's background
   * SDK sync completes. Effects 2/3, profile refresh, and the SIGNED_OUT handler
   * all wait for this promise before doing their own auth operations. This ensures
   * boot has exclusive control over token recovery during the critical sync phase.
   */
  const bootSyncPromiseRef = useRef<Promise<boolean> | null>(null);
  /** Prevents re-entrant SIGNED_OUT handler from cascading refreshSession calls */
  const signedOutRecoveryRef = useRef(false);

  useEffect(() => { appStateRef.current = appState; }, [appState]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ─── Core callbacks ─────────────────────────────────────────────────────

  const updateAuthFromSession = useCallback(async (nextSession: Session | null) => {
    if (logoutFenceRef.current) return;
    if (nextSession?.user) {
      const nextUser = supabaseUserToAuthUser(nextSession.user);
      setSession(nextSession);
      setUser(nextUser);
      // Save to SecureStore with a timeout — if SecureStore hangs (Keychain issue,
      // simulator quirk), the auth flow must NOT be blocked forever.
      try {
        await Promise.race([
          AuthSession.save(nextSession),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('SecureStore save timeout')), 5000)),
        ]);
      } catch (e: any) {
        console.warn('[Auth] updateAuthFromSession: save failed/timed out:', e?.message);
        // Non-fatal — session is in memory (setSession/setUser above), boot can proceed.
        // SecureStore save will be retried on next TOKEN_REFRESHED event.
      }
      return;
    }
    setSession(null);
    setUser(null);
    setProfile(null);
    try {
      await Promise.race([
        AuthSession.clear(),
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {}
  }, []);

  const deriveAuthState = useCallback((): AuthState => {
    if (appState === 'unauthenticated') return { status: 'unauthenticated' };
    if (appState === 'ready' && user && session) return { status: 'authenticated', user, session };
    return { status: 'loading' };
  }, [appState, user, session]);

  const setUnauthenticated = useCallback(async (reason?: string) => {
    if (reason) console.warn('[Auth] → unauthenticated:', reason);
    setBootError(undefined);
    setProfile(null);
    setUser(null);
    setSession(null);
    setAppState('unauthenticated');
    setIsAuthReady(false);
  }, []);

  // ─── Profile hydration ─────────────────────────────────────────────────

  /**
   * Refresh profile in background (fire-and-forget).
   * Never throws, never blocks UI, never forces logout on transient errors.
   */
  const refreshProfileInBackground = useCallback(
    async (userId: string, bootId: number) => {
      try {
        const fresh = await ProfileService.fetchWithRetry(userId, { retries: 2, timeoutMs: 15_000 });
        if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;

        /**
         * ✅ CRITICAL FIX: Never overwrite a valid profile with null.
         *
         * BUG: During login, this background refresh runs while the SDK session
         * is still syncing (setSession in progress). If the SDK has no session,
         * RLS returns "no rows" → fetch returns null → overwrites the good
         * pre-cached profile → AuthGuard sees null → shows CompleteProfile.
         *
         * FIX: If the fresh result is null but we already have a profile in
         * React state, keep the existing profile. A null from background refresh
         * means the fetch failed silently (RLS, auth, network) — not that the
         * profile was deleted.
         */
        if (fresh === null) {
          if (profileRef.current !== null) {
            console.warn('[Auth] Background refresh returned null — keeping existing profile');
          }
          return;
        }

        if (!isValidProfileForUser(fresh as any, userId)) return;

        // Don't overwrite good cached data with incomplete fresh data
        const currentSnap = await ProfileStorage.getSnapshot(userId);
        if (currentSnap?.profile) {
          if (isProfileDataComplete(currentSnap.profile) && !isProfileDataComplete(fresh)) {
            console.warn('[Auth] Background refresh returned incomplete profile — keeping cache');
            return;
          }
        }

        await ProfileStorage.set(userId, fresh);
        if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
        setProfile(fresh);
      } catch (e: any) {
        if (isAuthRelatedProfileError(e)) {
          // Don't force logout immediately — the auth error may be transient
          // (e.g. token refresh in flight, race between concurrent refreshes).
          // Try refreshing the session once; if that succeeds, retry the profile fetch.
          console.warn('[Auth] Background profile refresh: auth error, attempting session refresh...', e);

          try {
            // ✅ ZERO-LOGOUT: Use guardedRefresh() instead of AuthService.refreshSession().
            // guardedRefresh() is a singleton — prevents refresh storms and handles
            // SDK mutex + SecureStore fallback internally.
            const refreshed = await guardedRefresh();
            if (!refreshed) {
              // Don't force logout from a background operation.
              // The cached profile remains available for the user.
              console.warn('[Auth] Background profile refresh: session refresh failed — keeping cached profile');
              return;
            }

            // Session refreshed — retry profile fetch once
            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
            const retryFresh = await ProfileService.fetchWithRetry(userId, { retries: 1, timeoutMs: 10_000 });
            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;

            if (retryFresh !== null && isValidProfileForUser(retryFresh as any, userId)) {
              await ProfileStorage.set(userId, retryFresh);
              if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
              setProfile(retryFresh);
            }
          } catch (retryErr) {
            // Retry also failed — keep cached profile, don't force logout
            // The user can still use the app with cached data
            console.warn('[Auth] Background profile refresh retry failed — keeping cache', retryErr);
          }
          return;
        }
        console.warn('[Auth] Background profile refresh failed (non-fatal)', e);
      }
    },
    []
  );

  /**
   * Hydrate profile for boot. Returns the resulting AppBootState.
   * - Cache hit → 'ready' immediately, background refresh
   * - No cache + online → blocking fetch → 'ready' or 'error'
   * - No cache + offline → 'error'
   */
  const hydrateProfile = useCallback(
    async (userId: string, bootId: number, opts?: { skipSessionValidation?: boolean; silentHydration?: boolean; accessToken?: string }): Promise<AppBootState> => {
      if (logoutFenceRef.current || bootId !== bootIdRef.current) return 'unauthenticated';

      // Hydration mutex: if another hydrateProfile is already in flight for
      // the same boot cycle, piggyback on it instead of starting a duplicate
      // fetch. This prevents boot() and the auth listener from racing.
      if (hydrationInFlightRef.current) {
        console.log('[Auth] hydrateProfile: another call in flight — waiting for it');
        return await hydrationInFlightRef.current;
      }

      const doHydrate = async (): Promise<AppBootState> => {
        // Bail out if another handler already moved to unauthenticated
        // (e.g. INITIAL_SESSION restore failed while boot was hydrating)
        if (appStateRef.current === 'unauthenticated') return 'unauthenticated';

        // 1. Check cache
        let cachedSnap = await ProfileStorage.getSnapshot(userId);

        // Validate cached profile structure
        if (cachedSnap?.profile && !isValidProfileForUser(cachedSnap.profile as any, userId)) {
          console.warn('[Auth] Invalid cached profile shape — clearing');
          await ProfileStorage.clear(userId);
          cachedSnap = null;
        }

        // Self-healing: only clear cache when profile CLAIMS to be complete but
        // critical data is missing (corruption). Profiles with
        // profile_completion_completed === false are valid (new user who hasn't
        // finished setup) and must NOT be cleared — clearing them forces a
        // blocking network fetch on every boot.
        if (
          cachedSnap?.profile?.profile_completion_completed === true &&
          !isProfileDataComplete(cachedSnap.profile)
        ) {
          console.warn('[Auth] Cached profile marked complete but missing data — clearing for fresh fetch');
          await ProfileStorage.clear(userId);
          cachedSnap = null;
        }

        // Null-profile snapshots (e.g. from AuthScreen pre-hydration) should
        // NOT trigger the cache-hit fast path — do a blocking fetch instead.
        if (cachedSnap && cachedSnap.profile === null) {
          console.log('[Auth] Cached snapshot has null profile — treating as cache miss');
          cachedSnap = null;
        }

        // 2. Cache hit → ready immediately
        if (cachedSnap) {
          setProfile(cachedSnap.profile);
          setAppState('ready');
          setIsAuthReady(true);
          syncDevicePlatform(userId);

          // Background refresh (fire-and-forget)
          if (isConnectedRef.current) {
            void refreshProfileInBackground(userId, bootId);
          }
          return 'ready';
        }

        // 3. No cache + offline → error
        if (!isConnectedRef.current) {
          setBootError('OFFLINE_NO_PROFILE_CACHE');
          setAppState('error');
          return 'error';
        }

        // 4. No cache + online → blocking fetch
        if (logoutFenceRef.current || bootId !== bootIdRef.current) return 'unauthenticated';
        console.log('[Auth] hydrateProfile: no valid cache — doing blocking fetch for', userId);
        // Only show the hydrating_profile splash during initial boot.
        // During post-login (silentHydration), keep the current screen (AuthScreen)
        // visible to avoid a jarring black splash screen.
        if (!opts?.silentHydration) {
          setAppState('hydrating_profile');
        }

        try {
          // When accessToken is provided (post-login fast path), use aggressive
          // timeouts: single 5s attempt. If Supabase is unreachable, fail fast
          // so completeLogin can force ready (~5s) instead of retrying for 25s+
          // and hitting AuthScreen's 20s outer timeout.
          const fetchRetries = opts?.accessToken ? 0 : 2;
          const fetchTimeoutMs = opts?.accessToken ? 5_000 : 8_000;
          const fresh = await ProfileService.fetchWithRetry(userId, { retries: fetchRetries, timeoutMs: fetchTimeoutMs, skipSessionValidation: opts?.skipSessionValidation, accessToken: opts?.accessToken });
          if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return 'unauthenticated';

          if (fresh !== null && !isValidProfileForUser(fresh as any, userId)) {
            console.warn('[Auth] hydrateProfile: fetched profile failed validation');
            throw new Error('PROFILE_INVALID');
          }

          // During post-login (silentHydration), a null profile means the row
          // doesn't exist yet — AuthScreen is still creating it.
          // Don't transition to 'ready' with null profile (AuthGuard can't proceed).
          // Return 'error' so the caller retries after a delay.
          if (fresh === null && opts?.silentHydration) {
            console.warn('[Auth] hydrateProfile: null profile during silentHydration — row not yet created');
            return 'error';
          }

          console.log('[Auth] hydrateProfile: profile loaded, name=', (fresh as any)?.name ?? '(null)');
          await ProfileStorage.set(userId, fresh);
          if (!mountedRef.current || bootId !== bootIdRef.current) return 'unauthenticated';
          setProfile(fresh);
          setAppState('ready');
          setIsAuthReady(true);
          syncDevicePlatform(userId);
          return 'ready';
        } catch (e: any) {
          console.error('[Auth] hydrateProfile: blocking fetch failed:', e?.message || e);
          if (isAuthRelatedProfileError(e)) {
            await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
            setAppState('unauthenticated');
            return 'unauthenticated';
          }
          // During silent hydration (post-login), don't switch to error screen
          // immediately — let the caller retry first, then decide.
          if (opts?.silentHydration) {
            console.warn('[Auth] hydrateProfile: silent hydration failed — returning error without state change');
            return 'error';
          }
          setBootError(isRecoverableNetworkishError(e) ? 'PROFILE_FAILED_NETWORK' : 'PROFILE_FAILED');
          setAppState('error');
          return 'error';
        }
      };

      // Run with mutex
      const promise = doHydrate();
      hydrationInFlightRef.current = promise;
      try {
        return await promise;
      } finally {
        hydrationInFlightRef.current = null;
      }
    },
    [refreshProfileInBackground]
  );

  // ─── Boot sequence ──────────────────────────────────────────────────────

  const boot = useCallback(async () => {
    const bootId = ++bootIdRef.current;
    logoutFenceRef.current = false;
    restoreAttemptedRef.current = false; // Fresh boot cycle
    signedOutRecoveryRef.current = false;

    // ✅ Zero-logout architecture: reset explicit signout flag on fresh boot
    clearExplicitSignOut();
    // ✅ Start centralized foreground/background monitoring (proactive refresh on resume)
    initAppStateMonitoring();

    // ✅ Boot sync promise — set BEFORE the first `await` so that Effects 2/3
    // (which also start in this React commit) see it immediately.
    // Resolved by the instant boot path's background IIFE, or immediately
    // for non-instant-boot paths (no async sync needed).
    let resolveBootSync: (synced: boolean) => void = () => {};
    bootSyncPromiseRef.current = new Promise<boolean>((resolve) => {
      resolveBootSync = resolve;
    });

    setBootError(undefined);
    setAppState('authenticating');

    // Boot timeout (30s)
    const bootTimeout = setTimeout(() => {
      if (!mountedRef.current || bootId !== bootIdRef.current) return;
      if (appStateRef.current !== 'ready' && appStateRef.current !== 'unauthenticated') {
        console.error('[Auth] Boot timeout (30s)');
        // Graceful degradation: try cache before showing error
        (async () => {
          try {
            const currentUser = userRef.current;
            if (currentUser?.id) {
              const snap = await ProfileStorage.getSnapshot(currentUser.id);
              if (snap && mountedRef.current && bootId === bootIdRef.current) {
                setProfile(snap.profile);
                setAppState('ready');
                setIsAuthReady(true);
                return;
              }
            }
          } catch {}
          if (mountedRef.current && bootId === bootIdRef.current) {
            setBootError('BOOT_TIMEOUT');
            setAppState('error');
          }
        })();
      }
    }, 30_000);

    try {
      if (!isSupabaseConfigured()) {
        resolveBootSync(true);
        bootSyncPromiseRef.current = null;
        setBootError('SUPABASE_NOT_CONFIGURED');
        setAppState('error');
        return;
      }

      // Step 1: Load session from SecureStore
      const stored = await AuthSession.load();
      if (!mountedRef.current || bootId !== bootIdRef.current) {
        resolveBootSync(true);
        bootSyncPromiseRef.current = null;
        return;
      }

      if (!stored?.access_token || !stored?.refresh_token || !stored.user?.id) {
        resolveBootSync(true);
        bootSyncPromiseRef.current = null;
        await setUnauthenticated('NO_SESSION');
        return;
      }

      // Step 2: Set optimistic user from stored tokens
      const optimisticUser: AuthUser = {
        id: stored.user.id,
        email: stored.user.email || '',
        phone: stored.user.phone,
        name: stored.user.name,
        profileCompletionCompleted: stored.user.profileCompletionCompleted,
        profileEmail: stored.user.profileEmail,
      };
      setUser(optimisticUser);
      setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_at: stored.expires_at,
      } as any);

      // Step 3: Check profile cache
      let cachedSnap: Awaited<ReturnType<typeof ProfileStorage.getSnapshot>> = null;
      try {
        cachedSnap = await ProfileStorage.getSnapshot(optimisticUser.id);
      } catch (e) {
        console.warn('[Auth] Cache check failed during boot:', e);
      }

      // Null-profile snapshots (from AuthScreen pre-hydration) are not useful
      // for the instant boot path — fall through to blocking fetch instead.
      if (cachedSnap && cachedSnap.profile === null) {
        console.log('[Auth] Boot: cached snapshot has null profile — skipping instant boot');
        cachedSnap = null;
      }

      if (cachedSnap) {
        // ── INSTANT BOOT PATH ──
        // Cache exists → show app immediately, validate in background
        setProfile(cachedSnap.profile);
        setAppState('ready');
        setIsAuthReady(true);
        syncDevicePlatform(optimisticUser.id);

        // ✅ CRITICAL FIX: Sync SecureStore tokens with the SDK.
        //
        // Problem: The SDK's AsyncStorage may not have a session (cleared,
        // corrupted, or first boot after install). Without syncing:
        // 1. SDK fires INITIAL_SESSION with no session
        // 2. INITIAL_SESSION handler calls AuthService.restore() (15s timeout)
        // 3. If expired → SIGNED_OUT → handler retries restore (another 15s)
        // 4. 30+ seconds of broken app before transitioning to auth screen
        //
        // Solution: Call setSession() directly with a 5s timeout.
        // - Success: SDK gets valid session, SIGNED_IN fires, all good
        // - Fail (expired tokens): SIGNED_OUT fires, we clean up quickly
        //
        // Note: The old comment warned about races with Effect 2. But Effect 2
        // only refreshes when the SDK already HAS a session. Here the SDK has
        // NO session, so Effect 2 does nothing. No race possible.
        restoreAttemptedRef.current = true;
        refreshInFlightRef.current = true;

        // ── Background IIFE #1: Sync SecureStore tokens with the SDK ──
        // This is the SOLE authority for token recovery during boot.
        // Effects 2/3, profile refresh, and SIGNED_OUT handler all wait
        // for this promise before making their own SDK auth calls.
        const bootSyncPromise = bootSyncPromiseRef.current!;
        // Signal ensureValidSession() to wait for SDK sync to complete
        // instead of racing against the SDK lock with timeouts.
        beginSdkSync();
        void (async () => {
          let synced = false;
          try {
            const setSessionResult = await Promise.race([
              supabase.auth.setSession({
                access_token: stored.access_token,
                refresh_token: stored.refresh_token,
              }),
              new Promise<null>((resolve) => setTimeout(() => {
                console.warn('[Auth] Boot: setSession timed out (5s)');
                resolve(null);
              }, 5000)),
            ]);

            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;

            if (!setSessionResult || setSessionResult.error || !setSessionResult.data?.session) {
              const err = setSessionResult?.error;
              const msg = String(err?.message ?? '').toLowerCase();
              const status = Number((err as any)?.status ?? 0);
              const isPermanent =
                status === 400 || status === 401 || status === 403 ||
                msg.includes('invalid') || msg.includes('expired') || msg.includes('not found');

              if (isPermanent) {
                // Before giving up, try refresh-token-only recovery.
                // setSession() can fail when the access token JWT is expired,
                // but the refresh token may still be valid on the server.
                let recovered = false;
                if (stored.refresh_token) {
                  try {
                    console.warn('[Auth] Boot: setSession failed — trying refresh-token-only recovery...');
                    // Re-read SecureStore in case another auth event already saved fresher tokens
                    const latestStored = await AuthSession.load();
                    const refreshToken = latestStored?.refresh_token || stored.refresh_token;
                    // Timeout: 8s so total boot sync (5s setSession + 8s refresh) stays under 15s safety net
                    const refreshResponse = await Promise.race([
                      supabase.auth.refreshSession({ refresh_token: refreshToken }),
                      new Promise<null>((resolve) => setTimeout(() => {
                        console.warn('[Auth] Boot: refresh-token recovery timed out (8s)');
                        resolve(null);
                      }, 8000)),
                    ]);
                    const refreshResult = refreshResponse?.data ?? null;
                    const refreshErr = refreshResponse?.error ?? null;
                    if (!refreshErr && refreshResult?.session) {
                      console.log('[Auth] Boot: refresh-token recovery succeeded');
                      await AuthSession.save(refreshResult.session);
                      if (mountedRef.current && bootId === bootIdRef.current && !logoutFenceRef.current) {
                        await updateAuthFromSession(refreshResult.session);
                      }
                      recovered = true;
                    }
                  } catch (e) {
                    console.warn('[Auth] Boot: refresh-token recovery failed:', e);
                  }
                }

                if (!recovered) {
                  // Both setSession and refresh-token recovery failed — tokens truly dead
                  console.error('[Auth] Boot: all token recovery failed — signing out');
                  await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
                  if (mountedRef.current && bootId === bootIdRef.current) {
                    setUnauthenticated('STORED_TOKENS_INVALID');
                  }
                } else {
                  synced = true;
                }
              } else {
                // Transient (timeout, network) — keep optimistic session
                console.warn('[Auth] Boot: setSession failed (transient) — keeping optimistic session');
                synced = true; // Optimistic — session may still be valid
              }
            } else {
              console.log('[Auth] Boot: SDK session synced successfully');
              // Save the (potentially refreshed) tokens to SecureStore
              await AuthSession.save(setSessionResult.data.session);
              synced = true;
            }
          } catch (e) {
            console.warn('[Auth] Boot: setSession threw (non-fatal):', e);
            synced = true; // Keep optimistic session on unexpected errors
          } finally {
            completeSdkSync(synced);
            resolveBootSync(synced);
            bootSyncPromiseRef.current = null;
            refreshInFlightRef.current = false;
          }
        })();

        // ── Background IIFE #2: Profile refresh ──
        // Waits for boot sync instead of a fixed delay. This ensures the
        // profile fetch uses valid tokens (or skips if sync failed).
        void (async () => {
          try {
            const synced = await bootSyncPromise;
            if (!synced || !mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
            // Small delay to let SDK state fully settle after sync
            await new Promise((r) => setTimeout(r, 500));
            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
            void refreshProfileInBackground(optimisticUser.id, bootId);
          } catch (e) {
            console.warn('[Auth] Background validation failed (non-fatal):', e);
          }
        })();

        return;
      }

      // ── FULL BOOT PATH (no cache) ──
      // Must sync tokens with SDK BEFORE hydrating profile. Without this:
      // 1. ensureValidSession() falls back to stale SecureStore tokens (RLS fails)
      // 2. INITIAL_SESSION handler starts a redundant 15s AuthService.restore()
      // 3. Stale tokens cause cascading SIGNED_OUT → 15-30s broken app
      //
      // Fix: direct setSession/refreshSession — fast server error for stale
      // tokens (~2-4s), no artificial timeouts. 30s boot timeout is safety net.
      restoreAttemptedRef.current = true; // Prevent INITIAL_SESSION handler's restore
      refreshInFlightRef.current = true;
      beginSdkSync();

      let tokensSynced = false;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const isExpired = !stored.expires_at || stored.expires_at < nowSec + 60;

        if (!isExpired) {
          // Access token not expired — setSession validates + refreshes if needed
          try {
            // Timeout: 5s to match cached boot path; prevents unbounded SDK lock hold
            const setSessionResponse = await Promise.race([
              supabase.auth.setSession({
                access_token: stored.access_token,
                refresh_token: stored.refresh_token,
              }),
              new Promise<null>((resolve) => setTimeout(() => {
                console.warn('[Auth] Boot (no cache): setSession timed out (5s)');
                resolve(null);
              }, 5000)),
            ]);
            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
            const result = setSessionResponse;
            if (result?.data?.session) {
              await AuthSession.save(result.data.session);
              await updateAuthFromSession(result.data.session);
              tokensSynced = true;
            }
          } catch (e) {
            console.warn('[Auth] Boot (no cache): setSession failed:', e);
          }
        } else {
          console.log('[Auth] Boot (no cache): access token expired — skipping setSession');
        }

        // If setSession failed or token was expired, try refresh-token-only
        if (!tokensSynced && stored.refresh_token) {
          try {
            console.log('[Auth] Boot (no cache): trying refresh-token recovery...');
            // Timeout: 8s so total boot sync (5s setSession + 8s refresh) stays under 15s safety net
            const refreshResponse = await Promise.race([
              supabase.auth.refreshSession({ refresh_token: stored.refresh_token }),
              new Promise<null>((resolve) => setTimeout(() => {
                console.warn('[Auth] Boot (no cache): refresh-token recovery timed out (8s)');
                resolve(null);
              }, 8000)),
            ]);
            if (!mountedRef.current || bootId !== bootIdRef.current || logoutFenceRef.current) return;
            const refreshResult = refreshResponse?.data ?? null;
            const refreshErr = refreshResponse?.error ?? null;
            if (!refreshErr && refreshResult?.session) {
              console.log('[Auth] Boot (no cache): refresh-token recovery succeeded');
              await AuthSession.save(refreshResult.session);
              await updateAuthFromSession(refreshResult.session);
              tokensSynced = true;
            }
          } catch (e) {
            console.warn('[Auth] Boot (no cache): refresh-token recovery failed:', e);
          }
        }
      } finally {
        completeSdkSync(tokensSynced);
        refreshInFlightRef.current = false;
      }

      if (!tokensSynced) {
        // All recovery failed — clear stale tokens and show login immediately
        console.warn('[Auth] Boot (no cache): all token recovery failed — signing out');
        resolveBootSync(true);
        bootSyncPromiseRef.current = null;
        await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
        if (mountedRef.current && bootId === bootIdRef.current) {
          await setUnauthenticated('STORED_TOKENS_INVALID');
        }
        return;
      }

      resolveBootSync(true);
      bootSyncPromiseRef.current = null;

      // Tokens synced with SDK — hydrate profile directly.
      // The auth listener (INITIAL_SESSION/SIGNED_IN) MAY also try to hydrate,
      // but it checks appStateRef !== 'ready' before doing so, and the
      // hydration mutex prevents truly concurrent fetches.
      console.log('[Auth] Boot: tokens synced — hydrating profile');
      await hydrateProfile(optimisticUser.id, bootId);
      // hydrateProfile sets appState to 'ready', 'error', or 'unauthenticated'.
      // Boot is done — bootTimeout will be cleared in finally.
    } catch (error: any) {
      resolveBootSync(true);
      bootSyncPromiseRef.current = null;
      if (!mountedRef.current) return;

      if (isRecoverableNetworkishError(error)) {
        setBootError('PROFILE_FAILED_NETWORK');
        setAppState('error');
        return;
      }
      if (isAuthRelatedProfileError(error)) {
        await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
        setAppState('unauthenticated');
        return;
      }
      setBootError('AUTH_INIT_FAILED');
      setAppState('error');
    } finally {
      clearTimeout(bootTimeout);
    }
  }, [setUnauthenticated, updateAuthFromSession, hydrateProfile, refreshProfileInBackground]);

  // ─── Effect 1: Boot + auth state listener ───────────────────────────────

  useEffect(() => {
    boot();

    // Listen to Supabase auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, eventSession) => {
      if (!mountedRef.current) return;

      // Logout fence: block all events except a new SIGNED_IN
      if (logoutFenceRef.current) {
        if (event === 'SIGNED_IN' && eventSession?.user) {
          logoutFenceRef.current = false;
        } else {
          return;
        }
      }

      console.log('[Auth] Event:', event, eventSession?.user?.email ?? '(no email)');

      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (eventSession) {
          try {
            console.log('[Auth] Updating auth from session...');
            await updateAuthFromSession(eventSession);
            console.log('[Auth] Auth updated. appState:', appStateRef.current);
            if (eventSession.user?.id && appStateRef.current !== 'ready') {
              if (event === 'SIGNED_IN') {
                // Don't hydrate here. AuthScreen will call completeLogin()
                // after it finishes the DB write + profile cache.
                // This eliminates the race: SIGNED_IN fires before the
                // profile row exists, so hydrating here would get null.
                console.log('[Auth] SIGNED_IN: skipping hydration — AuthScreen will call completeLogin()');
              } else {
                // INITIAL_SESSION / TOKEN_REFRESHED — hydrate normally
                console.log('[Auth] Calling hydrateProfile...');
                const result = await hydrateProfile(eventSession.user.id, bootIdRef.current);
                console.log('[Auth] hydrateProfile result:', result);
              }
            }
          } catch (e) {
            console.error('[Auth] Error handling event:', event, e);
          }
        } else if (event === 'INITIAL_SESSION') {
          // SDK has no session (AsyncStorage cleared?) but SecureStore might have tokens.
          // ✅ FIX: If boot is still syncing tokens with the SDK, skip restore entirely.
          // Boot handles all token recovery during its sync phase (both instant and
          // full boot paths). Starting AuthService.restore() here would race with
          // boot's setSession/refreshSession and cause cascading SIGNED_OUT events.
          if (bootSyncPromiseRef.current) {
            console.log('[Auth] INITIAL_SESSION: boot is syncing tokens — skipping');
            return;
          }
          if (restoreAttemptedRef.current) {
            console.log('[Auth] INITIAL_SESSION: restore already attempted — skipping');
            return;
          }
          try {
            const stored = await AuthSession.load();
            if (stored?.access_token && stored?.refresh_token && stored?.user?.id) {
              console.log('[Auth] INITIAL_SESSION has no session — restoring from SecureStore');
              restoreAttemptedRef.current = true;
              const restored = await AuthService.restore();
              if (!restored && mountedRef.current) {
                console.warn('[Auth] SecureStore restore failed — signing out');
                await setUnauthenticated('RESTORE_FAILED');
              }
              // If restored, SIGNED_IN will fire and the handler above will hydrate.
            }
          } catch (e) {
            console.warn('[Auth] SecureStore fallback restore failed:', e);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        // ✅ During boot SDK sync, boot IIFE is the sole recovery authority.
        if (bootSyncPromiseRef.current) {
          console.log('[Auth] SIGNED_OUT during boot sync — boot IIFE will handle recovery');
          return;
        }

        // ✅ Zero-logout: User explicitly signed out — clean exit, no recovery.
        if (isExplicitSignOut()) {
          console.log('[Auth] SIGNED_OUT: explicit user signout — cleaning up');
          await setUnauthenticated('SIGNED_OUT');
          await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
          return;
        }

        // SDK noise (failed auto-refresh, token rotation race, etc.)
        // Offline — keep session, don't attempt recovery that will fail
        if (!isConnectedRef.current) {
          console.warn('[Auth] SIGNED_OUT while offline — keeping session');
          return;
        }

        // Prevent re-entrant SIGNED_OUT cascade
        if (signedOutRecoveryRef.current) {
          console.log('[Auth] SIGNED_OUT: recovery already in progress — skipping');
          return;
        }

        // ✅ Zero-logout: Single recovery path via guardedRefreshDetailed().
        // Returns typed failure reasons so we only force logout when the
        // refresh token is definitively dead (invalid_refresh), not on
        // transient network/timeout errors.
        signedOutRecoveryRef.current = true;
        try {
          const result = await guardedRefreshDetailed();
          if (!mountedRef.current) return;

          if (result.session) {
            console.log('[Auth] SIGNED_OUT: guardedRefreshDetailed recovered session');
            await updateAuthFromSession(result.session);
            if (result.session.user?.id) {
              await hydrateProfile(result.session.user.id, bootIdRef.current);
            }
            return;
          }

          // Recovery failed — check the reason
          if (result.reason === 'invalid_refresh') {
            // Refresh token is definitively dead — force logout
            console.warn('[Auth] SIGNED_OUT: refresh token invalid — logging out');
            await setUnauthenticated('SIGNED_OUT');
            await Promise.allSettled([AuthSession.clear(), ProfileStorage.clearAll()]);
          } else {
            // Transient failure (network, timeout, unknown) — keep session
            // The user can still use the app with cached data. Auto-refresh
            // or the next foreground check will retry.
            console.warn(`[Auth] SIGNED_OUT: recovery failed (${result.reason}) — keeping session`);
          }
        } finally {
          signedOutRecoveryRef.current = false;
        }
      } else if (event === 'USER_UPDATED') {
        if (eventSession) {
          try {
            await updateAuthFromSession(eventSession);
            if (eventSession.user?.id) {
              void refreshProfileInBackground(eventSession.user.id, bootIdRef.current);
            }
          } catch (e) {
            console.error('[Auth] Error handling USER_UPDATED:', e);
          }
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  // All callback deps are stable (no state in their dep arrays), so this
  // effect runs exactly ONCE on mount. This is critical: re-running it
  // would tear down the auth listener and restart boot() mid-login.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Effect 2: Auto-refresh toggle (with proactive refresh) ─────────────
  //
  // When returning to foreground after inactivity, the access token may be
  // expired.  If we call startAutoRefresh() immediately, the SDK detects the
  // expired token and fires SIGNED_OUT before our manual refresh can run.
  //
  // Fix: proactively refresh the token BEFORE starting auto-refresh so the
  // SDK always sees a valid token when it begins its internal timer.

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isForeground || !isConnected) {
        try { (supabase.auth as any).stopAutoRefresh?.(); } catch {}
        return;
      }

      // Wait for boot SDK sync before any auth operations
      const bootSync = bootSyncPromiseRef.current;
      if (bootSync) {
        const synced = await bootSync;
        if (cancelled) return;
        if (synced) {
          try { (supabase.auth as any).startAutoRefresh?.(); } catch {}
        }
        return;
      }

      // Skip when unauthenticated — no session to refresh
      if (appStateRef.current === 'unauthenticated') return;

      // ✅ Zero-logout: skip if guardedRefresh is already in flight
      if (isRefreshInProgress()) {
        try { (supabase.auth as any).startAutoRefresh?.(); } catch {}
        return;
      }

      // ✅ Zero-logout: use guardedRefresh() for proactive token refresh.
      // Handles SDK refresh + SecureStore fallback + mutex barrier internally.
      // No manual beginSdkSync/completeSdkSync needed.
      let refreshSucceeded = false;
      try {
        // Check if token needs refresh first
        const getSessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>((resolve) => setTimeout(() => {
            console.warn('[Auth] Effect 2: getSession timed out (8s) — SDK lock likely held');
            resolve(null);
          }, 8000)),
        ]);
        const current = getSessionResult?.data?.session ?? null;

        if (current?.expires_at) {
          const secondsLeft = current.expires_at - Math.floor(Date.now() / 1000);
          if (secondsLeft < 120) {
            // Token expired or expiring within 2 min — proactive refresh
            const refreshed = await guardedRefresh();
            if (!cancelled && refreshed) {
              await updateAuthFromSession(refreshed);
              refreshSucceeded = true;
            }
          } else {
            // Token still valid — safe to start auto-refresh
            refreshSucceeded = true;
          }
        } else if (current?.user) {
          // Session exists but no expires_at — trust it
          refreshSucceeded = true;
        }
      } catch (e) {
        console.warn('[Auth] Proactive token refresh failed:', e);
      }

      if (!cancelled && refreshSucceeded) {
        try { (supabase.auth as any).startAutoRefresh?.(); } catch {}
      } else if (!cancelled) {
        console.warn('[Auth] Skipping startAutoRefresh — no valid token after refresh attempts');
      }
    })();

    return () => { cancelled = true; };
  }, [isForeground, isConnected, updateAuthFromSession]);

  // ─── Effect 3: Foreground refresh check ─────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function checkAndRefresh() {
      if (!isForeground || !isConnected) return;
      if (appState !== 'ready') return;

      // Wait for boot SDK sync — boot handles token recovery
      const bootSync = bootSyncPromiseRef.current;
      if (bootSync) {
        await bootSync;
        return;
      }

      // ✅ Zero-logout: skip if guardedRefresh is already in flight
      if (isRefreshInProgress()) return;

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const expiresAt = currentSession?.expires_at;
      if (!currentSession?.user || typeof expiresAt !== 'number') return;

      const nowSec = Math.floor(Date.now() / 1000);
      if (expiresAt - nowSec > 120) return; // > 2 minutes left — skip

      // ✅ Zero-logout: use guardedRefreshDetailed() — returns typed failure reason
      // so we only force logout when refresh token is definitively dead.
      const result = await guardedRefreshDetailed();
      if (cancelled) return;

      if (!result.session) {
        if (result.reason === 'invalid_refresh') {
          // Refresh token is truly dead — force logout
          await AuthSession.clear();
          await setUnauthenticated('UNRECOVERABLE_REFRESH');
        } else {
          // Transient failure (network, timeout, unknown) — keep session.
          // Auto-refresh or next foreground check will retry.
          console.warn(`[Auth] Effect 3: refresh failed (${result.reason}) — keeping session`);
        }
        return;
      }

      await updateAuthFromSession(result.session);
    }

    checkAndRefresh().catch((e) => {
      console.warn('[Auth] Foreground refresh failed:', e);
    });

    return () => { cancelled = true; };
  }, [isForeground, isConnected, appState, updateAuthFromSession, setUnauthenticated]);

  // ─── retryBoot ──────────────────────────────────────────────────────────

  const retryBoot = useCallback(async () => {
    logoutFenceRef.current = false;
    setBootError(undefined);
    setProfile(null);
    setUser(null);
    setSession(null);
    setAppState('booting');
    setIsAuthReady(false);

    await boot();
  }, [boot]);

  // ─── Auth methods ───────────────────────────────────────────────────────

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    const result = await AuthService.signIn(credentials);
    if (result.success) {
      const s = await AuthService.getCurrentSession();
      if (s) {
        await updateAuthFromSession(s);
        if (s.user?.id) await hydrateProfile(s.user.id, bootIdRef.current);
      }
    }
    return result;
  }, [updateAuthFromSession, hydrateProfile]);

  const signUp = useCallback(async (credentials: SignUpCredentials) => {
    const result = await AuthService.signUp(credentials);
    if (result.success && !result.requiresVerification) {
      const s = await AuthService.getCurrentSession();
      if (s) {
        await updateAuthFromSession(s);
        if (s.user?.id) await hydrateProfile(s.user.id, bootIdRef.current);
      }
    }
    return result;
  }, [updateAuthFromSession, hydrateProfile]);

  const signOut = useCallback(async () => {
    // ✅ Zero-logout: mark as explicit signout BEFORE any SDK calls.
    // SIGNED_OUT handler checks this flag to skip recovery attempts.
    markExplicitSignOut();
    logoutFenceRef.current = true;

    // Immediately block UI
    setBootError(undefined);
    setProfile(null);
    setUser(null);
    setSession(null);
    setAppState('unauthenticated');
    setIsAuthReady(false);

    // Clear everything (best-effort, parallel)
    await Promise.allSettled([
      (supabase.auth as any).signOut?.({ scope: 'local' }),
      AuthSession.clear(),
      ProfileStorage.clearAll(),
    ]);

    // Remote sign-out (best-effort, non-blocking)
    supabase.auth.signOut().catch(() => {});
  }, []);

  const refreshSessionMethod = useCallback(async () => {
    // ✅ Zero-logout: use guardedRefreshDetailed() — only logout on definitively dead token
    const result = await guardedRefreshDetailed();
    if (!result.session) {
      if (result.reason === 'invalid_refresh') {
        await setUnauthenticated('UNRECOVERABLE_REFRESH');
      } else {
        console.warn(`[Auth] refreshSession: refresh failed (${result.reason}) — keeping session`);
      }
      return;
    }
    await updateAuthFromSession(result.session);
  }, [setUnauthenticated, updateAuthFromSession]);

  const refreshProfile = useCallback(async (): Promise<MobileUserProfile | null> => {
    if (!user?.id || logoutFenceRef.current) return null;
    try {
      const fresh = await ProfileService.fetchWithRetry(user.id, { retries: 2, timeoutMs: 10_000 });
      if (logoutFenceRef.current) return null;
      await ProfileStorage.set(user.id, fresh);
      setProfile(fresh);
      return fresh;
    } catch (e) {
      console.warn('[Auth] refreshProfile failed — keeping existing', e);
      return profileRef.current ?? null;
    }
  }, [user?.id]);

  /**
   * Called by AuthScreen after it finishes DB write + profile cache.
   * Triggers hydrateProfile which picks up the cached profile (instant)
   * and transitions appState to 'ready'.
   *
   * This eliminates the SIGNED_IN race condition: AuthScreen controls
   * the timing instead of the SIGNED_IN handler guessing when the
   * profile row exists.
   */
  const completeLogin = useCallback(async (userId: string, sessionTokens?: { access_token: string; refresh_token: string }) => {
    // Reset logoutFenceRef on re-login. If a previous signOut set this to true and
    // the user signs back in quickly, completeLogin would otherwise return early before
    // the SIGNED_IN handler has a chance to clear it (race condition on fast re-login).
    logoutFenceRef.current = false;
    // ✅ Zero-logout: clear explicit signout flag on fresh login
    clearExplicitSignOut();

    // ✅ CRITICAL FIX: Reset appState from 'unauthenticated'.
    // After boot clears stale tokens (STORED_TOKENS_INVALID) or any sign-out,
    // appState is 'unauthenticated'. hydrateProfile's doHydrate() bails immediately
    // when it sees this state. Update the ref directly since setState is async
    // (React batches updates) and hydrateProfile reads the ref synchronously.
    if (appStateRef.current === 'unauthenticated') {
      appStateRef.current = 'authenticating';
    }

    console.log('[Auth] completeLogin called for', userId, 'user set:', !!userRef.current, 'session set:', !!sessionRef.current);

    if (sessionTokens) {
      // ── FAST PATH: tokens provided (OTP login) ─────────────────────
      // Skip waitForSdkReady() — setSession() may be holding the SDK lock.
      // Tokens are already validated by the backend; use them directly.
      console.log('[Auth] completeLogin: FAST PATH — using provided tokens (bypassing SDK lock)');

      // 1. Set user/session state immediately from tokens
      const jwtExp = decodeJwtExp(sessionTokens.access_token);
      const expiresAt = jwtExp ?? (Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS);
      if (__DEV__) {
        const ttlSec = expiresAt - Math.floor(Date.now() / 1000);
        console.log(`[Auth] completeLogin: expires_at=${expiresAt} (TTL ${ttlSec}s, ${jwtExp ? 'from JWT' : 'hardcoded'})`);
      }
      const minimalSession = {
        access_token: sessionTokens.access_token,
        refresh_token: sessionTokens.refresh_token,
        expires_at: expiresAt,
        token_type: 'bearer',
      } as any;
      setSession(minimalSession);
      setUser({ id: userId, email: '', profileCompletionCompleted: false });

      // 2. Persist to SecureStore for fallback identity on next boot
      try {
        await AuthSession.save({
          access_token: sessionTokens.access_token,
          refresh_token: sessionTokens.refresh_token,
          expires_at: expiresAt,
          token_type: 'bearer',
          user: { id: userId, email: '', phone: '', user_metadata: {} },
        } as any);
        console.log('[Auth] completeLogin: tokens saved to SecureStore');
      } catch (e) {
        console.warn('[Auth] completeLogin: SecureStore save failed:', e);
      }

      // 3. Background SDK reconciliation — don't block on it.
      // When setSession() eventually completes (or times out), completeSdkSync()
      // fires and the SIGNED_IN event updates React state. All subsequent
      // supabase.from() calls will work normally after SDK syncs.
      // (setSession is already running in background from AuthScreen)

      // 4. Hydrate profile via raw REST (no SDK lock contention)
      const result = await hydrateProfile(userId, bootIdRef.current, {
        skipSessionValidation: true,
        silentHydration: true,
        accessToken: sessionTokens.access_token,
      });
      console.log('[Auth] completeLogin hydrateProfile result:', result);

      // If hydration failed (Supabase unreachable, network issue, etc.), force ready
      // immediately. Don't retry — the single 5s attempt already proved Supabase is
      // unreachable. Retrying would waste 10s+ and hit AuthScreen's 20s outer timeout.
      // AuthGuard handles null profile gracefully (waits 5s, then shows CompleteProfileScreen).
      // The background profile sync in AuthScreen Step 4, or the next boot's background
      // refresh, will populate the profile when Supabase becomes reachable.
      if (result === 'error' && mountedRef.current && !logoutFenceRef.current) {
        console.warn('[Auth] completeLogin: profile fetch failed — forcing ready (AuthGuard will handle)');
        setAppState('ready');
        setIsAuthReady(true);
      }

      // 5. Start auto-refresh after everything settles
      try { (supabase.auth as any).startAutoRefresh?.(); } catch {}
      console.log('[Auth] completeLogin: startAutoRefresh called');
      return;
    }

    // ── FALLBACK PATH: no tokens provided (defensive) ────────────────
    // Shouldn't happen for OTP login, but keep the existing waitForSdkReady()
    // → SDK recovery path for safety.
    console.log('[Auth] completeLogin: FALLBACK PATH — waiting for SDK');

    await waitForSdkReady();

    // Ensure user and session are set
    if (!userRef.current || !sessionRef.current) {
      console.warn('[Auth] completeLogin: user/session NOT set — recovering from SDK');
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          console.log('[Auth] completeLogin: recovered session from SDK');
          setSession(data.session);
          setUser(supabaseUserToAuthUser(data.session.user));
        }
      } catch (e) {
        console.warn('[Auth] completeLogin: getSession failed:', e);
      }
    }

    const result = await hydrateProfile(userId, bootIdRef.current, { skipSessionValidation: true, silentHydration: true });
    console.log('[Auth] completeLogin hydrateProfile result:', result);

    if (result === 'error' && mountedRef.current && !logoutFenceRef.current) {
      console.warn('[Auth] completeLogin: first attempt failed — retrying...');
      await new Promise(r => setTimeout(r, 1500));
      if (!mountedRef.current || logoutFenceRef.current) return;
      try { await ProfileStorage.clear(userId); } catch {}
      const retryResult = await hydrateProfile(userId, bootIdRef.current, { skipSessionValidation: true, silentHydration: true });
      if (retryResult === 'error' && mountedRef.current && !logoutFenceRef.current) {
        console.warn('[Auth] completeLogin: retry failed — forcing ready (AuthGuard will handle)');
        setAppState('ready');
        setIsAuthReady(true);
      }
    }

    try { (supabase.auth as any).startAutoRefresh?.(); } catch {}
    console.log('[Auth] completeLogin: startAutoRefresh called');
  }, [hydrateProfile]);

  // ─── Context value ──────────────────────────────────────────────────────

  const authState = deriveAuthState();

  const value: AuthContextType = {
    ...authState,
    appState,
    bootError,
    retryBoot,
    profile,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    refreshSession: refreshSessionMethod,
    completeLogin,
    isAuthenticated: authState.status === 'authenticated',
    isLoading: authState.status === 'loading',
    isUnauthenticated: authState.status === 'unauthenticated',
    isAuthReady,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
