/**
 * Auth Session Tests
 *
 * Tests for SecureStore-backed session persistence (auth.session.ts).
 * Covers save, load, clear, corruption handling, and size limits.
 */

import * as SecureStore from 'expo-secure-store';

// Must import AFTER mocks are in place
import { AuthSession } from '@/core/auth/auth.session';

const SESSION_KEY = 'deephorizon.auth.session';

function makeFakeSession(overrides: Record<string, any> = {}) {
  return {
    access_token: 'fake-access-token-' + Math.random().toString(36).slice(2),
    refresh_token: 'fake-refresh-token-' + Math.random().toString(36).slice(2),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'user-123',
      email: 'test@example.com',
      phone: '+1234567890',
      user_metadata: {
        name: 'Test User',
        profile_completion_completed: true,
        profile_email: 'test@example.com',
      },
    },
    ...overrides,
  };
}

describe('AuthSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the mock store
    const store = (SecureStore as any)._store;
    Object.keys(store).forEach((k) => delete store[k]);
  });

  describe('save', () => {
    it('saves a session to SecureStore with minimal data', async () => {
      const session = makeFakeSession();
      await AuthSession.save(session as any);

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        SESSION_KEY,
        expect.any(String)
      );

      // Verify saved data is minimal (no full user_metadata blob)
      const savedJson = (SecureStore.setItemAsync as jest.Mock).mock.calls[0][1];
      const saved = JSON.parse(savedJson);
      expect(saved.access_token).toBe(session.access_token);
      expect(saved.refresh_token).toBe(session.refresh_token);
      expect(saved.user.id).toBe('user-123');
      expect(saved.user.name).toBe('Test User');
      // Should NOT contain the full user_metadata object
      expect(saved.user.user_metadata).toBeUndefined();
    });

    it('clears session when saving null', async () => {
      await AuthSession.save(null as any);
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    });

    it('does not throw when SecureStore write fails', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Keychain unavailable'));
      const session = makeFakeSession();

      // Should NOT throw
      await expect(AuthSession.save(session as any)).resolves.toBeUndefined();
    });
  });

  describe('load', () => {
    it('returns null when no session stored', async () => {
      const result = await AuthSession.load();
      expect(result).toBeNull();
    });

    it('loads a valid session', async () => {
      const stored = {
        access_token: 'at-123',
        refresh_token: 'rt-456',
        expires_at: 1700000000,
        user: { id: 'user-abc', email: 'test@test.com' },
      };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));

      const result = await AuthSession.load();
      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('at-123');
      expect(result!.refresh_token).toBe('rt-456');
      expect(result!.user?.id).toBe('user-abc');
    });

    it('clears and returns null for corrupted JSON', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce('not-valid-json{{{');

      const result = await AuthSession.load();
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    });

    it('clears and returns null for missing tokens', async () => {
      const incomplete = { access_token: 'at-only' }; // missing refresh_token
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(incomplete));

      const result = await AuthSession.load();
      expect(result).toBeNull();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    });

    it('handles SecureStore read failure gracefully', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Keychain locked'));

      const result = await AuthSession.load();
      expect(result).toBeNull();
    });
  });

  describe('clear', () => {
    it('deletes the session key', async () => {
      await AuthSession.clear();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    });

    it('does not throw when SecureStore delete fails', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(AuthSession.clear()).resolves.toBeUndefined();
    });
  });

  describe('exists', () => {
    it('returns true when session exists', async () => {
      const stored = { access_token: 'at', refresh_token: 'rt' };
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValueOnce(JSON.stringify(stored));

      const result = await AuthSession.exists();
      expect(result).toBe(true);
    });

    it('returns false when no session', async () => {
      const result = await AuthSession.exists();
      expect(result).toBe(false);
    });
  });
});
