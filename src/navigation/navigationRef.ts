/**
 * Navigation Reference
 * 
 * Provides a navigation reference that can be used outside of React components.
 * This is essential for routing from push notifications, which happen outside
 * the normal React navigation flow.
 * 
 * iOS SAFETY: Push notifications can arrive at any time, including when the
 * app is killed. This ref allows navigation from notification handlers.
 */

import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '@/types';

/**
 * Navigation reference
 * 
 * This ref is attached to NavigationContainer in App.tsx and can be used
 * from anywhere, including notification handlers and background tasks.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Pending navigation queue for cold-start scenarios.
 * When a push notification opens the app and the navigator isn't mounted yet,
 * we store the action here and replay it once the navigator is ready.
 */
let pendingNavigation: { name: keyof RootStackParamList; params?: any } | null = null;

/**
 * Navigate to a screen
 *
 * Safe navigation helper that checks if navigation is ready.
 * If not ready (cold-start), queues the action for replay via replayPendingNavigation().
 */
export function navigate(name: keyof RootStackParamList, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as any, params);
  } else {
    console.warn('[Navigation] Navigation not ready, queuing action:', name);
    pendingNavigation = { name, params };
  }
}

/**
 * Replay any pending navigation action queued before the navigator was ready.
 * Call this from the NavigationContainer's onReady callback.
 */
export function replayPendingNavigation() {
  if (pendingNavigation && navigationRef.isReady()) {
    const { name, params } = pendingNavigation;
    pendingNavigation = null;
    console.log('[Navigation] Replaying queued navigation:', name);
    navigationRef.navigate(name as any, params);
  }
}

