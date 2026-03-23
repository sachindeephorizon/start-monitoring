import React, { createContext, useEffect, useState, useCallback, ReactNode, useContext } from 'react';
import { AuthSession } from './auth.session';
import { AppBootState, AuthState } from './auth.types';
import { UserProfile } from '../profile';
import { getUserProfile, getUserSubscriptions, UserSubscription } from '@/api/auth';

type AuthContextType = AuthState & {
  appState: AppBootState;
  user: UserProfile | null;
  session: any;
  profile: UserProfile | null;

  subscriptions: UserSubscription[] | null;
  activeSubscription: UserSubscription | null;

  isSubscriptionLoading: boolean;

  completeLogin: (userId: string, tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  signOut: () => Promise<void>;
  retryBoot: () => Promise<void>;

  isAuthReady: boolean;

  refreshProfile: () => Promise<UserProfile | null>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [appState, setAppState] = useState<AppBootState>('booting');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);


const [subscriptions, setSubscriptions] = useState<UserSubscription[] | null>(null);
const [activeSubscription, setActiveSubscription] = useState<UserSubscription | null>(null);
const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(false);

const hydrateSubscriptions = useCallback(async () => {
  try {
    setIsSubscriptionLoading(true);

    const subs = await getUserSubscriptions();

    setSubscriptions(subs);

    console.log('[Auth] Fetched subscriptions:', subs);

    // ✅ Determine active subscription
    const active = subs.find(
      (s) =>
        s.status === 'ACTIVE' &&
        s.isLatest &&
        s.currentPeriodEnd &&
        new Date(s.currentPeriodEnd).getTime() > Date.now()
    ) || null;

    setActiveSubscription(active);

    console.log('[Auth] Subscriptions hydrated:', {
      total: subs.length,
      active: !!active,
    });

  } catch (err) {
    console.error('[Auth] Failed to fetch subscriptions:', err);
    setSubscriptions([]);
    setActiveSubscription(null);
  } finally {
    setIsSubscriptionLoading(false);
  }
}, []);

  // ─────────────────────────────────────────────
  // 🔥 HYDRATE PROFILE FROM YOUR BACKEND
  // ─────────────────────────────────────────────
  const hydrateProfile = useCallback(async (token: string) => {
    try {
      const res = await getUserProfile();

      console.log('[Auth] Hydrated profile:', res);

      setProfile(res);
      setAppState('ready');
      setIsAuthReady(true);

      await hydrateSubscriptions();

      return 'ready';
    } catch (e) {
      console.error('[Auth] hydrateProfile failed:', e);
      setAppState('error');
      return 'error';
    }
  }, []);


  const refreshProfile = useCallback(async () => {
  try {
    console.log('[Auth] 🔄 refreshProfile START');

    const res = await getUserProfile();

    console.log('[Auth] 📦 refreshProfile response:', res);

    setProfile(res);

    return res;
  } catch (e) {
    console.error('[Auth] ❌ refreshProfile failed:', e);
    return null;
  }
}, []);

  // ─────────────────────────────────────────────
  // 🔥 BOOT FUNCTION (APP START)
  // ─────────────────────────────────────────────
  const boot = useCallback(async () => {
    try {
      setAppState('authenticating');

      const stored = await AuthSession.load();

      if (!stored?.access_token) {
        setAppState('unauthenticated');
        return;
      }

      // Restore session
      setSession({
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
      });

      setUser(stored.user ? { id: stored.user.id } as any : null);

      // Hydrate profile
      await hydrateProfile(stored.access_token);

    } catch (e) {
      console.error('[Auth] boot failed:', e);
      setAppState('error');
    }
  }, [hydrateProfile]);

  // ─────────────────────────────────────────────
  // 🔥 COMPLETE LOGIN (OTP SUCCESS)
  // ─────────────────────────────────────────────
  const completeLogin = useCallback(async (
    userId: string,
    tokens: { access_token: string; refresh_token: string }
  ) => {
    try {
      console.log('[Auth] completeLogin');

      // Save to SecureStore
      await AuthSession.save({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        user: { id: userId },
      } as any);

      // Set state immediately
      setUser({ id: userId } as any);
      setSession(tokens);

      // Hydrate profile
      await hydrateProfile(tokens.access_token);

      // 🚀 THIS triggers navigation
      setAppState('ready');
      setIsAuthReady(true);

    } catch (e) {
      console.error('[Auth] completeLogin error:', e);
      setAppState('error');
    }
  }, [hydrateProfile]);

  // ─────────────────────────────────────────────
  // 🔥 SIGN OUT
  // ─────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try {
      await AuthSession.clear();

      setUser(null);
      setSession(null);
      setProfile(null);

      setAppState('unauthenticated');
      setIsAuthReady(false);
    } catch (e) {
      console.error('[Auth] signOut error:', e);
    }
  }, []);

  // ─────────────────────────────────────────────
  // 🔥 RETRY BOOT
  // ─────────────────────────────────────────────
  const retryBoot = useCallback(async () => {
    setAppState('booting');
    setUser(null);
    setSession(null);
    setProfile(null);
    setIsAuthReady(false);

    await boot();
  }, [boot]);

  // ─────────────────────────────────────────────
  // 🔥 INITIAL BOOT
  // ─────────────────────────────────────────────
  useEffect(() => {
    boot();
  }, []);

  // ─────────────────────────────────────────────
  // 🔥 AUTH STATE DERIVATION
  // ─────────────────────────────────────────────
  const authState: AuthState =
    appState === 'ready' && user
      ? { status: 'authenticated', user, session }
      : appState === 'unauthenticated'
      ? { status: 'unauthenticated' }
      : { status: 'loading' };


      

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        appState,
        user: user ?? null,
        session,
        profile,
        completeLogin,
        signOut,
        retryBoot,
        isAuthReady,
        refreshProfile,
        subscriptions,
  activeSubscription,
  isSubscriptionLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}