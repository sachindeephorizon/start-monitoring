import React, { useState, useEffect, useCallback } from 'react';
import AnimatedStartupScreen from '@/components/startup/AnimatedStartupScreen';
import { useNavigation } from '@react-navigation/native';
import { navigationRef } from '@/navigation/navigationRef';
import { useAuth } from './auth.hooks';
import { PasskeySetupScreen } from '@/screens/PasskeySetupScreen';
import { CompleteProfileScreen } from '@/screens/CompleteProfileScreen';
import SubscriptionRequiredScreen from '@/screens/TrialExpiredScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile } from '../profile';
import { SubscriptionStatus } from '@/api/auth';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const auth = useAuth();
  const authenticated = auth.status === 'authenticated';
  const user: UserProfile | null = authenticated ? auth.user : null;
  const authLoading = auth.status === 'loading';

  const [checking, setChecking] = useState(true);
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [showPasskeySetup, setShowPasskeySetup] = useState(false);
  const [showSubscriptionRequired, setShowSubscriptionRequired] = useState(false);
  const [checkCompleted, setCheckCompleted] = useState(false);

  const checkInProgressRef = React.useRef(false);
  const prevUserIdRef = React.useRef<string | undefined>(undefined);

  const authProfileRef = React.useRef(auth.profile);
  useEffect(() => {
    authProfileRef.current = auth.profile;
  }, [auth.profile]);

  const navigation = useNavigation<any>();

  useEffect(() => {
    if (checking) {
      const timeout = setTimeout(() => {
        setChecking(false);
        setCheckCompleted(true);
        checkInProgressRef.current = false;
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [checking]);

  const checkSetupStatus = useCallback(async () => {
    if (!authenticated || !user) {
      setChecking(false);
      checkInProgressRef.current = false;
      return;
    }

    if (checkInProgressRef.current) return;
    checkInProgressRef.current = true;

    try {
      const profile = auth.profile;

      if (profile) {
        setChecking(false);
      }

      if (!profile) {
        if (auth.appState !== 'ready') {
          setChecking(false);
          setCheckCompleted(false);
          return;
        }

        const profileLoaded = await new Promise<boolean>((resolve) => {
          if (authProfileRef.current) return resolve(true);

          let elapsed = 0;
          let delay = 100;

          const check = () => {
            setTimeout(() => {
              if (authProfileRef.current) return resolve(true);
              elapsed += delay;
              if (elapsed >= 5000) return resolve(false);
              delay = Math.min(delay * 2, 1000);
              check();
            }, delay);
          };

          check();
        });

        if (!profileLoaded) {
          setShowCompleteProfile(true);
          setShowPasskeySetup(false);
          setChecking(false);
          setCheckCompleted(true);
          return;
        }

        setChecking(false);
        setCheckCompleted(false);
        return;
      }

      const needsProfile = profile.isProfileComplete !== true;

      const needsPasskey =
        !profile.isPasskeySetupComplete ||
        !profile.emergencyPassKeyHash ||
        String(profile.emergencyPassKeyHash).trim() === '';

      if (needsProfile) {
        setShowCompleteProfile(true);
        setShowPasskeySetup(false);
      } else if (needsPasskey) {
        setShowCompleteProfile(false);
        setShowPasskeySetup(true);
      } else {
        setShowCompleteProfile(false);
        setShowPasskeySetup(false);
      }

      setChecking(false);
      setCheckCompleted(true);
    } catch {
      setShowCompleteProfile(false);
      setShowPasskeySetup(false);
      setChecking(false);
      setCheckCompleted(true);
    } finally {
      checkInProgressRef.current = false;
    }
  }, [authenticated, user, auth.profile, auth.appState]);

  const checkSubscription = useCallback(() => {
    if (!authenticated || !user || !checkCompleted || showCompleteProfile || showPasskeySetup) {
      return;
    }

    if (auth.isSubscriptionLoading) return;

    const sub = auth.activeSubscription;

    if (
      sub &&
      sub.status === SubscriptionStatus.ACTIVE &&
      sub.currentPeriodEnd &&
      new Date(sub.currentPeriodEnd).getTime() > Date.now()
    ) {
      setShowSubscriptionRequired(false);
      return;
    }

    setShowSubscriptionRequired(true);
  }, [
    authenticated,
    user,
    checkCompleted,
    showCompleteProfile,
    showPasskeySetup,
    auth.activeSubscription,
    auth.isSubscriptionLoading
  ]);

  useEffect(() => {
    if (checkCompleted && !showCompleteProfile && !showPasskeySetup) {
      checkSubscription();
    }
  }, [checkCompleted, showCompleteProfile, showPasskeySetup, checkSubscription]);

  useEffect(() => {
    if (authLoading) return;

    if (!authenticated) {
      setShowCompleteProfile(false);
      setShowPasskeySetup(false);
      setChecking(false);
      setCheckCompleted(false);
      checkInProgressRef.current = false;
      return;
    }

    if (!checkCompleted) {
      checkSetupStatus();
    }
  }, [authenticated, authLoading, checkCompleted, checkSetupStatus]);

  useEffect(() => {
    const currentId = user?.id;

    if (currentId) {
      if (prevUserIdRef.current && prevUserIdRef.current !== currentId) {
        setCheckCompleted(false);
        setShowSubscriptionRequired(false);
        checkInProgressRef.current = false;
      }
      prevUserIdRef.current = currentId;
    } else {
      prevUserIdRef.current = undefined;
    }
  }, [user?.id]);

  if (authLoading || checking) {
    return <AnimatedStartupScreen subtitle="Verifying your account..." />;
  }

  if (
    authenticated &&
    checkCompleted &&
    !showCompleteProfile &&
    !showPasskeySetup &&
    auth.isSubscriptionLoading
  ) {
    return <AnimatedStartupScreen subtitle="Checking subscription..." />;
  }

  if (showCompleteProfile && authenticated) {
    return (
      <CompleteProfileScreen
        onLogout={auth.signOut}
        onComplete={async () => {
          const refreshed = await auth.refreshProfile();
          await new Promise(r => setTimeout(r, 300));

          if (refreshed) {
            const needsPasskey =
              !refreshed.isPasskeySetupComplete ||
              !refreshed.emergencyPassKeyHash ||
              String(refreshed.emergencyPassKeyHash).trim() === '';

            if (needsPasskey) {
              setShowPasskeySetup(true);
              setShowCompleteProfile(false);
              setCheckCompleted(true);
            } else {
              setShowCompleteProfile(false);
              setCheckCompleted(true);
            }
          } else {
            setShowCompleteProfile(false);
            setCheckCompleted(false);
          }
        }}
      />
    );
  }

  if (showPasskeySetup && authenticated) {
    return (
      <PasskeySetupScreen
        onComplete={async () => {
          await auth.refreshProfile();
          await new Promise(r => setTimeout(r, 300));
          setShowPasskeySetup(false);
          setCheckCompleted(true);
        }}
        onSkip={async () => {
          await auth.refreshProfile();
          await new Promise(r => setTimeout(r, 300));
          setShowPasskeySetup(false);
          setCheckCompleted(true);
        }}
      />
    );
  }

  if (showSubscriptionRequired && authenticated) {
    return (
      <SubscriptionRequiredScreen
        navigation={navigation}
        onSubscribe={() => {
          setShowSubscriptionRequired(false);
          requestAnimationFrame(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('Main' as any, { screen: 'SubscriptionPlans' });
            } else {
              AsyncStorage.setItem('@navigate_to_subscription_plans', 'true').catch(() => {});
            }
          });
        }}
        onLogout={() => setShowSubscriptionRequired(false)}
      />
    );
  }

  if (authenticated && !checkCompleted) {
    return <AnimatedStartupScreen subtitle="Preparing your session..." />;
  }

  if (
    authenticated &&
    checkCompleted &&
    !showCompleteProfile &&
    !showPasskeySetup &&
    !showSubscriptionRequired
  ) {
    return <>{children}</>;
  }

  return <>{children}</>;
}