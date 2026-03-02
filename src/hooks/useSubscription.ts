import { useState, useEffect, useCallback, useRef } from 'react';
import { SubscriptionService, SubscriptionPlan, FamilyMember, UserSubscription } from '@/services/subscription.service';
import { AuthService } from '@/core/auth/auth.service';
import { AppState, Platform } from 'react-native';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { withTimeout } from '@/core/net/supabaseQuery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/core/auth';

export interface SubscriptionState {
  hasAccess: boolean;
  subscription: UserSubscription | null;
  currentPlan: SubscriptionPlan | null;
  isFamilyPlan: boolean;
  isLoading: boolean;
  error: string | null;
  trialDaysRemaining?: number | null;
}

export interface FamilyState {
  members: FamilyMember[];
  isLoading: boolean;
  error: string | null;
}

// iOS-only: simple in-memory cache for last-known-good subscription state
let subscriptionSnapshotCache: SubscriptionState | null = null;
const SUBSCRIPTION_SNAPSHOT_STORAGE_KEY = 'deephorizon.subscriptionSnapshot.v1';
// Legacy key from earlier iterations (keep for backward-compat so upgrades still render Family instantly)
const LEGACY_SUBSCRIPTION_STATE_KEY = 'last_known_subscription_state';
const FAMILY_MEMBERS_SNAPSHOT_STORAGE_KEY = 'deephorizon.familyMembersSnapshot.v1';
function getCachedSubscriptionSnapshot(): SubscriptionState | null {
  return subscriptionSnapshotCache;
}
function setCachedSubscriptionSnapshot(next: SubscriptionState) {
  subscriptionSnapshotCache = next;
}
async function persistSubscriptionSnapshot(next: SubscriptionState) {
  if (Platform.OS !== 'ios') return;
  try {
    // Persist minimal serializable subset; currentPlan can be derived from plan_id.
    const payload = {
      hasAccess: Boolean(next.hasAccess),
      isFamilyPlan: Boolean(next.isFamilyPlan),
      trialDaysRemaining: next.trialDaysRemaining ?? null,
      subscription: next.subscription
        ? {
            id: next.subscription.id,
            user_id: next.subscription.user_id,
            plan_id: next.subscription.plan_id,
            status: next.subscription.status,
            start_date: next.subscription.start_date,
            end_date: next.subscription.end_date,
            auto_renew: next.subscription.auto_renew,
            created_at: next.subscription.created_at,
            updated_at: next.subscription.updated_at,
          }
        : null,
      // Keep last persisted timestamp for debugging
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(SUBSCRIPTION_SNAPSHOT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Non-critical
  }
}
async function hydrateSubscriptionSnapshotFromStorage(): Promise<SubscriptionState | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    // Prefer v1 snapshot
    const rawV1 = await AsyncStorage.getItem(SUBSCRIPTION_SNAPSHOT_STORAGE_KEY);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as any;
      const subscription: UserSubscription | null = parsed?.subscription || null;
      const currentPlan = subscription?.plan_id ? (SubscriptionService.getPlan(subscription.plan_id) || null) : null;
      const hasAccess = Boolean(parsed?.hasAccess);
      const isFamilyPlan =
        Boolean(parsed?.isFamilyPlan) ||
        currentPlan?.type === 'family';
      return {
        hasAccess,
        subscription,
        currentPlan,
        isFamilyPlan,
        isLoading: false,
        error: null,
        trialDaysRemaining: typeof parsed?.trialDaysRemaining === 'number' ? parsed.trialDaysRemaining : null,
      };
    }

    // Fallback: legacy key (migrate if present)
    const legacyRaw = await AsyncStorage.getItem(LEGACY_SUBSCRIPTION_STATE_KEY);
    if (!legacyRaw) return null;
    const legacyParsed = JSON.parse(legacyRaw) as any;
    const subscription: UserSubscription | null = legacyParsed?.subscription || null;
    const currentPlan: SubscriptionPlan | null = legacyParsed?.currentPlan || (subscription?.plan_id ? (SubscriptionService.getPlan(subscription.plan_id) || null) : null);
    const hasAccess = legacyParsed?.hasAccess != null ? Boolean(legacyParsed.hasAccess) : Boolean(subscription || currentPlan);

    const hydrated: SubscriptionState = {
      hasAccess,
      subscription,
      currentPlan,
      isFamilyPlan: currentPlan?.type === 'family',
      isLoading: false,
      error: null,
      trialDaysRemaining: null,
    };

    // Best-effort migrate to v1 format (non-blocking)
    persistSubscriptionSnapshot(hydrated).catch(() => {});
    return hydrated;
  } catch {
    return null;
  }
}

