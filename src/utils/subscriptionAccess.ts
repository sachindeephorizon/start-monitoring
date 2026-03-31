/**
 * Subscription Access Utility
 * 
 * Checks if user has active subscription access.
 *
 * NOTE:
 * - The app now uses a single plan model (no per-feature access rules).
 * - This utility is kept for non-hook call sites and mirrors useSubscription logic.
 */

import { Alert } from 'react-native';
import { getUserSubscriptions, SubscriptionStatus, UserSubscription } from '@/api/auth';
import { isCallPriorityActive } from '@/services/callPriority';
import { navigationRef } from '@/navigation/navigationRef';

/**
 * Check if user has active subscription access.
 * @param featureName - Kept for API compatibility. Ignored for access logic.
 * @returns Promise<boolean> - true if user has access, false otherwise
 */
export async function checkSubscriptionAccess(featureName?: string): Promise<boolean> {
  try {
    // During call start/active, never run extra subscription network calls that can contend with Stream token/connect/join.
    // If a feature is already in progress (video call), we avoid blocking it behind subscription checks.
    if (isCallPriorityActive()) {
      return true;
    }

    const subscriptions = await getUserSubscriptions();
    const hasAccess = hasActiveSubscription(subscriptions);
    if (hasAccess) return true;

    // Single-plan model: no feature-specific gating.
    // Navigate to subscription plans when access is missing.
    if (navigationRef.isReady()) {
      try {
        navigationRef.navigate('Main' as any, { screen: 'SubscriptionPlans' });
      } catch (navError) {
        console.error('Error navigating to SubscriptionPlans screen:', navError);
        // Fallback to alert if navigation fails
        Alert.alert(
          'Subscription Required',
          'Please subscribe to continue using the app.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Subscribe',
              style: 'default',
            },
          ]
        );
      }
    } else {
      // Navigation not ready, show alert as fallback
      Alert.alert(
        'Subscription Required',
        'Please subscribe to continue using the app.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Subscribe',
            style: 'default',
          },
        ]
      );
    }

    return false;
  } catch (error: any) {
    // Graceful degradation: allow access on transient errors rather than
    // blocking the user with a misleading "subscribe" message.
    // Server-side RLS still enforces subscription for actual operations.
    console.warn('Error checking subscription access — allowing access (graceful degradation):', error);
    return true;
  }
}

function hasActiveSubscription(subscriptions: UserSubscription[] | null | undefined): boolean {
  if (!subscriptions?.length) return false;

  const latestSub = subscriptions.find((s) => s.isLatest) || subscriptions[0];
  if (!latestSub) return false;

  return (
    latestSub.status === SubscriptionStatus.ACTIVE &&
    new Date(latestSub.currentPeriodEnd) > new Date()
  );
}

/**
 * Wrapper function that checks subscription access before executing a callback
 * @param callback - Function to execute if access is granted
 * @param featureName - Name of the feature (optional)
 */
export async function withSubscriptionCheck(
  callback: () => void | Promise<void>,
  featureName?: string
): Promise<void> {
  const hasAccess = await checkSubscriptionAccess(featureName);
  if (hasAccess) {
    await callback();
  }
}

