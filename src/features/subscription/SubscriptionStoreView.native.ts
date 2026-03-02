/**
 * SubscriptionStoreView Native Module
 * 
 * Provides React Native interface to Apple's native SubscriptionStoreView (iOS 17.0+)
 * This uses StoreKit's native subscription store UI which automatically includes
 * all required information (Privacy Policy, Terms of Use, pricing, etc.)
 */

import { NativeModules, Platform } from 'react-native';

// Get native module with proper error handling
const { SubscriptionStoreViewModule } = NativeModules;

// Verify module is available (will be undefined if not linked)
if (__DEV__ && Platform.OS === 'ios') {
  if (!SubscriptionStoreViewModule) {
    console.warn('[SubscriptionStoreView] Native module not found. Make sure SubscriptionStoreViewModule is properly linked.');
  }
}

/**
 * Product IDs for subscription plans
 * These must match the product IDs configured in App Store Connect
 */
export const SUBSCRIPTION_PRODUCT_IDS = [
  'com.deephorizon.security.individual.monthly.v1',
  'com.deephorizon.security.individual.yearly.v1',
  'com.deephorizon.security.family.monthly.v1',
  'com.deephorizon.security.family.yearly.v1',
];

/**
 * Subscription Group ID
 * This should match the subscription group ID in App Store Connect
 * 
 * To find your subscription group ID:
 * 1. Go to App Store Connect
 * 2. Navigate to your app → Features → Subscriptions
 * 3. Check the subscription group ID
 * 
 * If you haven't set up a subscription group yet, you can use product IDs instead.
 */
export const SUBSCRIPTION_GROUP_ID = '21880668';

/**
 * Present Apple's native SubscriptionStoreView
 * 
 * This displays Apple's native subscription store UI which automatically includes:
 * - Subscription titles, descriptions, and prices
 * - Privacy Policy link (from App Store Connect)
 * - Terms of Use (EULA) link (from App Store Connect)
 * - Purchase buttons
 * - All required subscription information
 * 
 * @param productIDs Optional array of product IDs. If not provided, uses default product IDs.
 * @returns Promise that resolves when the view is presented
 */
export async function presentSubscriptionStoreView(
  productIDs?: string[]
): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('SubscriptionStoreView is only available on iOS');
  }

  if (!SubscriptionStoreViewModule) {
    throw new Error('SubscriptionStoreViewModule is not available. Requires iOS 17.0+');
  }

  const idsToUse = productIDs || SUBSCRIPTION_PRODUCT_IDS;

  try {
    await SubscriptionStoreViewModule.presentSubscriptionStore(idsToUse);
  } catch (error: any) {
    console.error('[SubscriptionStoreView] Error presenting store:', error);
    throw error;
  }
}

/**
 * Present Apple's native SubscriptionStoreView using subscription group ID
 * 
 * This is the recommended approach as it automatically loads all subscriptions
 * in the group and displays them with proper ordering.
 * 
 * @param groupID Optional subscription group ID. If not provided, uses default group ID.
 * @returns Promise that resolves when the view is presented
 */
export async function presentSubscriptionStoreViewWithGroupID(
  groupID?: string
): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new Error('SubscriptionStoreView is only available on iOS');
  }

  if (!SubscriptionStoreViewModule) {
    throw new Error('SubscriptionStoreViewModule is not available. Requires iOS 17.0+');
  }

  const groupIDToUse = groupID || SUBSCRIPTION_GROUP_ID;

  try {
    await SubscriptionStoreViewModule.presentSubscriptionStoreWithGroupID(groupIDToUse);
  } catch (error: any) {
    console.error('[SubscriptionStoreView] Error presenting store:', error);
    throw error;
  }
}
