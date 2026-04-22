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
    // Channel ops are best-effort — ignore failures (e.g. on old OS versions).
  }
  return MONITORING_CHANNEL_ID;
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
  // CheckInPrompt lives inside MainNavigator, not at the root.
  // Route through "Main" so the action is handled from the container ref.
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
  navigateToMainScreen('Escalation');
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
  const notificationPermissionGrantedRef = useRef<boolean | null>(null);
  // The notification-tap listener captures `monitoring` by closure on the
  // first render. Mirror isActive into a ref so the handler always reads
  // the current value — without this, a tap arriving after endSession
  // would still navigate into the prompt because the closure thinks the
  // session is alive.
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

  // ── Setup notification handler + channel + tap listener ────────────────
  useEffect(() => {
    ensureNotificationHandler();
    ensureAndroidChannel();
    ensureNotificationPermission().catch(() => {});

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

  // While the engine is in the escalation flow (`missed_checkin` or
  // `long_deviation` signal active), suppress ALL check-in prompting.
  // Otherwise the short T3 interval causes a notification storm: every
  // T3-cycle's `nextCheckinAt` lands in the past (because lastCheckin was
  // never updated), the watcher fires a fresh prompt + missed, the backend
  // re-escalates, and we loop. The escalation pipeline is already alerting
  // the user — additional check-in prompts on top are noise.
  // Resumes the moment EscalationScreen's "I'm Safe" clears the signals.
  const dbg = monitoring.getEngineDebug();
  const inEscalation =
    !!dbg &&
    (dbg.activeSignals.includes('missed_checkin') ||
      dbg.activeSignals.includes('long_deviation'));

  // ── Foreground tick: prompt when due, on any screen ────────────────────
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

      // Don't route over active escalation. This can happen when a missed
      // notification tap and foreground resume race each other.
      let current: string | undefined;
      if (navigationRef.isReady()) {
        current = navigationRef.getCurrentRoute()?.name as string | undefined;
        if (current === 'Escalation') {
          lastPromptedRef.current = due;
          return;
        }
      }

      // If the 30s response window is already over, skip CheckInPrompt and
      // enter escalation directly to avoid stacking prompt→escalation routes.
      if (now >= dueMs + RESPONSE_WINDOW_MS) {
        lastPromptedRef.current = due;
        monitoring.pushTierSignal('missed_checkin');
        navigateToEscalation();
        return;
      }

      // Don't navigate over the prompt if it's already on screen.
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

    if (!monitoring.isActive || !monitoring.nextCheckinAt || inEscalation) {
      // While in escalation, cancel any pending check-in notifications too.
      // The user is already getting alerts via the escalation pipeline; we
      // don't want a stale prompt notification firing on top.
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
      const canNotify = await ensureNotificationPermission();
      if (!canNotify) return;
      const channelId = await ensureAndroidChannel();
      try {
        // (1) The prompt notification at nextCheckinAt
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

        // (2) The missed-deadline notification at nextCheckinAt + 30s.
        // If the user responds before the deadline, applyCheckinUpdate
        // shifts nextCheckinAt forward, this effect re-runs, cancelPending
        // wipes both notifications, and we reschedule for the new deadline.
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
      // Don't cancel here — we want the notifications to survive screen
      // navigation. Cancellation happens when nextCheckinAt changes (which
      // re-runs this effect) or the session ends.
    };
  }, [monitoring.isActive, monitoring.nextCheckinAt, monitoring.intervalMinutes, monitoring.startedAt, inEscalation, ensureNotificationPermission]);

  // Watcher renders nothing — it's effect-only.
  return null;
};

export default CheckInWatcher;
