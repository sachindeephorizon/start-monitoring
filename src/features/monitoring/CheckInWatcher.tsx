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

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useMonitoringSession } from './MonitoringSession';
import { navigationRef } from '@/navigation/navigationRef';

const NOTIFICATION_CATEGORY = 'monitoring-checkin';
const NOTIFICATION_DATA_TAG = 'monitoring_checkin';
const NOTIFICATION_MISSED_TAG = 'monitoring_checkin_missed';

// The 30-second response window the user has after the prompt fires
// before the backend marks them as missed and escalates. Must match
// rewp2's TIER_CONFIG[*].countdown_seconds.
const RESPONSE_WINDOW_MS = 30_000;

let handlerInstalled = false;
function ensureNotificationHandler() {
  if (handlerInstalled) return;
  handlerInstalled = true;
  // Make foreground notifications visible too — by default expo-notifications
  // suppresses them. Without this, a check-in firing while the app is open
  // (just on a different screen) would silently appear in the system tray.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // shouldShowBanner / shouldShowList are SDK 52+ fields. Omitting them
      // for compatibility with older expo-notifications versions, which
      // throw in production (Hermes) when handed unknown handler keys.
    }),
  });
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('monitoring', {
      name: 'Safety check-ins',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1d6fa4',
      sound: 'default',
    });
  } catch {
    // Channel ops are best-effort — ignore failures (e.g. on old OS versions).
  }
}

function navigateToPrompt(dueAt?: string | null, intervalMinutes?: number | null, startedAt?: number | null) {
  if (!navigationRef.isReady()) return;
  // Use navigate (not replace) so the modal sits on top of whatever screen
  // the user happened to be on.
  navigationRef.navigate('CheckInPrompt' as never, {
    dueAt: dueAt ?? undefined,
    intervalMinutes: intervalMinutes ?? undefined,
    startedAt: startedAt ?? undefined,
  } as never);
}

export const CheckInWatcher: React.FC = () => {
  const monitoring = useMonitoringSession();

  const lastPromptedRef = useRef<string | null>(null);
  const scheduledForRef = useRef<string | null>(null);
  const scheduledIdRef = useRef<string | null>(null);
  // The "missed-deadline" notification that fires 30s after the prompt
  // notification if the user hasn't responded. This is the background
  // equivalent of CheckInPromptScreen's setInterval expiry.
  const scheduledMissedIdRef = useRef<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // The notification-tap listener captures `monitoring` by closure on the
  // first render. Mirror isActive into a ref so the handler always reads
  // the current value — without this, a tap arriving after endSession
  // would still navigate into the prompt because the closure thinks the
  // session is alive.
  const isActiveRef = useRef<boolean>(monitoring.isActive);
  useEffect(() => {
    isActiveRef.current = monitoring.isActive;
  }, [monitoring.isActive]);

  // ── Setup notification handler + channel + tap listener ────────────────
  useEffect(() => {
    ensureNotificationHandler();
    ensureAndroidChannel();

    const tapSub = Notifications.addNotificationResponseReceivedListener((res) => {
      const data = res.notification.request.content.data as Record<string, unknown>;
      // Don't act for a session that's already ended.
      if (!isActiveRef.current) return;

      if (data?.type === NOTIFICATION_DATA_TAG) {
        // Tapped the prompt notification → CheckInPrompt screen.
        navigateToPrompt(
          (data.dueAt as string) ?? undefined,
          (data.intervalMinutes as number) ?? undefined,
          (data.startedAt as number) ?? undefined,
        );
      } else if (data?.type === NOTIFICATION_MISSED_TAG) {
        // Tapped the "missed" notification → straight to Escalation.
        // The next ping will also push 'missed_checkin' from the backend
        // flag, but doing it locally here means the screen flips
        // immediately without waiting for the next ping cadence.
        if (navigationRef.isReady()) {
          navigationRef.navigate('Escalation' as never);
        }
      }
    });

    const appStateSub = AppState.addEventListener('change', (s) => {
      appStateRef.current = s;
    });

    return () => {
      tapSub.remove();
      appStateSub.remove();
    };
  }, []);

  // ── Foreground tick: prompt when due, on any screen ────────────────────
  useEffect(() => {
    if (!monitoring.isActive) {
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
      if (Date.now() < dueMs) return;
      // Don't navigate over the prompt if it's already on screen.
      if (navigationRef.isReady()) {
        const current = navigationRef.getCurrentRoute()?.name;
        if (current === 'CheckInPrompt') {
          lastPromptedRef.current = due;
          return;
        }
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
  }, [monitoring.isActive, monitoring.nextCheckinAt, monitoring.intervalMinutes, monitoring.startedAt]);

  // ── Background notification: schedule at nextCheckinAt ─────────────────
  useEffect(() => {
    const cancelPending = async () => {
      // Cancel BOTH the prompt and the missed-deadline notifications.
      // We schedule them as a pair, so they're always cancelled as a pair.
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
      scheduledIdRef.current = null;
      scheduledMissedIdRef.current = null;
      scheduledForRef.current = null;
    };

    if (!monitoring.isActive || !monitoring.nextCheckinAt) {
      cancelPending();
      return;
    }

    const due = monitoring.nextCheckinAt;
    if (scheduledForRef.current === due) return; // already scheduled

    const dueDate = new Date(due);
    if (!Number.isFinite(dueDate.getTime())) return;
    // If the deadline already passed, don't schedule — the foreground tick
    // will handle it. Local notification scheduling for a past time is a no-op
    // on most platforms anyway.
    if (dueDate.getTime() <= Date.now() + 1000) {
      cancelPending();
      return;
    }

    // Compute the missed-deadline timestamp (prompt time + 30s response
    // window). We schedule a SECOND notification for this so the user
    // gets an audible alert at the missed-deadline moment even when the
    // app is backgrounded — the foreground setInterval-based countdown
    // can't run in background, so without this nothing would happen at
    // the 30s mark beyond a silent backend tier shift.
    const missedDate = new Date(dueDate.getTime() + RESPONSE_WINDOW_MS);

    (async () => {
      await cancelPending();
      try {
        // (1) The prompt notification at nextCheckinAt
        const promptId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Deep Horizon · Safety check-in',
            body: "Are you safe? Tap to confirm — you have 30 seconds.",
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
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
            channelId: 'monitoring',
          } as Notifications.DateTriggerInput,
        });
        scheduledIdRef.current = promptId;

        // (2) The missed-deadline notification at nextCheckinAt + 30s.
        // If the user responds before the deadline, applyCheckinUpdate
        // shifts nextCheckinAt forward, this effect re-runs, cancelPending
        // wipes both notifications, and we reschedule for the new deadline.
        const missedId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Deep Horizon · ALERT',
            body: 'Check-in missed. Emergency mode activated — open the app to confirm you are safe.',
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            categoryIdentifier: NOTIFICATION_CATEGORY,
            data: {
              type: NOTIFICATION_MISSED_TAG,
              dueAt: due,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: missedDate,
            channelId: 'monitoring',
          } as Notifications.DateTriggerInput,
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
      // Don't cancel here — we want the notifications to survive screen
      // navigation. Cancellation happens when nextCheckinAt changes (which
      // re-runs this effect) or the session ends.
    };
  }, [monitoring.isActive, monitoring.nextCheckinAt, monitoring.intervalMinutes, monitoring.startedAt]);

  // Watcher renders nothing — it's effect-only.
  return null;
};

export default CheckInWatcher;
