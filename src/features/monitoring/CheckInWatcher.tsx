/**
 * Global check-in watcher.
 *
 * Lives once at the top of the nav tree (mounted by MonitoringSessionProvider)
 * so the check-in prompt can fire from ANY screen — Home, Profile, deep
 * settings — not only from ActiveMonitoring.
 *
 * Two firing paths:
 *   1. Foreground tick: every second, if `nextCheckinAt` is in the past and
 *      we haven't already prompted for this deadline, navigate to
 *      CheckInPrompt via navigationRef.
 *   2. Background notification: every time `nextCheckinAt` changes we
 *      schedule a local notification at that time so the OS wakes the user
 *      even when the app is backgrounded or killed. Tapping the notification
 *      deep-links to CheckInPrompt.
 *
 * The two paths are deduped by `lastPromptedRef` so we never prompt twice
 * for the same deadline.
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useMonitoringSession } from './MonitoringSession';
import { navigationRef } from '@/navigation/navigationRef';

const NOTIFICATION_CATEGORY = 'monitoring-checkin';
const NOTIFICATION_DATA_TAG = 'monitoring_checkin';
const NOTIFICATION_MISSED_TAG = 'monitoring_checkin_missed';
const MONITORING_CHANNEL_ID = 'monitoring';

const RESPONSE_WINDOW_MS = 30_000;

let handlerInstalled = false;
function ensureNotificationHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return MONITORING_CHANNEL_ID;
  try {
    await Notifications.setNotificationChannelAsync(MONITORING_CHANNEL_ID, {
      name: 'Safety check-ins',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1d6fa4',
      sound: 'default',
    });
  } catch {
    // best-effort
  }
  return MONITORING_CHANNEL_ID;
}

export async function cancelAllCheckInNotificationsByTag(): Promise<void> {
  try {
    const pending = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of pending) {
      const d = (n.content as any)?.data as Record<string, unknown> | undefined;
      if (d?.type === NOTIFICATION_DATA_TAG || d?.type === NOTIFICATION_MISSED_TAG) {
        try {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }
}

function navigateToMainScreen(screen: string, params?: Record<string, unknown>) {
  if (!navigationRef.isReady()) return;
  (navigationRef as any).navigate('Main', {
    screen,
    ...(params ? { params } : {}),
  });
}

function navigateToPrompt(dueAt?: string | null, intervalMinutes?: number | null, startedAt?: number | null) {
  if (!navigationRef.isReady()) return;
  navigateToMainScreen('CheckInPrompt', {
    dueAt: dueAt ?? undefined,
    intervalMinutes: intervalMinutes ?? undefined,
    startedAt: startedAt ?? undefined,
  });
}

function navigateToEscalation() {
  if (!navigationRef.isReady()) return;
  const current = navigationRef.getCurrentRoute()?.name as string | undefined;
  if (current === 'Escalation') return;
  // Direct navigate instead of nested Main→Escalation which no-ops from inside MainNavigator.
  try {
    (navigationRef as any).navigate('Escalation');
  } catch {
    navigateToMainScreen('Escalation');
  }
}

export const CheckInWatcher: React.FC = () => {
  const monitoring = useMonitoringSession();

  const lastPromptedRef = useRef<string | null>(null);
  const scheduledForRef = useRef<string | null>(null);
  const scheduledIdRef = useRef<string | null>(null);
  const scheduledMissedIdRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const notificationPermissionGrantedRef = useRef<boolean | null>(null);
  const isActiveRef = useRef<boolean>(monitoring.isActive);
  useEffect(() => {
    isActiveRef.current = monitoring.isActive;
  }, [monitoring.isActive]);

  const ensureNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (notificationPermissionGrantedRef.current === true) {
      return true;
    }
    try {
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;

      if (status !== 'granted' && existing.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }

      const granted = status === 'granted';
      notificationPermissionGrantedRef.current = granted;
      if (!granted) {
        console.warn('[CheckInWatcher] notification permission not granted; background check-in alerts disabled');
      }
      return granted;
    } catch (e) {
      notificationPermissionGrantedRef.current = false;
      console.warn('[CheckInWatcher] failed to verify notification permission', e);
      return false;
    }
  }, []);

  useEffect(() => {
    ensureNotificationHandler();
    ensureAndroidChannel();
    ensureNotificationPermission().catch(() => {});
    cancelAllCheckInNotificationsByTag().catch(() => {});

    const tapSub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as Record<string, unknown>;
      if (!isActiveRef.current) return;

      if (data?.type === NOTIFICATION_DATA_TAG) {
        navigateToPrompt(
          (data.dueAt as string) ?? undefined,
          (data.intervalMinutes as number) ?? undefined,
          (data.startedAt as number) ?? undefined,
        );
      } else if (data?.type === NOTIFICATION_MISSED_TAG) {
        monitoring.pushTierSignal('missed_checkin');
        navigateToEscalation();
      }
    });

    const appStateSub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
    });

    return () => {
      tapSub.remove();
      appStateSub.remove();
    };
  }, [ensureNotificationPermission, monitoring.pushTierSignal]);

  const dbg = monitoring.getEngineDebug();
  const inEscalation =
    !!dbg &&
    (dbg.activeSignals.includes('missed_checkin') ||
      dbg.activeSignals.includes('long_deviation') ||
      dbg.activeSignals.includes('user_needs_help'));

  useEffect(() => {
    if (!monitoring.isActive || inEscalation) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    const tick = () => {
      const due = monitoring.nextCheckinAt;
      if (!due) return;
      if (lastPromptedRef.current === due) return;
      const dueMs = new Date(due).getTime();
      if (!Number.isFinite(dueMs)) return;
      const now = Date.now();
      if (now < dueMs) return;

      let current: string | undefined;
      if (navigationRef.isReady()) {
        current = navigationRef.getCurrentRoute()?.name as string | undefined;
        if (current === 'Escalation') {
          lastPromptedRef.current = due;
          return;
        }
      }

      if (now >= dueMs + RESPONSE_WINDOW_MS) {
        lastPromptedRef.current = due;
        monitoring.pushTierSignal('missed_checkin');
        navigateToEscalation();
        return;
      }

      if (current === 'CheckInPrompt') {
        lastPromptedRef.current = due;
        return;
      }

      lastPromptedRef.current = due;
      navigateToPrompt(due, monitoring.intervalMinutes, monitoring.startedAt);
    };

    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [monitoring.isActive, monitoring.nextCheckinAt, monitoring.intervalMinutes, monitoring.startedAt, inEscalation]);

  useEffect(() => {
    const cancelPending = async () => {
      const ids = [scheduledIdRef.current, scheduledMissedIdRef.current].filter(
        (x): x is string => !!x,
      );
      for (const id of ids) {
        try {
          await Notifications.cancelScheduledNotificationAsync(id);
        } catch {
          // best-effort
        }
      }
      await cancelAllCheckInNotificationsByTag();
      scheduledIdRef.current = null;
      scheduledMissedIdRef.current = null;
      scheduledForRef.current = null;
    };

    if (!monitoring.isActive || !monitoring.nextCheckinAt || inEscalation) {
      cancelPending();
      return;
    }

    const due = monitoring.nextCheckinAt;
    if (scheduledForRef.current === due) return;

    const dueDate = new Date(due);
    if (!Number.isFinite(dueDate.getTime())) return;
    if (dueDate.getTime() <= Date.now() + 1000) {
      cancelPending();
      return;
    }

    const missedDate = new Date(dueDate.getTime() + RESPONSE_WINDOW_MS);

    (async () => {
      await cancelPending();
      const canNotify = await ensureNotificationPermission();
      if (!canNotify) return;
      const channelId = await ensureAndroidChannel();
      try {
        const promptId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Deep Horizon · Safety check-in',
            body: 'Are you safe? Tap to confirm - you have 30 seconds.',
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 250, 250, 250],
            categoryIdentifier: NOTIFICATION_CATEGORY,
            data: {
              type: NOTIFICATION_DATA_TAG,
              dueAt: due,
              intervalMinutes: monitoring.intervalMinutes ?? null,
              startedAt: monitoring.startedAt ?? null,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: dueDate,
            channelId,
          },
        });
        scheduledIdRef.current = promptId;

        const missedId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Deep Horizon · ALERT',
            body: 'Check-in missed. Emergency mode activated - open the app to confirm you are safe.',
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            vibrate: [0, 500, 500, 500, 500],
            categoryIdentifier: NOTIFICATION_CATEGORY,
            data: {
              type: NOTIFICATION_MISSED_TAG,
              dueAt: due,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: missedDate,
            channelId,
          },
        });
        scheduledMissedIdRef.current = missedId;

        scheduledForRef.current = due;
        console.log(
          `[CheckInWatcher] scheduled prompt @ ${dueDate.toISOString()}, missed @ ${missedDate.toISOString()}`,
        );
      } catch (e) {
        console.warn('[CheckInWatcher] schedule failed', e);
      }
    })();

    return () => {
      // Don't cancel here — notifications survive navigation.
      // Cancellation happens when nextCheckinAt changes or session ends.
    };
  }, [monitoring.isActive, monitoring.nextCheckinAt, monitoring.intervalMinutes, monitoring.startedAt, inEscalation, ensureNotificationPermission]);

  return null;
};

export default CheckInWatcher;
