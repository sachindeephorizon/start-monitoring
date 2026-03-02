/**
 * Authentication Service
 *
 * Core authentication logic using Supabase Auth.
 * Handles sign in, sign up, sign out, and session management.
 *
 * iOS SAFETY:
 * - Sessions are persisted to SecureStore (survives process death)
 * - Sessions are restored on app startup
 * - Token refresh is handled by Supabase automatically
 * - No memory-only auth state
 */

import { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { AuthSession } from './auth.session';
import {
  SignInCredentials,
  SignUpCredentials,
  AuthServiceMethods,
  AuthUser,
} from './auth.types';

/**
 * Convert Supabase user to AuthUser
 */
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

/**
 * Authentication Service
 *
 * Provides methods for authentication operations.
 * All operations persist session data to SecureStore.
 */
export const AuthService: AuthServiceMethods = {
  /**
   * Restore session from secure storage
   *
   * Called on app startup to resume authentication.
   * Single attempt with 15s timeout. The caller decides whether to retry.
   *
   * @returns true if session was restored, false otherwise
   */
  async restore(): Promise<boolean> {
    try {
      const storedSession = await AuthSession.load();
      if (!storedSession) {
        console.log('[AuthService] No stored session found');
        return false;
      }

      // setSession validates tokens with Supabase server and refreshes if needed
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Session restore timed out after 15s')), 15_000);
      });

      const setSessionPromise = supabase.auth.setSession({
        access_token: storedSession.access_token,
        refresh_token: storedSession.refresh_token,
      });

      let data: any;
      let error: any;

      try {
        const result = await Promise.race([setSessionPromise, timeoutPromise]);
        data = result.data;
        error = result.error;
      } catch (err: any) {
        // Timeout or network error — keep tokens, caller can retry
        console.warn('[AuthService] Session restore failed:', err?.message);
        return false;
      }

      if (error || !data?.session) {
        const message = String((error as any)?.message ?? '').toLowerCase();
        const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);

        // Auth errors (permanent — token invalid/expired)
        const isAuthError =
          status === 400 ||
          status === 401 ||
          status === 403 ||
          message.includes('invalid') ||
          message.includes('expired') ||
          message.includes('not found');

        if (isAuthError) {
          // ✅ FIX: Before clearing, try refresh-token-only recovery.
          // setSession() may fail when the access token JWT is expired,
          // but the refresh token could still be valid on the server.
          if (storedSession.refresh_token) {
            try {
              console.warn('[AuthService] setSession failed — trying refresh-token-only recovery...');
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
                refresh_token: storedSession.refresh_token,
              });
              if (!refreshError && refreshData?.session) {
                console.log('[AuthService] Refresh-token recovery succeeded');
                await AuthSession.save(refreshData.session);
                return true;
              }
            } catch (e) {
              console.warn('[AuthService] Refresh-token recovery failed:', e);
            }
          }

          console.error('[AuthService] Unrecoverable auth error:', error?.message);
          await AuthSession.clear();
          return false;
        }

        // Network/transient errors — keep tokens for later retry
        console.warn('[AuthService] Session restore failed (recoverable):', error?.message);
        return false;
      }

      // Session restored successfully — save refreshed tokens
      await AuthSession.save(data.session);
      console.log('[AuthService] Session restored successfully');
      return true;
    } catch (error) {
      console.error('[AuthService] Unexpected error during restore:', error);
      // Do NOT clear on unknown failures; keep tokens and retry later.
      return false;
    }
  },

  /**
   * Sign in with email and password
   */
  async signIn(credentials: SignInCredentials): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        return { success: false, error: error.message || 'Sign in failed' };
      }

      if (!data.session) {
        return { success: false, error: 'No session returned' };
      }

      await AuthSession.save(data.session);
      return { success: true };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { success: false, error: error.message || 'An unexpected error occurred' };
    }
  },

  /**
   * Sign up with email, password, phone, and name
   */
  async signUp(credentials: SignUpCredentials): Promise<{
    success: boolean;
    error?: string;
    requiresVerification?: boolean;
  }> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            phone: credentials.phone,
            name: credentials.name,
          },
        },
      });

      if (error) {
        return { success: false, error: error.message || 'Sign up failed' };
      }

      const requiresVerification = !data.session;

      if (data.session) {
        await AuthSession.save(data.session);
      }

      return { success: true, requiresVerification };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { success: false, error: error.message || 'An unexpected error occurred' };
    }
  },

  /**
   * Sign out and clear session
   */
  async signOut(): Promise<void> {
    try {
      await AuthSession.clear();
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
      await AuthSession.clear();
      throw error;
    }
  },

  /**
   * Refresh the current session
   *
   * Forces a refresh of the current session token.
   *
   * Production behavior:
   * - Check if refresh is actually needed before attempting
   * - Do NOT log users out for transient failures (offline, timeouts, 5xx)
   * - Only return false when session is unrecoverable (invalid refresh token)
   *
   * @returns true if user should remain authenticated, false if must sign out
   */
  async refreshSession(): Promise<boolean> {
    try {
      const nowSec = Math.floor(Date.now() / 1000);

      // Capture current session (local, no network)
      const {
        data: { session: before },
      } = await supabase.auth.getSession();

      // Skip if token has > 2 minutes left (aligned with ensureValidSession's 60s threshold)
      if (before?.user && typeof before.expires_at === 'number') {
        const secondsLeft = before.expires_at - nowSec;
        if (secondsLeft > 120) {
          return true;
        }
      }

      // Attempt refresh
      const { data, error } = await supabase.auth.refreshSession();

      if (!error && data.session) {
        await AuthSession.save(data.session);
        return true;
      }

      // If existing session is still valid, keep user authenticated
      if (before?.user && typeof before.expires_at === 'number') {
        if (before.expires_at > nowSec + 30) {
          console.warn('[AuthService] Refresh failed but session still valid for', (before.expires_at - nowSec), 's');
          return true;
        }
      }

      const message = String((error as any)?.message ?? '').toLowerCase();
      const status = Number((error as any)?.status ?? (error as any)?.statusCode ?? 0);

      // Unrecoverable: refresh token invalid/missing
      // NOTE: status 401 alone is NOT unrecoverable — it can be a transient error
      // (e.g., temporary Supabase issue, network glitch). Only treat 401 as
      // unrecoverable when the error message explicitly says the refresh token
      // is invalid. Status 400 / 403 are more definitive signals.
      const unrecoverable =
        status === 400 ||
        status === 403 ||
        (status === 401 && (
          message.includes('invalid refresh token') ||
          message.includes('refresh token is not found') ||
          message.includes('token is expired') ||
          message.includes('invalid claim')
        )) ||
        message.includes('invalid refresh token') ||
        (message.includes('refresh token') && message.includes('not found')) ||
        (message.includes('jwt') && message.includes('expired') && !before?.user);

      if (unrecoverable) {
        console.warn('[AuthService] Refresh unrecoverable:', error);
        await AuthSession.clear();
        // Do NOT call signOut() — it fires SIGNED_OUT event which races with caller
        return false;
      }

      // Recoverable (offline / timeout / 5xx) — keep tokens
      console.warn('[AuthService] Refresh failed (recoverable):', error);
      return true;
    } catch (error) {
      console.error('[AuthService] Refresh unexpected error:', error);
      return true;
    }
  },

  /**
   * Get current session (local only, no network call)
   */
  async getCurrentSession(): Promise<Session | null> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) return null;
      return data.session;
    } catch (error) {
      console.error('Error getting session:', error);
      return null;
    }
  },

  /**
   * Get current user (derived from local session — no network call)
   *
   * IMPORTANT: Uses getSession() instead of getUser() to avoid triggering
   * network requests that can fire SIGNED_OUT events when token is expired.
   * This is safe because the session user data is sufficient for all callers.
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const session = await this.getCurrentSession();
      if (!session?.user) return null;
      return supabaseUserToAuthUser(session.user);
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  },
};
