/**
 * Notification Hooks
 * 
 * React hooks for push notification handling and routing.
 */

import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { routeFromNotification } from './notification.router';
import { NotificationType, PushPayload } from './notification.types';
import { NotificationService } from './notification.service';
import { useAuth } from '@/core/auth';

function parsePushPayload(data: unknown): PushPayload | null {
  if (!data || typeof data !== 'object') return null;
  const anyData = data as Record<string, unknown>;
  const type = anyData.type;
  if (typeof type !== 'string') return null;

  const allowed: ReadonlyArray<NotificationType> = [
    'emergency',
    'check_in',
    'chat',
    'incoming_call',
    'tracking_checkin',
    'tracking_alert',
    'general',
  ];

  if (!(allowed as ReadonlyArray<string>).includes(type)) return null;
  // We validated `type` above; cast through `unknown` to satisfy TS.
  return anyData as unknown as PushPayload;
}

/**
 * Deduplication: track the identifier of the last routed notification.
 * On Android cold start, BOTH addNotificationResponseReceivedListener AND
 * getLastNotificationResponseAsync() return the same notification. Without
 * this guard, the app would double-route (navigate twice, potentially
 * opening two modals or causing a navigation stack issue).
 */
let _lastRoutedNotificationId: string | null = null;

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const identifier = response.notification.request.identifier;
  if (identifier === _lastRoutedNotificationId) return;
  _lastRoutedNotificationId = identifier;

  const payload = parsePushPayload(response.notification.request.content.data);
  if (!payload) {
    console.warn('[Notification Hook] Notification tapped with invalid payload:', response.notification.request.content.data);
    return;
  }
  console.log('[Notification Hook] Notification tapped:', payload.type, 'entity_id:', payload.entity_id, 'id:', identifier);

  // Route immediately — no delay needed.
  // The router's `_pendingNotificationNav` fallback handles the case where
  // navigation isn't ready yet (cold-start). The previous 500ms setTimeout
  // created a timing race that was too short for cold-start and unnecessary
  // for background resume.
  routeFromNotification(payload, identifier);
}

/**
 * Hook for notification routing
 *
 * Listens for notification responses (when user taps a notification)
 * and routes to the appropriate screen.
 *
 * This hook must be used in a component that's always mounted (like App.tsx)
 * to ensure notifications are handled even during cold-start.
 */
export function useNotificationRouting() {
  useEffect(() => {
    // ✅ CRITICAL FIX: Handle cold-start notification on iOS.
    //
    // On iOS, addNotificationResponseReceivedListener does NOT fire for the
    // notification that launched a killed app. getLastNotificationResponseAsync()
    // is the ONLY way to capture it. Without this, tapping a notification when
    // the app is fully closed does nothing on iOS — the app opens to Home with
    // no routing and no passkey modal.
    //
    // On Android, the listener fires for cold start too, so the dedup guard
    // (_lastRoutedNotificationId) prevents double-routing.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        console.log('[Notification Hook] Cold-start notification detected');
        handleNotificationResponse(response);
      }
    });

    // Listen for notification responses (when user taps notification)
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );

    // Listen for notifications received while app is in foreground
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const payload = parsePushPayload(notification.request.content.data);
        if (!payload) {
          console.warn('[Notification Hook] Notification received with invalid payload:', notification.request.content.data);
          return;
        }
        console.log('[Notification Hook] Notification received in foreground:', payload);
        // Notifications in foreground are handled by the notification handler
        // This listener is mainly for logging/debugging
      }
    );

    return () => {
      responseSubscription.remove();
      receivedSubscription.remove();
    };
  }, []);
}

/**
 * Hook for push notification registration
 * 
 * Registers the device for push notifications and stores the token.
 * Re-registers when user signs in or app comes to foreground.
 * 
 * This hook should be used in a component that's always mounted.
 */
export function usePushNotifications() {
  const { isAuthenticated } = useAuth();
  const registrationAttemptedRef = useRef(false);

  useEffect(() => {
    // Only register if user is authenticated
    if (!isAuthenticated) {
      return;
    }

    // Register for push notifications
    // We use a ref to prevent multiple registration attempts
    if (!registrationAttemptedRef.current) {
      registrationAttemptedRef.current = true;
      
      NotificationService.register().then((token) => {
        if (token) {
          console.log('[Push Notifications Hook] Successfully registered for push notifications');
        } else {
          console.warn('[Push Notifications Hook] Failed to register for push notifications');
        }
        registrationAttemptedRef.current = false;
      });
    }
  }, [isAuthenticated]);

  // Re-register when app comes to foreground (token might have changed)
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // Re-register when app becomes active (token might have refreshed)
        NotificationService.register();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);
}

