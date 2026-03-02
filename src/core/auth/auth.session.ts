/**
 * Auth Session Persistence
 * 
 * Handles secure storage and retrieval of authentication sessions.
 * 
 * iOS SAFETY:
 * - Uses SecureStore (Keychain on iOS) for secure persistence
 * - No AsyncStorage for auth data (not secure enough)
 * - No memory-only storage (doesn't survive process death)
 * - Session must be resumable, not remembered
 * 
 * Critical: On iOS, apps are killed frequently. Only SecureStore
 * data survives process death. This module ensures auth state
 * can be restored on cold start.
 */

import * as SecureStore from 'expo-secure-store';
import type { Session } from '@supabase/supabase-js';

/**
 * Session storage key
 * 
 * This key is used to store the Supabase session in SecureStore.
 */
const SESSION_KEY = 'deephorizon.auth.session';

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    profileCompletionCompleted?: boolean;
    profileEmail?: string;
  };
};

/**
 * Auth Session Storage
 * 
 * Provides secure storage for authentication sessions.
 * All auth session data is stored in SecureStore (Keychain on iOS).
 */
export const AuthSession = {
  /**
   * Save authentication session to secure storage
   * 
   * @param session The Supabase session object to save
   */
  async save(session: Session | null): Promise<void> {
    try {
      if (!session) {
        await this.clear();
        return;
      }

      /**
       * IMPORTANT:
       * Expo SecureStore has practical size limits. Supabase Session objects can be large
       * (user metadata, etc.) and may fail to persist, which would cause "logout on next open".
       *
       * We only need tokens to restore a session.
       */
      const meta = (session.user?.user_metadata ?? {}) as Record<string, any>;

      const minimal: StoredSession = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: typeof (session as any).expires_at === 'number' ? (session as any).expires_at : undefined,
        user: session.user
          ? {
              id: session.user.id,
              email: session.user.email || undefined,
              phone: session.user.phone || undefined,
              name: typeof meta?.name === 'string' ? meta.name : undefined,
              profileCompletionCompleted: meta?.profile_completion_completed === true,
              profileEmail: typeof meta?.profile_email === 'string' ? meta.profile_email : undefined,
            }
          : undefined,
      };

      await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(minimal));
    } catch (error) {
      console.error('Error saving auth session:', error);
      // Best-effort persistence. Do not break auth flow if SecureStore write fails.
    }
  },

  /**
   * Load authentication session from secure storage
   * 
   * @returns The stored session, or null if none exists
   */
  async load(): Promise<StoredSession | null> {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (!raw) {
        return null;
      }

      // Parse JSON session data
      const stored = JSON.parse(raw) as Partial<StoredSession> | null;
      if (!stored?.access_token || !stored?.refresh_token) {
        // Corrupted / incompatible data shape
        await this.clear();
        return null;
      }
      const cleaned: StoredSession = {
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_at: typeof stored.expires_at === 'number' ? stored.expires_at : undefined,
        user:
          stored.user && typeof stored.user.id === 'string'
            ? {
                id: stored.user.id,
                email: typeof stored.user.email === 'string' ? stored.user.email : undefined,
                phone: typeof stored.user.phone === 'string' ? stored.user.phone : undefined,
                name: typeof stored.user.name === 'string' ? stored.user.name : undefined,
                profileCompletionCompleted: stored.user.profileCompletionCompleted === true,
                profileEmail: typeof stored.user.profileEmail === 'string' ? stored.user.profileEmail : undefined,
              }
            : undefined,
      };

      return cleaned;
    } catch (error) {
      console.error('Error loading auth session:', error);
      // If loading fails, clear potentially corrupted data
      await this.clear();
      return null;
    }
  },

  /**
   * Clear authentication session from secure storage
   * 
   * Called on sign out or when session is invalid
   */
  async clear(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch (error) {
      console.error('Error clearing auth session:', error);
      // Don't throw - clearing is best effort
    }
  },

  /**
   * Check if a session exists in storage
   * 
   * @returns true if session exists, false otherwise
   */
  async exists(): Promise<boolean> {
    try {
      const session = await this.load();
      return session !== null;
    } catch (error) {
      return false;
    }
  },
};

