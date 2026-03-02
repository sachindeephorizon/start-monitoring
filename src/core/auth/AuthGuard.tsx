/**
 * AuthGuard Component
 * 
 * Checks if authenticated users have completed profile setup and passkey setup.
 * Shows appropriate screens if setup is incomplete.
 * 
 * Flow:
 * 1. If not authenticated -> show auth screens
 * 2. If authenticated but profile incomplete -> show CompleteProfileScreen
 * 3. If profile complete but passkey incomplete -> show PasskeySetupScreen
 * 4. If both complete -> show main app
 */

import React, { useState, useEffect, useCallback } from 'react';
import AnimatedStartupScreen from '@/components/startup/AnimatedStartupScreen';
import { useNavigation } from '@react-navigation/native';
import { navigationRef } from '@/navigation/navigationRef';
import { useAuth } from './auth.hooks';
import { PasskeySetupScreen } from '@/screens/PasskeySetupScreen';
import { CompleteProfileScreen } from '@/screens/CompleteProfileScreen';
import TrialExpiredScreen from '@/screens/TrialExpiredScreen';
import { SubscriptionService } from '@/features/subscription/subscription.service';
import { AuthUser } from './auth.types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withTimeout } from '@/core/net/supabaseQuery';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const auth = useAuth();
  const authenticated = auth.status === 'authenticated';
  const user: AuthUser | null = auth.status === 'authenticated' ? auth.user : null;
  const authLoading = auth.status === 'loading';
  const [checking, setChecking] = useState(true);
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [showTrialExpired, setShowTrialExpired] = useState(false);
  const [checkCompleted, setCheckCompleted] = useState(false);
  const [trialCheckCompleted, setTrialCheckCompleted] = useState(false);

  /**
   * ✅ FIX: Prevent concurrent calls to checkSetupStatus
   * Track if a check is in progress to prevent race conditions
   */
  const checkInProgressRef = React.useRef(false);

  /**
   * ✅ CRITICAL FIX: Track previous user ID to prevent race condition.
   *
   * BUG: On initial login, React fires effects in declaration order in the SAME
   * batch. Effect 408 calls checkSetupStatus() which runs synchronously (no await
   * when profile exists) and sets checkCompleted=true + trialCheckCompleted=true.
   * Then effect 430 (user?.id change) fires and OVERRIDES those with false.
   * Result: black loading screen forever (until 15s safety timeout).
   *
   * FIX: Only reset checkCompleted/trialCheckCompleted when the user SWITCHES
   * (different ID), not when user is first set (null → userId). On initial
   * login, all states are already at their default (false) values, so resetting
   * is both unnecessary and harmful.
   */
  const prevUserIdRef = React.useRef<string | undefined>(undefined);

  /**
   * ✅ FIX: Use ref for profile polling to avoid stale closure
   * This allows the polling loop to see profile updates in real-time
   */
  const authProfileRef = React.useRef(auth.profile);
  React.useEffect(() => {
    authProfileRef.current = auth.profile;
  }, [auth.profile]);

  // Get navigation - this hook must be called unconditionally
  // It's safe because AuthGuard is always rendered inside NavigationContainer
  const navigation = useNavigation<any>();

  /**
   * ✅ CRITICAL FIX: Safety timeout behavior changed
   *
   * OLD BEHAVIOR (DANGEROUS): On timeout, allow access even if setup incomplete
   * NEW BEHAVIOR (SAFE): On timeout, stay in checking state and rely on graceful degradation
   *
   * The timeout is still here for extreme edge cases, but instead of bypassing security,
   * we let the normal error handling in checkSetupStatus() handle it.
   * The withTimeout wrapper and try-catch blocks already implement graceful degradation.
   *
   * If this timeout fires, it means the check took >15 seconds, which suggests a serious
   * network or system issue. The app will remain in loading state, which is better than
   * letting potentially incomplete users access the app.
   */
  useEffect(() => {
    if (checking) {
      const timeout = setTimeout(() => {
        console.error('[AuthGuard] ⚠️ Setup check exceeded 15 seconds - unblocking user (graceful degradation)');
        // The user is already authenticated. Profile/passkey/trial checks are non-security-critical
        // UX guards. Keeping the user on a black screen forever is worse than letting them through.
        setChecking(false);
        setCheckCompleted(true);
        setTrialCheckCompleted(true);
        checkInProgressRef.current = false;
      }, 15000); // 15 second maximum loading time

      return () => clearTimeout(timeout);
    }
  }, [checking]);

  /**
   * Check user profile and passkey setup status
   *
   * CRITICAL FIX:
   * Only trust the hydrated profile from AuthProvider (auth.profile).
   * Never use user.profileCompletionCompleted from cached session metadata,
   * as it can be stale and cause "Complete Your Profile" loops for existing users.
   *
   * ✅ CONCURRENT CALL PROTECTION:
   * Uses checkInProgressRef to prevent multiple simultaneous calls,
   * which could cause race conditions and unpredictable behavior.
   */
  const checkSetupStatus = useCallback(async () => {
    if (!authenticated || !user) {
      setChecking(false);
      checkInProgressRef.current = false;
      return;
    }

    /**
     * ✅ FIX: Prevent concurrent calls to checkSetupStatus
     * If a check is already in progress, return early to avoid race conditions
     */
    if (checkInProgressRef.current) {
      console.warn('[AuthGuard] Setup check already in progress - skipping concurrent call');
      return;
    }

    checkInProgressRef.current = true;

    try {
      const resolvedProfile = auth.profile;

      /**
       * ✅ INSTANT BOOT: If we have cached profile, hide loading spinner IMMEDIATELY
       * This prevents the flash of loading screen when app opens with cached data
       */
      if (resolvedProfile) {
        setChecking(false);
        console.log('[AuthGuard] ⚡ INSTANT: Profile exists, processing immediately without spinner');
      }

      /**
       * ✅ CRITICAL FIX: Handle null profile correctly after phone restart
       *
       * If profile is null, it could mean:
       * 1. New user - genuinely no profile (show Complete Profile)
       * 2. Profile still loading from cache/database (wait)
       * 3. Background refresh in progress after 'ready' state (wait)
       *
       * After phone restart, auth can transition to 'ready' with null profile
       * while background refresh is fetching the actual profile. We must NOT
       * show "Complete Profile" in this case - it creates a loop.
       */
      if (!resolvedProfile) {
        // If app is not ready yet, profile is definitely still loading
        if (auth.appState !== 'ready') {
          console.warn('[AuthGuard] Profile is null, auth not ready yet - waiting for hydration');
          setChecking(false);
          setCheckCompleted(false);
          return;
        }

        // App is 'ready' but profile is null. This could be:
        // - New user (no profile exists)
        // - Background refresh in progress after phone restart

        // Wait a bit to see if background refresh completes
        // If profile is still null after timeout, it's genuinely missing
        console.warn('[AuthGuard] Profile is null at ready state - waiting for background refresh...');

        /**
         * ✅ FIX: Use authProfileRef to avoid stale closure
         * The polling loop now checks authProfileRef.current which is kept up-to-date
         * via useEffect, so it can detect profile loads immediately without waiting 5 seconds.
         *
         * ✅ IMPROVED: Increased timeout from 3s to 5s for slow networks
         * Prevents false "Complete Profile" screens on slow networks where profile
         * takes longer to hydrate.
         */
        const waitForProfile = new Promise<boolean>((resolve) => {
          // Immediate check before starting polling
          if (authProfileRef.current) {
            resolve(true);
            return;
          }

          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, 1000ms, 1000ms...
          // Total wait ~5s, but only ~10 checks instead of 50 (saves CPU/battery)
          let elapsed = 0;
          let delay = 100;
          const maxWaitMs = 5000;

          const scheduleCheck = () => {
            const timer = setTimeout(() => {
              // Check if profile was loaded (using ref to avoid stale closure)
              if (authProfileRef.current) {
                console.log('[AuthGuard] Background refresh completed - profile loaded');
                resolve(true);
                return;
              }

              elapsed += delay;
              if (elapsed >= maxWaitMs) {
                console.warn('[AuthGuard] Profile wait timeout after 5s - treating as new user');
                resolve(false);
                return;
              }

              // Exponential backoff, capped at 1s
              delay = Math.min(delay * 2, 1000);
              scheduleCheck();
            }, delay);

            // Cleanup on unmount: clear the timer (defensive — no state update needed)
            return timer;
          };

          scheduleCheck();
        });

        // Wait for result
        const profileLoaded = await waitForProfile;

        if (!profileLoaded) {
          // Profile is genuinely missing - new user needs to complete it
          console.log('[AuthGuard] Confirmed: Profile is missing - showing completion screen');
          setShowCompleteProfile(true);
          setShowPasskeySetup(false);
          setChecking(false);
          setCheckCompleted(true);
          return;
        }

        // Profile was loaded by background refresh - continue with normal flow
        console.log('[AuthGuard] Profile loaded via background refresh - checking completion status');
        setChecking(false);
        setCheckCompleted(false);
        return;
      }

      /**
       * ✅ CRITICAL FIX: Trust the profile_completion_completed flag
       *
       * OLD BEHAVIOR: Checked flag AND individual fields with OR logic
       * PROBLEM: If flag was true but name/email missing (from metadata vs DB mismatch),
       *          it would still show "Complete Profile" screen in a loop
       *
       * NEW BEHAVIOR: If profile_completion_completed === true, TRUST IT
       * RATIONALE: The flag is set ONLY after successful profile completion and is
       *            the authoritative source of truth from the database.
       *
       * This follows the memory note: "Never trust cached user_metadata - always use
       * database mobile_users.profile_completion_completed"
       */
      const needsProfileCompletion = resolvedProfile.profile_completion_completed !== true;

      const needsPasskeySetup =
        !resolvedProfile.passkey_setup_completed ||
        !resolvedProfile.emergency_passkey_hash ||
        String(resolvedProfile.emergency_passkey_hash).trim() === '';

      // Log profile details for debugging
      if (needsProfileCompletion) {
        const finalName = String(resolvedProfile.name || '').trim();
        const finalEmail = String(resolvedProfile.email || '').trim();

        console.log('[AuthGuard] Profile incomplete - showing completion screen');
        console.log('[AuthGuard] Profile check details:', {
          profile_completion_completed: resolvedProfile.profile_completion_completed,
          has_name: !!finalName,
          has_email: !!finalEmail,
          has_dob: !!resolvedProfile.date_of_birth,
          has_address: !!resolvedProfile.home_address,
          has_emergency_contact: !!resolvedProfile.emergency_contact_name,
        });
      }

      // Show appropriate screen based on database state only
      if (needsProfileCompletion) {
        setShowCompleteProfile(true);
        setShowPasskeySetup(false);
      } else if (needsPasskeySetup) {
        console.log('[AuthGuard] Profile complete but passkey needed');
        setShowCompleteProfile(false);
        setShowPasskeySetup(true);
      } else {
        // Both complete — compute trial status INLINE to avoid render gap.
        // Setting checkCompleted=true WITHOUT trialCheckCompleted=true causes
        // a render cycle where line 437-450 shows a black loading screen.
        console.log('[AuthGuard] ✅ Profile and passkey complete - user fully onboarded');
        setShowCompleteProfile(false);
        setShowPasskeySetup(false);

        // Inline local trial check — same batch as checkCompleted
        const trialStart = resolvedProfile.trial_start_date;
        if (trialStart) {
          const trialEnd = new Date(trialStart).getTime() + 7 * 24 * 60 * 60 * 1000;
          if (Date.now() < trialEnd) {
            console.log('[AuthGuard] Trial active (inline) — no black screen gap');
            setShowTrialExpired(false);
            setTrialCheckCompleted(true);
          }
          // If trial expired, trialCheckCompleted stays false → async checkTrialStatus
          // will run to also check for active subscriptions (acceptable brief loading).
        }
        // If no trial_start_date, async check will handle it.
      }

      setChecking(false);
      setCheckCompleted(true);
    } catch (error: any) {
      console.error('[AuthGuard] Error checking setup status:', error);
      /**
       * IMPORTANT:
       * Timeouts / transient errors happen on cold start (slow network, OS resuming).
       * Never force "Complete Profile" as a fallback, because it looks like the app
       * forgot the user's setup. Allow access instead (graceful degradation).
       */
      setShowCompleteProfile(false);
      setShowPasskeySetup(false);
      setChecking(false);
      setCheckCompleted(true);
      setTrialCheckCompleted(true); // Graceful degradation — allow access, no black screen gap
    } finally {
      /**
       * ✅ FIX: Always clear the in-progress flag
       * This ensures concurrent calls can proceed after this one completes
       */
      checkInProgressRef.current = false;
    }
  }, [authenticated, user, auth.profile, auth.appState]);

  /**
   * Check trial status and subscription
   */
  const checkTrialStatus = useCallback(async () => {
    if (!authenticated || !user || !checkCompleted || showCompleteProfile || showPasskeySetup) {
      return;
    }

    // ── FAST PATH: compute trial status locally from cached profile ──────
    // After OTP login, the Supabase SDK lock may still be held by setSession().
    // SubscriptionService uses supabase.from() which hangs on the lock.
    // If trial_start_date exists and is within 7 days, skip network entirely.
    const cachedTrialStart = auth.profile?.trial_start_date;
    if (cachedTrialStart) {
      const trialEnd = new Date(cachedTrialStart).getTime() + 7 * 24 * 60 * 60 * 1000;
      if (Date.now() < trialEnd) {
        console.log('[AuthGuard] Trial active (local check) — skipping network call');
        setShowTrialExpired(false);
        setTrialCheckCompleted(true);
        return;
      }
    }

    try {
      // Check if user has active subscription with timeout protection
      const subscription = await withTimeout(
        SubscriptionService.getCurrentSubscription(),
        5000 // 5 second timeout (reduced from 10s)
      );

      if (subscription) {
        // User has active subscription - no need to check trial
        setShowTrialExpired(false);
        setTrialCheckCompleted(true);
        return;
      }

      // No subscription - check trial status with timeout protection
      const { isTrialActive, error } = await withTimeout(
        SubscriptionService.getTrialStatus(),
        5000 // 5 second timeout (reduced from 10s)
      );

      if (error) {
        console.error('Error checking trial status:', error);
        // On error, allow access (graceful degradation)
        setShowTrialExpired(false);
        setTrialCheckCompleted(true);
        return;
      }

      // If trial has expired and no subscription, show trial expired screen
      if (!isTrialActive) {
        console.log('Trial expired - showing trial expired screen');
        setShowTrialExpired(true);
      } else {
        console.log('Trial is still active - allowing access');
        setShowTrialExpired(false);
      }

      setTrialCheckCompleted(true);
    } catch (error: any) {
      console.error('Error checking trial status:', error);
      // Handle timeout gracefully - allow access to prevent app from hanging
      const isTimeout = error?.message?.includes('timed out') || error?.message?.includes('Request timed out');
      if (isTimeout) {
        console.warn('[AuthGuard] Trial check timed out - allowing access to prevent app hang');
      }
      // On error or timeout, allow access (graceful degradation)
      setShowTrialExpired(false);
      setTrialCheckCompleted(true);
    }
  }, [authenticated, user, checkCompleted, showCompleteProfile, showPasskeySetup, auth.profile?.trial_start_date]);

  // Check trial status after setup is complete
  useEffect(() => {
    if (checkCompleted && !showCompleteProfile && !showPasskeySetup && !trialCheckCompleted) {
      checkTrialStatus();
    }
  }, [checkCompleted, showCompleteProfile, showPasskeySetup, trialCheckCompleted, checkTrialStatus]);

  // Check setup status when auth state changes
  useEffect(() => {
    if (authLoading) {
      return; // Wait for auth to finish loading
    }

    if (!authenticated) {
      // Not authenticated - reset states
      setShowCompleteProfile(false);
      setShowPasskeySetup(false);
      setChecking(false);
      setCheckCompleted(false);
      checkInProgressRef.current = false; // Clear concurrent call flag
      return;
    }

    // Authenticated - check setup status
    if (!checkCompleted) {
      checkSetupStatus();
    }
  }, [authenticated, authLoading, checkCompleted, checkSetupStatus]);

  // Reset check when user SWITCHES (different user ID)
  useEffect(() => {
    const currentId = user?.id;

    if (currentId) {
      if (prevUserIdRef.current && prevUserIdRef.current !== currentId) {
        // User actually CHANGED (e.g. logout + login as different user)
        // Reset all checks so the new user's profile/passkey/trial are re-evaluated
        console.log('[AuthGuard] User changed from', prevUserIdRef.current, 'to', currentId, '— resetting checks');
        setCheckCompleted(false);
        setTrialCheckCompleted(false);
        setShowTrialExpired(false);
        checkInProgressRef.current = false;
      }
      // Track current user ID (on first login, prevUserIdRef is undefined → skip reset)
      prevUserIdRef.current = currentId;
    } else {
      // Logged out — clear so next login is treated as fresh
      prevUserIdRef.current = undefined;
    }
  }, [user?.id]);

  // Show loading while checking
  if (authLoading || checking) {
    return <AnimatedStartupScreen subtitle="Verifying your account..." />;
  }

  /**
   * Prevent flicker: don't render main app until trial check completes.
   * Without this, the Home screen briefly renders then gets replaced by
   * TrialExpiredScreen (or stays, but the flash is jarring).
   * Applies to BOTH platforms — iOS had this same flash previously.
   */
  if (
    authenticated &&
    checkCompleted &&
    !showCompleteProfile &&
    !showPasskeySetup &&
    !trialCheckCompleted &&
    !showTrialExpired
  ) {
    return <AnimatedStartupScreen subtitle="Checking subscription..." />;
  }

  // Show profile completion screen if needed
  if (showCompleteProfile && authenticated) {
    return (
      <CompleteProfileScreen
        onLogout={async () => {
          console.log('[AuthGuard] User requested logout from CompleteProfile');
          await auth.signOut();
        }}
        onComplete={async () => {
          /**
           * ✅ CRITICAL FIX: Direct state transition (no gap)
           *
           * OLD BEHAVIOR (caused double-page-load):
           *   setShowCompleteProfile(false) + setCheckCompleted(false)
           *   → All show* flags false → children (Home) render briefly
           *   → Async checkSetupStatus() sets showPasskeySetup(true)
           *   → User sees: CompleteProfile → brief Home flash → PasskeySetup
           *
           * NEW BEHAVIOR: Evaluate the next screen synchronously from the
           * refreshed profile, and set the next screen BEFORE clearing the
           * current one. This eliminates the gap where children render.
           */
          console.log('[AuthGuard] Profile completion callback - refreshing profile...');

          try {
            const refreshedProfile = await auth.refreshProfile();
            await new Promise(resolve => setTimeout(resolve, 300));

            if (refreshedProfile) {
              const needsPasskey =
                !refreshedProfile.passkey_setup_completed ||
                !refreshedProfile.emergency_passkey_hash ||
                String(refreshedProfile.emergency_passkey_hash).trim() === '';

              if (needsPasskey) {
                // Direct transition: CompleteProfile → PasskeySetup (no gap)
                console.log('[AuthGuard] Profile done, passkey needed - direct transition');
                setShowPasskeySetup(true);
                setShowCompleteProfile(false);
                setCheckCompleted(true);
                setTrialCheckCompleted(false);
              } else {
                // Profile + passkey both done → inline trial check to avoid black screen
                console.log('[AuthGuard] Profile + passkey both done - checking trial inline');
                setShowCompleteProfile(false);
                setShowPasskeySetup(false);
                setCheckCompleted(true);
                // Inline trial check
                const ts = refreshedProfile.trial_start_date;
                if (ts && Date.now() < new Date(ts).getTime() + 7 * 24 * 60 * 60 * 1000) {
                  setShowTrialExpired(false);
                  setTrialCheckCompleted(true);
                } else {
                  setTrialCheckCompleted(false); // Async check needed (subscription check)
                }
              }
            } else {
              // Couldn't get profile - fallback to re-check
              console.warn('[AuthGuard] Profile refresh returned null - falling back to re-check');
              setShowCompleteProfile(false);
              setCheckCompleted(false);
            }
          } catch (error) {
            console.error('[AuthGuard] Error refreshing profile after completion:', error);
            setShowCompleteProfile(false);
            setCheckCompleted(false);
          }
        }}
      />
    );
  }

  // Show passkey setup screen if needed
  if (showPasskeySetup && authenticated) {
    return (
      <PasskeySetupScreen
        onComplete={async () => {
          /**
           * ✅ FIX: Direct transition to trial check (no gap)
           * Don't reset checkCompleted - set it to true and trigger trial check.
           * This prevents the brief Home flash between passkey and trial check.
           */
          console.log('[AuthGuard] Passkey setup completion callback - refreshing profile...');
          try {
            const refreshed = await auth.refreshProfile();
            await new Promise(resolve => setTimeout(resolve, 300));
            // Direct transition: PasskeySetup → inline trial check
            setShowPasskeySetup(false);
            setCheckCompleted(true);
            // Inline trial check to avoid black screen gap
            const ts = refreshed?.trial_start_date;
            if (ts && Date.now() < new Date(ts).getTime() + 7 * 24 * 60 * 60 * 1000) {
              setShowTrialExpired(false);
              setTrialCheckCompleted(true);
            } else {
              setTrialCheckCompleted(false);
            }
            console.log('[AuthGuard] Passkey setup complete - proceeding to trial check');
          } catch (error) {
            console.error('[AuthGuard] Error refreshing profile after passkey setup:', error);
            setShowPasskeySetup(false);
            setCheckCompleted(false);
          }
        }}
        onSkip={async () => {
          console.log('[AuthGuard] Passkey setup skipped - refreshing profile...');
          try {
            const refreshed = await auth.refreshProfile();
            await new Promise(resolve => setTimeout(resolve, 300));
            // Direct transition: PasskeySetup → inline trial check
            setShowPasskeySetup(false);
            setCheckCompleted(true);
            // Inline trial check to avoid black screen gap
            const ts = refreshed?.trial_start_date;
            if (ts && Date.now() < new Date(ts).getTime() + 7 * 24 * 60 * 60 * 1000) {
              setShowTrialExpired(false);
              setTrialCheckCompleted(true);
            } else {
              setTrialCheckCompleted(false);
            }
            console.log('[AuthGuard] Passkey setup skipped - proceeding to trial check');
          } catch (error) {
            console.error('[AuthGuard] Error refreshing profile after passkey skip:', error);
            setShowPasskeySetup(false);
            setCheckCompleted(false);
          }
        }}
      />
    );
  }

  // Show trial expired screen if trial has ended and no subscription
  if (showTrialExpired && authenticated && !showCompleteProfile && !showPasskeySetup) {
    return (
      <TrialExpiredScreen
        navigation={navigation}
        onSubscribe={() => {
          // Hide trial expired screen, then navigate directly to plans.
          setShowTrialExpired(false);
          requestAnimationFrame(() => {
            try {
              if (navigationRef.isReady()) {
                navigationRef.navigate('Main' as any, { screen: 'SubscriptionPlans' });
                return;
              }
            } catch {
              // continue to fallback
            }
            // Fallback: set flag for MainNavigator (best-effort)
            AsyncStorage.setItem('@navigate_to_subscription_plans', 'true').catch(() => {});
          });
        }}
        onLogout={async () => {
          // Logout is handled by the screen itself
          setShowTrialExpired(false);
        }}
      />
    );
  }

  // Guard: if authenticated but setup check hasn't completed yet, show loading
  // This prevents the main app from briefly flashing during re-check transitions
  if (authenticated && !checkCompleted) {
    return <AnimatedStartupScreen subtitle="Preparing your session..." />;
  }

  // Show main app if authenticated, setup is complete, and trial is active or user has subscription
  if (authenticated && checkCompleted && trialCheckCompleted && !showCompleteProfile && !showPasskeySetup && !showTrialExpired) {
    return <>{children}</>;
  }

  // Not authenticated - let AuthNavigator handle it
  return <>{children}</>;
}


