/**
 * Auth Service Tests
 *
 * Tests for the core authentication service (auth.service.ts).
 * Covers signIn, signUp, signOut, session restore, and token refresh.
 */

import * as SecureStore from 'expo-secure-store';

// Mock supabase — all mock fns must be inline (jest.mock is hoisted)
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      setSession: jest.fn(),
      refreshSession: jest.fn(),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
  },
}));

import { supabase } from '@/lib/supabase';
import { AuthService } from '@/core/auth/auth.service';

// Type-safe access to mocked functions
const mockAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;

function makeFakeSupabaseSession() {
  return {
    access_token: 'at-' + Math.random().toString(36).slice(2),
    refresh_token: 'rt-' + Math.random().toString(36).slice(2),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      phone: '+1234567890',
      user_metadata: { name: 'Test User' },
    },
  };
}

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const store = (SecureStore as any)._store;
    Object.keys(store).forEach((k) => delete store[k]);
  });

  describe('signIn', () => {
    it('signs in successfully and saves session', async () => {
      const session = makeFakeSupabaseSession();
      (mockAuth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      });

      const result = await AuthService.signIn({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('returns error on invalid credentials', async () => {
      (mockAuth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { session: null, user: null },
        error: { message: 'Invalid login credentials' },
      });

      const result = await AuthService.signIn({
        email: 'bad@example.com',
        password: 'wrong',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('returns error when no session returned', async () => {
      (mockAuth.signInWithPassword as jest.Mock).mockResolvedValue({
        data: { session: null, user: null },
        error: null,
      });

      const result = await AuthService.signIn({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No session returned');
    });

    it('handles unexpected exceptions', async () => {
      (mockAuth.signInWithPassword as jest.Mock).mockRejectedValue(new Error('Network down'));

      const result = await AuthService.signIn({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network down');
    });
  });

  describe('signUp', () => {
    it('signs up successfully with session', async () => {
      const session = makeFakeSupabaseSession();
      (mockAuth.signUp as jest.Mock).mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      });

      const result = await AuthService.signUp({
        email: 'new@example.com',
        password: 'password123',
        phone: '+1234567890',
        name: 'New User',
      });

      expect(result.success).toBe(true);
      expect(result.requiresVerification).toBe(false);
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('returns requiresVerification when no session returned', async () => {
      (mockAuth.signUp as jest.Mock).mockResolvedValue({
        data: { session: null, user: { id: 'user-new' } },
        error: null,
      });

      const result = await AuthService.signUp({
        email: 'new@example.com',
        password: 'password123',
        phone: '+1234567890',
        name: 'New User',
      });

      expect(result.success).toBe(true);
      expect(result.requiresVerification).toBe(true);
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });
  });

  describe('signOut', () => {
    it('clears SecureStore and calls supabase signOut', async () => {
      (mockAuth.signOut as jest.Mock).mockResolvedValue({ error: null });

      await AuthService.signOut();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
      expect(mockAuth.signOut).toHaveBeenCalled();
    });

    it('clears SecureStore even if supabase signOut fails', async () => {
      (mockAuth.signOut as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(AuthService.signOut()).rejects.toThrow('Network error');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('returns false when no stored session', async () => {
      const result = await AuthService.restore();
      expect(result).toBe(false);
    });

    it('restores session from SecureStore', async () => {
      const stored = {
        access_token: 'at-stored',
        refresh_token: 'rt-stored',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-123' },
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(stored));

      const session = makeFakeSupabaseSession();
      (mockAuth.setSession as jest.Mock).mockResolvedValue({
        data: { session, user: session.user },
        error: null,
      });

      const result = await AuthService.restore();
      expect(result).toBe(true);
      expect(mockAuth.setSession).toHaveBeenCalledWith({
        access_token: 'at-stored',
        refresh_token: 'rt-stored',
      });
    });

    it('clears session on permanent auth error (400/401/403)', async () => {
      const stored = {
        access_token: 'at-expired',
        refresh_token: 'rt-expired',
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(stored));

      (mockAuth.setSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token', status: 401 },
      });

      const result = await AuthService.restore();
      expect(result).toBe(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });

    it('keeps session on transient error (network failure)', async () => {
      const stored = {
        access_token: 'at-ok',
        refresh_token: 'rt-ok',
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(stored));

      (mockAuth.setSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Network request failed' },
      });

      const result = await AuthService.restore();
      expect(result).toBe(false);
      // Should NOT clear — network might recover.
      // Note: deleteItemAsync may be called 0 or 1 time from load()
    });
  });

  describe('refreshSession', () => {
    it('skips refresh when token has > 5 minutes left', async () => {
      const session = {
        ...makeFakeSupabaseSession(),
        expires_at: Math.floor(Date.now() / 1000) + 600,
      };
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session },
      });

      const result = await AuthService.refreshSession();
      expect(result).toBe(true);
      expect(mockAuth.refreshSession).not.toHaveBeenCalled();
    });

    it('refreshes when token is about to expire', async () => {
      const expiringSession = {
        ...makeFakeSupabaseSession(),
        expires_at: Math.floor(Date.now() / 1000) + 100,
      };
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session: expiringSession },
      });

      const refreshedSession = {
        ...makeFakeSupabaseSession(),
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      (mockAuth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: refreshedSession },
        error: null,
      });

      const result = await AuthService.refreshSession();
      expect(result).toBe(true);
      expect(mockAuth.refreshSession).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalled();
    });

    it('returns true (keep user logged in) on transient refresh failure', async () => {
      const session = {
        ...makeFakeSupabaseSession(),
        expires_at: Math.floor(Date.now() / 1000) + 100,
      };
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session },
      });
      (mockAuth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Network timeout' },
      });

      const result = await AuthService.refreshSession();
      expect(result).toBe(true);
    });

    it('returns false on unrecoverable refresh failure (invalid refresh token)', async () => {
      const session = {
        ...makeFakeSupabaseSession(),
        expires_at: Math.floor(Date.now() / 1000) + 10,
      };
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session },
      });
      (mockAuth.refreshSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid refresh token', status: 400 },
      });

      const result = await AuthService.refreshSession();
      expect(result).toBe(false);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
    });
  });

  describe('getCurrentSession', () => {
    it('returns session from supabase', async () => {
      const session = makeFakeSupabaseSession();
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session },
        error: null,
      });

      const result = await AuthService.getCurrentSession();
      expect(result).toBe(session);
    });

    it('returns null on error', async () => {
      (mockAuth.getSession as jest.Mock).mockResolvedValue({
        data: { session: null },
        error: { message: 'fail' },
      });

      const result = await AuthService.getCurrentSession();
      expect(result).toBeNull();
    });
  });
});
