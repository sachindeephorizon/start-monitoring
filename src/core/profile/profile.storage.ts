/**
 * Profile Storage
 *
 * Caches the hydrated `mobile_users` profile for instant UI on cold start.
 * Stored in AsyncStorage (fast, non-sensitive). Auth tokens remain in SecureStore/Supabase storage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MobileUserProfile } from './profile.types';

const KEY_PREFIX = 'deephorizon.profile.cache.v1';

type StoredProfileSnapshot = {
  userId: string;
  hydratedAt: number; // epoch ms
  profile: MobileUserProfile | null;
};

function keyForUser(userId: string) {
  return `${KEY_PREFIX}.${userId}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export const ProfileStorage = {
  async getSnapshot(userId: string): Promise<StoredProfileSnapshot | null> {
    try {
      const raw = await AsyncStorage.getItem(keyForUser(userId));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed)) return null;

      const storedUserId = parsed.userId;
      const hydratedAt = parsed.hydratedAt;
      const profile = (parsed as any).profile as MobileUserProfile | null;

      if (storedUserId !== userId) return null;
      if (typeof hydratedAt !== 'number' || !Number.isFinite(hydratedAt)) return null;

      // Profile can be null (e.g., first boot before completion). Treat that as a valid hydration snapshot.
      return {
        userId,
        hydratedAt,
        profile: profile ?? null,
      };
    } catch {
      // If parse fails, treat as cache miss.
      return null;
    }
  },

  async get(userId: string): Promise<MobileUserProfile | null> {
    const snap = await this.getSnapshot(userId);
    return snap?.profile ?? null;
  },

  async set(userId: string, profile: MobileUserProfile | null): Promise<void> {
    const snapshot: StoredProfileSnapshot = {
      userId,
      hydratedAt: Date.now(),
      profile,
    };
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(snapshot));
  },

  async clear(userId: string): Promise<void> {
    await AsyncStorage.removeItem(keyForUser(userId));
  },

  /**
   * Best-effort: clears all cached profiles for all users.
   * Used on logout to prevent cross-user cache leakage.
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const profileKeys = keys.filter((k) => k.startsWith(`${KEY_PREFIX}.`));
      if (profileKeys.length > 0) {
        await AsyncStorage.multiRemove(profileKeys);
      }
    } catch {
      // Best-effort only.
    }
  },
};

