// React Native globals
global.__DEV__ = true;

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = {};
  return {
    __esModule: true,
    default: {
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      }),
      getItem: jest.fn((key) => Promise.resolve(store[key] || null)),
      removeItem: jest.fn((key) => {
        delete store[key];
        return Promise.resolve();
      }),
      getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
      multiRemove: jest.fn((keys) => {
        keys.forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
        return Promise.resolve();
      }),
      _store: store,
    },
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => {
  const secureStore = {};
  return {
    setItemAsync: jest.fn((key, value) => {
      secureStore[key] = value;
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((key) => Promise.resolve(secureStore[key] || null)),
    deleteItemAsync: jest.fn((key) => {
      delete secureStore[key];
      return Promise.resolve();
    }),
    _store: secureStore,
  };
});

// Mock expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
        apiBaseUrl: 'https://test-api.example.com',
      },
    },
  },
}));

// Mock expo-notifications
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5 },
  AndroidNotificationPriority: { MAX: 'max' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 0, longitude: 0 } })
  ),
}));

// Silence console warnings in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('[Supabase]')) return;
  if (typeof args[0] === 'string' && args[0].includes('[Auth]')) return;
  originalWarn(...args);
};
