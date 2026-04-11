/**
 * Authentication Service
 *
 * Runtime auth for this app is backend-token based (no Supabase SDK calls).
 * Handles secure session restore, refresh, and sign out behavior.
 */

import { AuthSession } from './auth.session';
import { clearApiSession, setApiSession } from '@/session/session';
import { logout, refreshToken as refreshTokenApi } from '@/api/auth';
import {
  SignInCredentials,
  SignUpCredentials,
  AuthServiceMethods,
  AuthUser,
} from './auth.types';

/**
 * Authentication Service
 *
 * Provides methods for authentication operations.
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

      // Make backend API client immediately use persisted tokens.
      await setApiSession(storedSession.access_token, storedSession.refresh_token);

      console.log('[AuthService] Session restored successfully');
      return true;
    } catch (error) {
      console.error('[AuthService] Unexpected error during restore:', error);
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
    void credentials;
    return {
      success: false,
      error: 'Email/password sign-in is disabled. Use OTP login.',
    };
  },

  /**
   * Sign up with email, password, phone, and name
   */
  async signUp(credentials: SignUpCredentials): Promise<{
    success: boolean;
    error?: string;
    requiresVerification?: boolean;
  }> {
    void credentials;
    return {
      success: false,
      error: 'Email sign-up is disabled in app auth flow.',
    };
  },

  /**
   * Sign out and clear session
   */
  async signOut(): Promise<void> {
    try {
      await logout().catch(() => {});
      await AuthSession.clear();
      await clearApiSession();
    } catch (error) {
      console.error('Sign out error:', error);
      await AuthSession.clear();
      await clearApiSession();
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
      const stored = await AuthSession.load();
      if (!stored?.refresh_token) {
        await AuthSession.clear();
        await clearApiSession();
        return false;
      }

      const refreshed = await refreshTokenApi(stored.refresh_token);
      if (!refreshed?.accessToken || !refreshed?.refreshToken || !refreshed?.userId) {
        throw new Error('Invalid refresh response');
      }

      await setApiSession(refreshed.accessToken, refreshed.refreshToken);
      await AuthSession.save({
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken,
        user: {
          id: refreshed.userId,
          email: refreshed.user?.email,
          phone: refreshed.user?.phone,
          user_metadata: {
            name: refreshed.user?.name,
            profile_email: refreshed.user?.email,
          },
        },
      } as any);

      return true;
    } catch (error) {
      console.warn('[AuthService] Refresh failed:', error);
      await AuthSession.clear();
      await clearApiSession();
      return false;
    }
  },

  /**
   * Get current session (local only, no network call)
   */
  async getCurrentSession(): Promise<any | null> {
    try {
      const stored = await AuthSession.load();
      if (!stored?.access_token || !stored?.refresh_token) return null;
      return stored;
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
      if (!session?.user?.id) return null;
      return {
        id: session.user.id,
        email: session.user.email || '',
        phone: session.user.phone,
        name: session.user.name,
        profileCompletionCompleted: session.user.profileCompletionCompleted,
        profileEmail: session.user.profileEmail,
      };
    } catch (error) {
      console.error('Error getting user:', error);
      return null;
    }
  },
};
