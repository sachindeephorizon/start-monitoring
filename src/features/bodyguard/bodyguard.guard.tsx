/**
 * Bodyguard Booking Guard Component
 * 
 * A React component that ensures bodyguard booking features only work when
 * user has an active subscription. Bodyguard booking is a premium feature.
 * 
 * This wraps SubscriptionGuard to ensure user has active subscription.
 */

import React from 'react';
import { SubscriptionGuard } from '@/features/subscription';

interface BodyguardGuardProps {
  /**
   * Children to render when user has active subscription
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when subscription is required
   */
  fallback?: React.ReactNode;
}

/**
 * Bodyguard Booking Guard Component
 * 
 * Ensures that bodyguard booking features only render when user has
 * an active subscription. Bodyguard booking is a premium feature.
 */
export function BodyguardGuard({
  children,
  fallback,
}: BodyguardGuardProps) {
  return (
    <SubscriptionGuard fallback={fallback}>
      {children}
    </SubscriptionGuard>
  );
}

