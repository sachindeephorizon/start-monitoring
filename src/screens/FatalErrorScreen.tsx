/**
 * FatalErrorScreen
 *
 * Shown when the app cannot satisfy the boot contract (auth + profile hydration).
 * This is intentionally simple and production-safe.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '@/core/auth';

export default function FatalErrorScreen() {
  const auth = useAuth();

  /**
   * ✅ CRITICAL FIX: User-friendly error messages
   * Map technical error codes to clear, actionable messages for users
   */
  /**
   * ✅ ANDROID FIX: Enhanced error messages for cold start issues
   * Provides clearer guidance for common Android cold start problems
   */
  const message =
    auth.bootError === 'OFFLINE_NO_PROFILE_CACHE'
      ? 'You appear to be offline and we could not load your profile from cache. Please connect to the internet and try again.'
      : auth.bootError === 'SUPABASE_NOT_CONFIGURED'
        ? 'App configuration is missing (Supabase URL/Key). This build cannot sign in until it is rebuilt with the correct EXPO_PUBLIC_* environment values.'
      : auth.bootError === 'PROFILE_FAILED_NETWORK'
        ? 'We could not load your profile due to a network or timeout issue. This can happen on slow connections or after the app has been inactive. Please check your internet connection and tap Retry.'
      : auth.bootError === 'PROFILE_FAILED_AUTH'
        ? 'Your session is no longer valid. Please sign out and sign in again.'
      : auth.bootError === 'PROFILE_FAILED'
        ? 'We could not load your profile. This might be a temporary issue. Please tap Retry or sign out and sign in again.'
      : auth.bootError === 'AUTH_INIT_FAILED'
        ? 'Authentication initialization failed. Please check your internet connection and tap Retry.'
      : auth.bootError === 'BOOT_TIMEOUT'
        ? 'Startup is taking longer than expected. This can happen after the app has been inactive for a while. Please tap Retry. If this keeps happening, try signing out and back in, or check your internet connection.'
      : auth.bootError === 'UNRECOVERABLE_REFRESH'
        ? 'Your session has expired. Please sign out and sign in again.'
        : 'We could not start the app. Please check your connection and try again.';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      {/* ✅ IMPROVEMENT: Only show technical error code in development */}
      {__DEV__ && !!auth.bootError && (
        <Text style={styles.code}>Error code: {auth.bootError}</Text>
      )}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => {
          auth.retryBoot().catch(() => {});
        }}
      >
        <Text style={styles.primaryButtonText}>Retry</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryButton, styles.secondaryButton]}
        onPress={() => {
          // Best-effort recovery: sign out and let the user sign back in cleanly.
          auth.signOut().catch(() => {});
        }}
      >
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  message: {
    color: '#d0d0d0',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  code: {
    color: '#9a9a9a',
    fontSize: 12,
    marginBottom: 16,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#203b84',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

