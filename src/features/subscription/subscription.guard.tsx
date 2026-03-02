/**
 * Subscription Guard Component
 * 
 * A React component that ensures features only work when user has
 * an active subscription. Used for feature gating.
 * 
 * iOS SAFETY: Subscription state is server-owned. This component
 * only reads subscription status and gates UI accordingly.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSubscription } from './subscription.hooks';
import { UI_LABELS } from './subscription.constants';

interface SubscriptionGuardProps {
  /**
   * Children to render when user has active subscription
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when subscription is required
   */
  fallback?: React.ReactNode;

  /**
   * Show loading state while checking subscription
   * Default: true
   */
  showLoading?: boolean;
}

/**
 * Subscription Guard Component
 * 
 * Ensures that features only render when user has an active subscription.
 * Subscription state is server-owned - this component only reads and gates.
 */
export function SubscriptionGuard({
  children,
  fallback,
  showLoading = true,
}: SubscriptionGuardProps) {
  const { loading, subscription, hasActiveSubscription } = useSubscription();

  // Loading state
  if (loading && showLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Checking subscription...</Text>
      </View>
    );
  }

  // No active subscription
  if (!hasActiveSubscription) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.message}>{UI_LABELS.subscriptionRequired}</Text>
        <Text style={styles.subMessage}>
          Please activate a safety service plan to access this feature.
        </Text>
      </View>
    );
  }

  // Active subscription - render children
  return <>{children}</>;
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
    marginBottom: 8,
    fontWeight: '600',
  },
  subMessage: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
  },
});

