/**
 * Notification Router
 * 
 * Routes the app to the correct screen when a push notification is tapped.
 * This is CRITICAL for cold-start scenarios where the app is opened from a notification.
 * 
 * iOS SAFETY: Push notifications can cold-start the app. This router ensures
 * the app opens to the correct screen based on the notification payload.
 */

import { navigate, navigationRef } from '@/navigation/navigationRef';
import { PushPayload } from './notification.types';

/**
 * Pending notification navigation intent.
 *
 * On cold start, `navigate()` queues the action and `replayPendingNavigation()`
 * replays it when NavigationContainer mounts. However, AuthGuard blocks
 * MainNavigator from mounting until profile/passkey/trial checks complete.
 * By the time MainNavigator mounts, it initializes its own default state,
 * which overwrites the queued navigation params — the `openService` param
 * or `checkInId` is silently lost.
 *
 * This module-level variable stores the intended route. HomeScreen consumes
 * it on focus (after AuthGuard completes) as a reliable fallback.
 *
 * IMPORTANT: Only `consumePendingNotificationNav()` clears this value.
 * `navigateToMainScreen()` must NOT clear it — even when navigation is ready —
 * because the target screen hasn't mounted yet at that point.
 */
interface PendingNotificationNav {
  screen: string;
  params?: Record<string, any>;
  notificationId?: string;
  createdAt: number;
}

let _pendingNotificationNav: PendingNotificationNav | null = null;

/**
 * Consume the pending notification route (returns once, then clears).
 * Called by HomeScreen on focus to handle cold-start notification routing.
 */
export function consumePendingNotificationNav(): PendingNotificationNav | null {
  const nav = _pendingNotificationNav;
  if (nav) {
    console.log('[Notification Router] Consuming pending nav:', nav.screen, nav.params, 'age:', Date.now() - nav.createdAt, 'ms');
  }
  _pendingNotificationNav = null;
  return nav;
}

/**
 * Peek at the pending notification route without clearing it.
 * Useful for diagnostic logging.
 */
export function peekPendingNotificationNav(): PendingNotificationNav | null {
  return _pendingNotificationNav;
}

/**
 * Explicitly clear the pending notification route with a reason.
 * Used by consuming screens after they've processed the intent.
 */
export function clearPendingNotificationNav(reason: string): void {
  if (_pendingNotificationNav) {
    console.log('[Notification Router] Clearing pending nav:', reason, _pendingNotificationNav.screen);
  }
  _pendingNotificationNav = null;
}

/**
 * Navigate into a screen inside MainNavigator via the root navigator.
 *
 * The root navigator only has "Main" and "Auth" screens.
 * All app screens (Home, CheckIn, Emergency, etc.) live inside MainNavigator,
 * which is nested under "Main". Calling `navigate('CheckIn', ...)` from the
 * root ref silently fails because CheckIn isn't at the root level.
 *
 * Instead we must use: navigate('Main', { screen: 'CheckIn', params: {...} })
 * This tells React Navigation to go into the Main stack and then to the nested screen.
 */
function navigateToMainScreen(screen: string, params?: Record<string, any>, notificationId?: string): void {
  // Store for cold-start fallback BEFORE attempting navigate.
  // Do NOT clear even if navigationRef.isReady() — the target screen
  // (HomeScreen/CheckInScreen) hasn't mounted yet, and params may be
  // overwritten by MainNavigator's default initial state.
  // Only consumePendingNotificationNav() clears this.
  _pendingNotificationNav = { screen, params, notificationId, createdAt: Date.now() };

  console.log('[Notification Router] navigateToMainScreen:', screen, params, 'navReady:', navigationRef.isReady());

  navigate('Main', { screen, ...(params ? { params } : {}) });
}

/**
 * Route to screen based on notification payload
 *
 * This function is called when a user taps a notification.
 * It parses the payload and navigates to the appropriate screen.
 *
 * IMPORTANT: This function must handle the case where navigation is not ready yet
 * (during cold-start). The notification hook will queue navigation until ready.
 *
 * @param payload Push notification payload
 * @param notificationId Optional notification identifier for dedup tracking
 */
export function routeFromNotification(payload: PushPayload, notificationId?: string): void {
  try {
    console.log('[Notification Router] Routing from notification:', payload.type, 'entity_id:', payload.entity_id, 'notificationId:', notificationId);

    switch (payload.type) {
      case 'emergency': {
        if (payload.entity_id) {
          navigateToMainScreen('Emergency', { emergencyId: payload.entity_id }, notificationId);
        } else {
          navigateToMainScreen('Emergency', undefined, notificationId);
        }
        break;
      }

      case 'incoming_call': {
        const callId = payload.call_id || payload.entity_id;
        console.log('[Notification Router] Incoming call notification — routing to VideoMonitor', {
          callId,
        });
        // NOTE: The current app's implemented video call entry screen is `VideoMonitor`.
        // If/when a dedicated `VideoCall` route is added, update this mapping.
        navigateToMainScreen('VideoMonitor', callId ? { callId } : undefined, notificationId);
        break;
      }

      case 'check_in': {
        // Scheduled check-ins can rotate the active job ID after a push is sent.
        // Navigating directly with a notification-time checkInId can open a stale
        // CheckIn screen while the shared due-job watcher also surfaces the latest
        // active modal, resulting in duplicate passkey prompts.
        //
        // Route to Home instead and let the global CheckInPasskeyHost refresh via
        // API/socket and present the single current due check-in modal.
        navigateToMainScreen('Home', undefined, notificationId);
        break;
      }

      case 'chat': {
        const threadId = payload.thread_id || payload.chat_id || payload.entity_id;
        navigateToMainScreen('Chat', threadId ? { threadId } : undefined, notificationId);
        break;
      }

      case 'tracking_checkin': {
        console.log('[Notification Router] Tracking check-in notification — routing to Home (auto-open tracking)');
        navigateToMainScreen('Home', { openService: 'tracking' }, notificationId);
        break;
      }

      case 'tracking_alert': {
        console.log('[Notification Router] Tracking alert notification — routing to Home');
        navigateToMainScreen('Home', undefined, notificationId);
        break;
      }

      case 'general':
      default: {
        navigateToMainScreen('Home', undefined, notificationId);
        break;
      }
    }
  } catch (error) {
    console.error('[Notification Router] Error routing from notification:', error);
    navigateToMainScreen('Home', undefined, notificationId);
  }
}

