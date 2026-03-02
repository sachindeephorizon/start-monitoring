/**
 * Subscription Access Utility
 * 
 * Checks if user has active subscription or trial access
 */

import { Alert } from 'react-native';
import { SubscriptionService } from '@/services/subscription.service';
import { isCallPriorityActive } from '@/services/callPriority';
import { navigationRef } from '@/navigation/navigationRef';

/**
 * Check if user has active subscription or trial access
 * Shows "Subscribe to use" alert if access is denied
 * @param featureName - Name of the feature being accessed (optional, for better UX)
 * @returns Promise<boolean> - true if user has access, false otherwise
 */
export async function checkSubscriptionAccess(featureName?: string): Promise<boolean> {
  try {
    // During call start/active, never run extra subscription network calls that can contend with Stream token/connect/join.
    // If a feature is already in progress (video call), we avoid blocking it behind subscription checks.
    if (isCallPriorityActive()) {
      return true;
    }
    const { hasAccess, error } = await SubscriptionService.hasActiveSubscription();

    if (hasAccess) {
      return true;
    }

    // If hasActiveSubscription returned an error (network, session, etc.),
    // allow access rather than blocking with a misleading "subscribe" message.
    // Server-side RLS still enforces subscription for actual operations.
    if (error) {
      console.warn('Subscription check returned error — allowing access (graceful degradation):', error);
      return true;
    }

    // Check trial status to provide better messaging
    const { isTrialActive, daysRemaining, error: trialError } = await SubscriptionService.getTrialStatus();

    if (isTrialActive) {
      // Trial is still active, allow access
      return true;
    }

    // If trial check also had an error, allow access (graceful degradation)
    if (trialError) {
      console.warn('Trial check returned error — allowing access (graceful degradation):', trialError);
      return true;
    }

    // Trial has genuinely ended - navigate to TrialExpired screen instead of showing alert
    if (navigationRef.isReady()) {
      try {
        // Navigate to TrialExpired screen in Main navigator
        const rootState = navigationRef.getRootState();
        if (rootState) {
          const mainState = rootState.routes.find((r: any) => r.name === 'Main');
          if (mainState) {
            // We're in Main navigator, navigate to TrialExpired screen
            navigationRef.navigate('TrialExpired' as any);
          } else {
            // Navigate to Main first, then TrialExpired
            navigationRef.navigate('Main' as any, {
              screen: 'TrialExpired',
            });
          }
        } else {
          // Fallback: try direct navigation
          navigationRef.navigate('Main' as any, {
            screen: 'TrialExpired',
          });
        }
      } catch (navError) {
        console.error('Error navigating to TrialExpired screen:', navError);
        // Fallback to alert if navigation fails
        const featureText = featureName ? ` to use ${featureName}` : '';
        Alert.alert(
          'Subscribe to Use',
          `Your 7-day free trial has ended. Please subscribe${featureText}.`,
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
      const featureText = featureName ? ` to use ${featureName}` : '';
      Alert.alert(
        'Subscribe to Use',
        `Your 7-day free trial has ended. Please subscribe${featureText}.`,
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