// iOS-only: kick off hydration ASAP (module import time) so Menu can render cached plan earlier.
const iosHydrationPromise: Promise<SubscriptionState | null> =
  Platform.OS === 'ios' ? hydrateSubscriptionSnapshotFromStorage() : Promise.resolve(null);

export const useSubscription = () => {
  // iOS-only: keep a last-known-good snapshot so screens render instantly while we refresh.
  // This is module-scoped in-memory cache (resets on app restart).
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const cachedSnapshot = Platform.OS === 'ios' ? getCachedSubscriptionSnapshot() : null;

  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    hasAccess: cachedSnapshot?.hasAccess ?? false,
    subscription: cachedSnapshot?.subscription ?? null,
    currentPlan: cachedSnapshot?.currentPlan ?? null,
    isFamilyPlan: cachedSnapshot?.isFamilyPlan ?? (cachedSnapshot?.currentPlan?.type === 'family'),
    // iOS: if we have cached data, don't block UI; otherwise we are "unknown" until first checkAccess finishes.
    isLoading: Platform.OS === 'ios' ? !cachedSnapshot : true,
    error: null,
    trialDaysRemaining: cachedSnapshot?.trialDaysRemaining ?? null,
  });

  const [familyState, setFamilyState] = useState<FamilyState>({
    members: [],
    isLoading: false,
    error: null
  });
  const latestFamilyMembersLenRef = useRef(0);
  const { isAuthReady } = useAuth(); // ✅ NEW: Auth readiness signal

  useEffect(() => {
    latestFamilyMembersLenRef.current = familyState.members.length;
  }, [familyState.members.length]);

  // Prevent concurrent checkAccess calls (can cause storms and timeouts)
  const checkAccessInFlightRef = useRef<Promise<void> | null>(null);
  // iOS-only: if the very first cold-start fetch times out, automatically retry a few times
  // (this removes the need for a manual "swipe up" AppState nudge).
  const iosRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosRetryCountRef = useRef(0);
  const iosLastFailureWasTimeoutRef = useRef(false);

  const isTimeoutError = (err: any) => {
    const msg = String(err?.message || err || '');
    return (
      msg.includes('timed out') ||
      msg.includes('Request timed out') ||
      msg.includes('FETCH_TIMEOUT')
    );
  };

  const scheduleIosRetry = useCallback((reason: 'timeout' | 'missing_data') => {
    if (Platform.OS !== 'ios') return;
    // Never retry while a call is starting/active; this competes with Stream token/connect/join on iOS.
    // Removed isCallPriorityActive check - foreground only
    if (iosRetryTimerRef.current) return;
    if (iosRetryCountRef.current >= 3) return;

    // Only retry if we still don't have subscription/plan
    if (subscriptionSnapshotCache?.currentPlan || subscriptionSnapshotCache?.subscription) return;

    // For timeout-driven retries, ensure we only do it when it was actually a timeout
    if (reason === 'timeout') {
      iosLastFailureWasTimeoutRef.current = true;
    }

    iosRetryCountRef.current += 1;
    const delay = iosRetryCountRef.current === 1 ? 400 : iosRetryCountRef.current === 2 ? 1200 : 2500;

    iosRetryTimerRef.current = setTimeout(() => {
      iosRetryTimerRef.current = null;
      // Removed isCallPriorityActive check - foreground only
      // Fire-and-forget; in-flight de-dupe protects us
      checkAccess().catch(() => {});
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS: if we had cached data, refresh in background without blocking screens
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;

    // Hydrate from persisted cache to make Menu instant on physical devices.
    (async () => {
      const hydrated = await iosHydrationPromise;
      if (cancelled) return;
      if (hydrated) {
        setCachedSubscriptionSnapshot(hydrated);
        setSubscriptionState(prev => ({
          ...prev,
          hasAccess: hydrated.hasAccess,
          subscription: hydrated.subscription,
          currentPlan: hydrated.currentPlan,
          isFamilyPlan: hydrated.isFamilyPlan,
          isLoading: false,
          error: null,
        }));
      }

      // Don't call checkAccess() here — the isAuthReady effect (below) will
      // trigger the first real fetch once auth is settled.  Calling it here
      // races with that effect and causes a redundant API call on every mount.
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check subscription access
  const checkAccess = useCallback(async () => {
    // Removed isCallPriorityActive check - foreground only
    // De-dupe concurrent calls into one in-flight promise (all platforms).
    if (checkAccessInFlightRef.current) {
      await checkAccessInFlightRef.current;
      return;
    }

    try {
      const run = async () => {
        const hasCached = Platform.OS === 'ios' && !!getCachedSubscriptionSnapshot();

        // Only show a blocking loader if we have no cached data.
        setSubscriptionState(prev => ({ ...prev, isLoading: hasCached ? false : true, error: null }));

        // iOS can be slower on cold start; align with Supabase iOS abort timeout so we don't
        // prematurely fall back to "no subscription" when the user actually has one.
        const timeoutMs = Platform.OS === 'ios' ? 30000 : 12000;

        // All platforms: avoid duplicate queries. Fetch subscription ONCE, then only compute trial if needed.
        let subscription: UserSubscription | null = null;
        let currentPlan: SubscriptionPlan | null = null;
        let isFamilyPlan = false;
        let subscriptionFetchTimedOut = false;
        let trialDaysRemaining: number | null = null;

        try {
          const { subscription: userSub, error: subError } = await withTimeout(
            SubscriptionService.getUserSubscription(),
            timeoutMs
          );

          if (subError) {
            console.warn('Error fetching subscription details:', subError);
            if (isTimeoutError(subError)) {
              subscriptionFetchTimedOut = true;
              if (Platform.OS === 'ios') {
                iosLastFailureWasTimeoutRef.current = true;
                scheduleIosRetry('timeout');
              }
            }
          }

          if (userSub) {
            subscription = userSub;
            currentPlan = SubscriptionService.getPlan(userSub.plan_id) || null;
          }
        } catch (subError: any) {
          console.warn('Subscription fetch timed out or failed:', subError);
          if (isTimeoutError(subError)) {
            subscriptionFetchTimedOut = true;
            if (Platform.OS === 'ios') {
              iosLastFailureWasTimeoutRef.current = true;
              scheduleIosRetry('timeout');
            }
          }
        }

        // If subscription fetch timed out and we got no new data, preserve last-known state (all platforms).
        if (subscriptionFetchTimedOut && !subscription && !currentPlan) {
          setSubscriptionState(prev => ({
            ...prev,
            hasAccess: prev.hasAccess || !!(prev.subscription || prev.currentPlan),
            isLoading: prev.currentPlan || prev.subscription ? false : true,
            error: 'timeout',
          }));
          if (Platform.OS === 'ios') {
            console.warn('[Subscription][iOS] Subscription fetch timed out - preserving last-known state and retrying.');
          } else {
            console.warn('[Subscription] Subscription fetch timed out - preserving last-known state.');
          }
          return;
        }

        // If subscription exists but plan_id isn't in our hardcoded list, infer family-ness using the DB
        // and provide a fallback plan so UI remains functional.
        if (subscription && !currentPlan) {
          try {
            isFamilyPlan = await withTimeout(
              SubscriptionService.isFamilySubscription(subscription.id),
              8000
            );
          } catch {
            isFamilyPlan = false;
          }
          currentPlan = SubscriptionService.getFallbackPlan(
            subscription.plan_id,
            isFamilyPlan ? 'family' : 'individual'
          );
        } else if (currentPlan?.type === 'family') {
          isFamilyPlan = true;
        }

        // Access rules:
        // - If we have a subscription (direct or family), access is true.
        // - Otherwise fall back to trial status (and store remaining days for UI).
        let hasAccess = !!subscription;
        if (!hasAccess) {
          try {
            const trial = await withTimeout(SubscriptionService.getTrialStatus(), timeoutMs);
            hasAccess = !!trial?.isTrialActive;
            trialDaysRemaining = typeof trial?.daysRemaining === 'number' ? trial.daysRemaining : null;
          } catch {
            hasAccess = false;
            trialDaysRemaining = null;
          }
        }

        const nextState: SubscriptionState = {
          hasAccess,
          subscription,
          currentPlan,
          isFamilyPlan,
          isLoading: false,
          error: null,
          trialDaysRemaining,
        };

        setSubscriptionState(nextState);
        if (Platform.OS === 'ios') {
          setCachedSubscriptionSnapshot(nextState);
          persistSubscriptionSnapshot(nextState).catch(() => {
            // non-critical
          });
        }

        // iOS: reset retry flags if we got meaningful data, otherwise schedule a gentle retry
        if (Platform.OS === 'ios') {
          if (subscription || currentPlan) {
            iosRetryCountRef.current = 0;
            iosLastFailureWasTimeoutRef.current = false;
          } else {
            scheduleIosRetry('missing_data');
          }
        }
      };

      const p = run();
      checkAccessInFlightRef.current = p.then(() => undefined).catch(() => undefined);
      await p;
    } catch (error: any) {
      console.error('Error in checkAccess:', error);
      // 🔥 FIX: Handle timeout gracefully - don't show error for timeouts
      const isTimeout = error?.message?.includes('timed out') || error?.message?.includes('Request timed out');
      if (Platform.OS === 'ios') {
        iosLastFailureWasTimeoutRef.current = !!isTimeout;
        if (isTimeout) scheduleIosRetry('timeout');
      }
      // On timeout, do NOT clobber last-known-good state (all platforms).
      // If we have no cached data yet, keep isLoading=true so entitlement-gated screens don't render "Plan required".
      if (isTimeout) {
        setSubscriptionState(prev => ({
          ...prev,
          hasAccess: prev.hasAccess || !!(prev.subscription || prev.currentPlan),
          isLoading: prev.currentPlan || prev.subscription ? false : true,
          // Mark as timeout internally so screens can avoid premature navigation.
          error: 'timeout',
        }));
        if (Platform.OS === 'ios') {
          console.warn('[Subscription][iOS] Request timed out - keeping previous subscription state and retrying.');
        } else {
          console.warn('[Subscription] Request timed out - keeping previous subscription state.');
        }
        return;
      }
      setSubscriptionState(prev => ({
        ...prev,
        hasAccess: false,
        isLoading: false,
        error: isTimeout ? null : (error.message || 'Unknown error'),
      }));
      if (isTimeout) console.warn('[Subscription] Request timed out - continuing with default access state');
    } finally {
      checkAccessInFlightRef.current = null;
    }
  }, []);

  /**
   * CRITICAL (login -> subscription correctness):
   * This hook can mount before the new session is fully settled after `setSession()`.
   * In that case, the "check access on mount" effect may see `session=null` and never re-run,
   * causing the UI to show "no subscription" until app restart.
   *
   * Fix: listen to auth events and re-run checkAccess on SIGNED_IN / TOKEN_REFRESHED.
   */
  useEffect(() => {
    let mounted = true;
    const {
      data: { subscription: sub },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      // Only refresh on TOKEN_REFRESHED — SIGNED_IN is already handled by the
      // isAuthReady effect below, so re-checking here causes a redundant API call.
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          checkAccess().catch((err) => {
            console.warn('[useSubscription] checkAccess failed after token refresh:', err);
          });
        }
      } else if (event === 'SIGNED_OUT') {
        // Reset in-memory snapshot so the next login starts clean.
        subscriptionSnapshotCache = null;
        setSubscriptionState((prev) => ({
          ...prev,
          hasAccess: false,
          subscription: null,
          currentPlan: null,
          isFamilyPlan: false,
          isLoading: false,
          error: null,
          trialDaysRemaining: null,
        }));
      }
    });

    return () => {
      mounted = false;
      sub.unsubscribe();
    };
  }, [checkAccess]);

  // iOS-only: If we don't have subscription/plan yet, retry checkAccess when AppState becomes active.
  // This addresses cases where early cold-start network/AsyncStorage isn't fully ready until active.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const scheduleRetry = (delayMs: number) => {
      // Removed isCallPriorityActive check - foreground only
      if (iosRetryTimerRef.current) return;
      iosRetryTimerRef.current = setTimeout(() => {
        iosRetryTimerRef.current = null;
        // Removed isCallPriorityActive check - foreground only
        // Only retry if we still don't have a plan/subscription
        if (!subscriptionSnapshotCache?.currentPlan && !subscriptionSnapshotCache?.subscription) {
          checkAccess().catch(() => {
            // non-critical
          });
        }
      }, delayMs);
    };

    const maybeKickRetries = () => {
      // Removed isCallPriorityActive check - foreground only
      // If we already have data, no retries needed
      if (subscriptionState.currentPlan || subscriptionState.subscription) return;
      // Only retry a few times to avoid background hammering
      if (iosRetryCountRef.current >= 3) return;
      if (!iosLastFailureWasTimeoutRef.current) return;

      iosRetryCountRef.current += 1;
      const delay = iosRetryCountRef.current === 1 ? 400 : iosRetryCountRef.current === 2 ? 1200 : 2500;
      scheduleRetry(delay);
    };

    // If the first attempt timed out, schedule a retry even without AppState changes
    maybeKickRetries();

    /**
     * ✅ AppState Listener #1: iOS retry logic
     * Properly cleaned up in effect cleanup function
     */
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // When becoming active, try again if we still have no data.
        maybeKickRetries();
      }
    });

    return () => {
      sub.remove(); // ✅ Cleanup registered
      if (iosRetryTimerRef.current) {
        clearTimeout(iosRetryTimerRef.current);
        iosRetryTimerRef.current = null;
      }
    };
  }, [checkAccess, subscriptionState.currentPlan, subscriptionState.subscription, subscriptionState.hasAccess]);

  /**
   * ✅ AppState Listener #2: iOS foreground refresh
   * Separate listener with different purpose - properly cleaned up
   * This is critical after the user changes subscription status in iOS Settings/App Store.
   */
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const lastRanAtRef = { current: 0 };
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      const now = Date.now();
      // Avoid spamming on rapid state changes.
      if (now - lastRanAtRef.current < 3000) return;
      lastRanAtRef.current = now;

      // Fire-and-forget; `checkAccess` already de-dupes concurrent calls on iOS.
      ;(async () => {
        try {
          await SubscriptionService.syncIosSubscriptionStatus(false);
        } catch {
          // non-fatal
        }
        await checkAccess().catch(() => {});
      })();
    });

    return () => {
      sub.remove();
    };
  }, [checkAccess]);

  // Check family access by phone number
  const checkFamilyAccess = useCallback(async (phone: string) => {
    try {
      const { hasAccess, member, error } = await SubscriptionService.checkFamilyAccess(phone);
      return { hasAccess, member, error };
    } catch (error: any) {
      return { hasAccess: false, member: null, error: error.message };
    }
  }, []);

  // Keep isFamilyPlan in sync when currentPlan is derived from cached snapshot / changes.
  useEffect(() => {
    const next = subscriptionState.currentPlan?.type === 'family';
    if (next !== subscriptionState.isFamilyPlan && subscriptionState.currentPlan) {
      setSubscriptionState(prev => ({ ...prev, isFamilyPlan: next }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionState.currentPlan?.type]);

  // Load family members (optimized: pass subscription_id if available)
  const loadFamilyMembers = useCallback(async (subscriptionId?: string) => {
    try {
      // iOS: if we already have cached members, refresh in background without blocking the UI
      const shouldBlock = !(Platform.OS === 'ios' && latestFamilyMembersLenRef.current > 0);
      setFamilyState(prev => ({ ...prev, isLoading: shouldBlock ? true : false, error: null }));
      
      // Pass subscription_id if available to avoid extra API call
      const { members, error } = await SubscriptionService.getFamilyMembers(subscriptionId || subscriptionState.subscription?.id);
      
      const nextMembers = members || [];
      setFamilyState({
        members: nextMembers,
        isLoading: false,
        error
      });

      // iOS-only: persist last-known family members so Family screen can render instantly on cold start
      if (Platform.OS === 'ios') {
        const sid = subscriptionId || subscriptionState.subscription?.id || null;
        AsyncStorage.setItem(
          FAMILY_MEMBERS_SNAPSHOT_STORAGE_KEY,
          JSON.stringify({ savedAt: Date.now(), subscriptionId: sid, members: nextMembers })
        ).catch(() => {});
      }
    } catch (error: any) {
      setFamilyState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }));
    }
  }, [subscriptionState.subscription?.id]);

  // iOS-only: hydrate cached family members instantly when we have a family subscription id, then refresh in background.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const planType = subscriptionState.currentPlan?.type;
    const sid = subscriptionState.subscription?.id;
    if (planType !== 'family' || !sid) return;

    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(FAMILY_MEMBERS_SNAPSHOT_STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as any;
          if (parsed?.subscriptionId === sid && Array.isArray(parsed?.members) && parsed.members.length > 0) {
            setFamilyState(prev => ({
              ...prev,
              members: parsed.members as FamilyMember[],
              isLoading: false,
              error: null,
            }));
          }
        }
      } catch {
        // non-critical
      }

      // Always refresh in background (loadFamilyMembers will not block if we already have cached members)
      loadFamilyMembers(sid).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [subscriptionState.currentPlan?.type, subscriptionState.subscription?.id, loadFamilyMembers]);

  // Add family member
  const addFamilyMember = useCallback(async (phone: string, name?: string, email?: string) => {
    try {
      const { member, error } = await SubscriptionService.addFamilyMember(phone, name, email);
      
      if (error) {
        return { success: false, error };
      }

      // Reload family members
      await loadFamilyMembers();
      
      return { success: true, member, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [loadFamilyMembers]);

  // Remove family member
  const removeFamilyMember = useCallback(async (memberId: string) => {
    try {
      const { success, error } = await SubscriptionService.removeFamilyMember(memberId);
      
      if (success) {
        // Reload family members
        await loadFamilyMembers();
      }
      
      return { success, error };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [loadFamilyMembers]);

  // Get available plans
  const getPlans = useCallback(() => {
    return SubscriptionService.getPlans();
  }, []);

  // Create subscription (for payment integration)
  const createSubscription = useCallback(async (planId: string, autoRenew: boolean = true) => {
    try {
      const { subscription, error } = await SubscriptionService.createSubscription(planId, autoRenew);
      
      if (error) {
        return { success: false, error };
      }

      // Refresh subscription state
      await checkAccess();
      
      return { success: true, subscription, error: null };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, [checkAccess]);

  /**
   * ✅ CRITICAL FIX: Removed infinite loop risk
   *
   * OLD DEPENDENCY ARRAY: Included familyState.members.length
   * PROBLEM: loadFamilyMembers updates members → length changes → effect re-runs → infinite loop potential
   *
   * NEW DEPENDENCY ARRAY: Removed familyState.members.length
   * SOLUTION: We check members.length INSIDE the effect (line 699), so it doesn't need to be a dependency.
   * The effect should only run when subscription changes (isFamilyPlan or subscription.id changes),
   * not when members are loaded.
   */
  // Load family members when subscription changes to family plan
  useEffect(() => {
    if (subscriptionState.isFamilyPlan && subscriptionState.subscription?.id && !familyState.isLoading) {
      // Only load if we don't have members yet or subscription changed
      const shouldLoad = familyState.members.length === 0 ||
                        familyState.members[0]?.subscription_id !== subscriptionState.subscription.id;

      if (shouldLoad) {
        loadFamilyMembers(subscriptionState.subscription.id).catch(err => {
          console.error('Error loading family members:', err);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionState.isFamilyPlan, subscriptionState.subscription?.id, familyState.isLoading, loadFamilyMembers]);

  // Check access on mount and when user changes
  useEffect(() => {
    let mounted = true;
    
    const checkUserAccess = async () => {
      if (!isAuthReady) {
        console.log('[useSubscription] Waiting for auth to be ready...');
        return;
      }

      try {
        // ensureValidSession() already waits for SDK barrier internally,
        // so no separate waitForSdkReady() call needed here.

        // iOS: never call AuthService.getCurrentUser() here (it can trigger network/DB reads).
        // We only need to know if a session exists; getSession() is local and reliable.
        if (Platform.OS === 'ios') {
          const session = await ensureValidSession();
          if (!mounted) return;
          if (session?.user) {
            await checkAccess();
          } else if (mounted) {
            setSubscriptionState(prev => ({ ...prev, isLoading: false }));
          }
          return;
        }

        const user = await AuthService.getCurrentUser();
        if (!mounted) return;

        if (user) {
          await checkAccess();
        } else if (mounted) {
          setSubscriptionState(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        if (mounted) {
          setSubscriptionState(prev => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      }
    };

    // iOS-only: do not delay access check (can contribute to “only loads after swipe up”)
    // Android behavior unchanged.
    let timer: any;
    if (Platform.OS === 'ios') {
      checkUserAccess();
    } else {
      timer = setTimeout(() => {
        checkUserAccess();
      }, 0);
    }

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthReady, checkAccess]);

  return {
    // Subscription state
    hasAccess: subscriptionState.hasAccess,
    subscription: subscriptionState.subscription,
    currentPlan: subscriptionState.currentPlan,
    isFamilyPlan: subscriptionState.isFamilyPlan,
    isLoading: subscriptionState.isLoading,
    error: subscriptionState.error,
    trialDaysRemaining: subscriptionState.trialDaysRemaining ?? null,
    
    // Family state
    familyMembers: familyState.members,
    familyLoading: familyState.isLoading,
    familyError: familyState.error,
    
    // Actions
    checkAccess,
    checkFamilyAccess,
    loadFamilyMembers,
    addFamilyMember,
    removeFamilyMember,
    getPlans,
    createSubscription,
    
    // Refresh all data (optimized: pass subscription_id)
    refresh: async () => {
      // iOS: after the user manages the subscription in the App Store (cancel/reactivate),
      // force-refresh server state from Apple so the UI reflects it immediately.
      if (Platform.OS === 'ios') {
        await SubscriptionService.syncIosSubscriptionStatus(true);
      }
      await checkAccess();
      if (subscriptionState.isFamilyPlan && subscriptionState.subscription?.id) {
        // Use subscription_id to avoid extra API call
        await loadFamilyMembers(subscriptionState.subscription.id);
      }
    }
  };
};
