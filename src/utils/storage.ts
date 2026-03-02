/**
 * Secure Storage Utilities
 * 
 * This module provides secure storage for sensitive data like passkeys,
 * tokens, and user preferences. Uses Expo SecureStore for secure storage.
 * 
 * iOS SAFETY: SecureStore uses Keychain on iOS, which persists across
 * app updates and is secure even if the device is compromised.
 */

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const STORAGE_KEYS = {
  PASSKEY: 'user_passkey',
  USER_PREFERENCES: 'user_preferences',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  NOTIFICATION_TOKEN: 'notification_token',
  LAST_LOCATION: 'last_location',
} as const;

/**
 * Store a value securely (encrypted)
 * Use this for sensitive data like passkeys
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (error) {
    console.error(`Error storing secure item ${key}:`, error);
    throw error;
  }
}

/**
 * Get a value from secure storage
 */
export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`Error retrieving secure item ${key}:`, error);
    return null;
  }
}

/**
 * Delete a value from secure storage
 */
export async function deleteSecureItem(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    console.error(`Error deleting secure item ${key}:`, error);
    throw error;
  }
}

/**
 * Store a value in regular async storage (non-sensitive data)
 */
export async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    console.error(`Error storing item ${key}:`, error);
    throw error;
  }
}

/**
 * Get a value from async storage
 */
export async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    console.error(`Error retrieving item ${key}:`, error);
    return null;
  }
}

/**
 * Delete a value from async storage
 */
export async function removeItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing item ${key}:`, error);
    throw error;
  }
}

/**
 * Store user passkey securely
 */
export async function storePasskey(passkey: string): Promise<void> {
  await setSecureItem(STORAGE_KEYS.PASSKEY, passkey);
}

/**
 * Get user passkey
 */
export async function getPasskey(): Promise<string | null> {
  return await getSecureItem(STORAGE_KEYS.PASSKEY);
}

/**
 * Clear user passkey
 */
export async function clearPasskey(): Promise<void> {
  await deleteSecureItem(STORAGE_KEYS.PASSKEY);
}

/**
 * Clear all stored data (for logout)
 */
export async function clearAllStorage(): Promise<void> {
  try {
    // Clear secure storage
    await deleteSecureItem(STORAGE_KEYS.PASSKEY);
    
    // Clear async storage
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.USER_PREFERENCES,
      STORAGE_KEYS.ONBOARDING_COMPLETE,
      STORAGE_KEYS.NOTIFICATION_TOKEN,
      STORAGE_KEYS.LAST_LOCATION,
    ]);
  } catch (error) {
    console.error('Error clearing storage:', error);
    throw error;
  }
}

// Export storage keys for reference
export { STORAGE_KEYS };

