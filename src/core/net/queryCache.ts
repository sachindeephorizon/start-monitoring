import AsyncStorage from '@react-native-async-storage/async-storage';

type CacheEntry<T> = {
  v: 1;
  t: number; // storedAt epoch ms
  data: T;
};

function now() {
  return Date.now();
}

export const QueryCache = {
  async get<T>(key: string, maxAgeMs: number): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      if (!parsed || parsed.v !== 1) return null;
      if (typeof parsed.t !== 'number') return null;
      if (now() - parsed.t > maxAgeMs) return null;
      return parsed.data ?? null;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, data: T): Promise<void> {
    const entry: CacheEntry<T> = { v: 1, t: now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

