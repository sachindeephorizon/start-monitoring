/**
 * Authentication Guard Component
 * 
 * A React component that ensures only authenticated users can access
 * protected content. Shows loading state while checking authentication,
 * and redirects to auth flow if not authenticated.
 * 
 * iOS SAFETY: This component handles cold-start scenarios where
 * authentication state is being restored from SecureStore.
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from './auth.hooks';

interface AuthGuardProps {
  /**
   * Children to render when user is authenticated
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when user is not authenticated
   * If not provided, shows default "Please sign in" message
   */
  fallback?: React.ReactNode;

  /**
   * Show loading indicator while checking authentication
   * Default: true
   */
  showLoading?: boolean;
}

/**
 * Authentication Guard Component
 * 
 * Protects content behind authentication. Only renders children
 * when user is authenticated. Handles loading and unauthenticated states.
 */
export function AuthGuard({
  children,
  fallback,
  showLoading = true,
}: AuthGuardProps) {
  const auth = useAuth();

  // Loading state - checking authentication
  if (auth.status === 'loading') {
    if (!showLoading) {
      return null;
    }
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  // Not authenticated - show fallback or default message
  if (auth.status === 'unauthenticated') {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Please sign in to continue</Text>
      </View>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}

/**
 * Hook version of AuthGuard
 * 
 * Use this when you need auth state but don't want to use the guard component.
 * Returns auth state and methods.
 */
export function useAuthGuard() {
  const auth = useAuth();

  return {
    ...auth,
    isAuthenticated: auth.status === 'authenticated',
    isLoading: auth.status === 'loading',
    isUnauthenticated: auth.status === 'unauthenticated',
    user: auth.status === 'authenticated' ? auth.user : null,
    Guard: ({ children, fallback, showLoading }: Omit<AuthGuardProps, 'children'> & { children: React.ReactNode }) => (
      <AuthGuard fallback={fallback} showLoading={showLoading}>
        {children}
      </AuthGuard>
    ),
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  message: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
});

