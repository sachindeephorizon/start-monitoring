/**
 * Profile Storage Tests
 *
 * Tests for AsyncStorage-backed profile cache (profile.storage.ts).
 * Covers set/get/clear, snapshot validation, cross-user safety, and
 * the null-profile edge case that caused the hydrateProfile bug.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfileStorage } from '@/core/profile/profile.storage';

const KEY_PREFIX = 'deephorizon.profile.cache.v1';

function makeFakeProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    profile_completion_completed: true,
    date_of_birth: '1990-01-01',
    home_address: '123 Test St',
    work_address: '456 Work Ave',
    emergency_contact_name: 'Emergency Contact',
    emergency_contact_phone: '+0987654321',
    emergency_contact_relationship: 'Spouse',
    blood_type: 'O+',
    allergies: 'None',
    passkey_setup_completed: true,
    emergency_passkey_hash: 'hash-abc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

describe('ProfileStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear the mock store
    const store = (AsyncStorage as any)._store;
    Object.keys(store).forEach((k: string) => delete store[k]);
  });

  describe('set + get', () => {
    it('stores and retrieves a full profile', async () => {
      const profile = makeFakeProfile();
      await ProfileStorage.set('user-123', profile as any);

      const result = await ProfileStorage.get('user-123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('user-123');
      expect(result!.name).toBe('Test User');
      expect(result!.email).toBe('test@example.com');
    });

    it('stores null profile (new user, pre-completion)', async () => {
      await ProfileStorage.set('user-123', null);

      const result = await ProfileStorage.get('user-123');
      // Null profile = cache miss behavior
      expect(result).toBeNull();
    });

    it('returns null for non-existent user', async () => {
      const result = await ProfileStorage.get('non-existent-user');
      expect(result).toBeNull();
    });
  });

  describe('getSnapshot', () => {
    it('returns full snapshot with hydratedAt timestamp', async () => {
      const profile = makeFakeProfile();
      const before = Date.now();
      await ProfileStorage.set('user-123', profile as any);

      const snap = await ProfileStorage.getSnapshot('user-123');
      expect(snap).not.toBeNull();
      expect(snap!.userId).toBe('user-123');
      expect(snap!.hydratedAt).toBeGreaterThanOrEqual(before);
      expect(snap!.profile).not.toBeNull();
      expect(snap!.profile!.name).toBe('Test User');
    });

    it('returns snapshot with null profile (valid hydration state)', async () => {
      await ProfileStorage.set('user-123', null);

      const snap = await ProfileStorage.getSnapshot('user-123');
      expect(snap).not.toBeNull();
      expect(snap!.userId).toBe('user-123');
      expect(snap!.profile).toBeNull();
      // hydratedAt should still be set
      expect(typeof snap!.hydratedAt).toBe('number');
    });

    it('returns null for wrong user ID (cross-user safety)', async () => {
      const profile = makeFakeProfile();
      await ProfileStorage.set('user-123', profile as any);

      // Try to read with wrong user ID
      const snap = await ProfileStorage.getSnapshot('user-456');
      expect(snap).toBeNull();
    });

    it('returns null for corrupted cache entry', async () => {
      const key = `${KEY_PREFIX}.user-123`;
      await AsyncStorage.setItem(key, 'not-valid-json{{{');

      const snap = await ProfileStorage.getSnapshot('user-123');
      expect(snap).toBeNull();
    });
  });

  describe('clear', () => {
    it('removes profile for specific user', async () => {
      const profile = makeFakeProfile();
      await ProfileStorage.set('user-123', profile as any);

      await ProfileStorage.clear('user-123');

      const result = await ProfileStorage.get('user-123');
      expect(result).toBeNull();
    });
  });

  describe('clearAll', () => {
    it('removes all cached profiles (logout safety)', async () => {
      await ProfileStorage.set('user-1', makeFakeProfile({ id: 'user-1' }) as any);
      await ProfileStorage.set('user-2', makeFakeProfile({ id: 'user-2' }) as any);

      await ProfileStorage.clearAll();

      expect(await ProfileStorage.get('user-1')).toBeNull();
      expect(await ProfileStorage.get('user-2')).toBeNull();
    });

    it('does not throw on failure', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(ProfileStorage.clearAll()).resolves.toBeUndefined();
    });
  });

  describe('null-profile edge case (hydrateProfile bug)', () => {
    it('null profile snapshot is different from no snapshot', async () => {
      // No snapshot at all
      const noSnap = await ProfileStorage.getSnapshot('user-new');
      expect(noSnap).toBeNull();

      // Null profile snapshot (explicit cache entry)
      await ProfileStorage.set('user-new', null);
      const nullSnap = await ProfileStorage.getSnapshot('user-new');
      expect(nullSnap).not.toBeNull(); // Snapshot EXISTS
      expect(nullSnap!.profile).toBeNull(); // But profile is null

      // This distinction is important: hydrateProfile should treat
      // null-profile snapshots as cache misses and do a network fetch.
    });
  });
});
