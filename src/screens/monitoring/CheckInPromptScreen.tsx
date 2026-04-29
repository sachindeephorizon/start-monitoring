import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { styles } from './CheckInPromptScreen.styles';
import { useAuth } from '@/core/auth';
import { useMonitoringSession } from '@/features/monitoring/MonitoringSession';
import { cancelAllCheckInNotificationsByTag } from '@/features/monitoring/CheckInWatcher';
import {
  checkinStart,
  checkinRespond,
  checkinMissed,
  escalationTrigger,
} from '@/api/monitoring';

const RESPONSE_WINDOW_SECONDS = 30;
// Per spec: every "I'm Safe" — wherever it's tapped — resets to fresh
// Tier 1 with the standard 15-minute passive interval.
const RESET_TIER1_INTERVAL_MIN = 15;

type CheckInPromptRouteParams = {
  dueAt?: string;
  intervalMinutes?: number;
  startedAt?: number;
};

const CheckInPromptScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const auth = useAuth();
  const monitoring = useMonitoringSession();
  const [secondsLeft, setSecondsLeft] = useState(RESPONSE_WINDOW_SECONDS);
  const [, setNowTick] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryHandledRef = useRef(false);
  const userId = auth.user?.id ?? null;
  const params = (route.params ?? {}) as CheckInPromptRouteParams;

  const dueAtIso = params.dueAt ?? monitoring.nextCheckinAt ?? null;
  const dueAtMs = dueAtIso ? new Date(dueAtIso).getTime() : Date.now();
  const hasValidDueAt = Number.isFinite(dueAtMs);
  // Per spec: every check-in prompt gets a FRESH 30 s window when the
  // screen opens. If the deadline was reached long ago (app backgrounded
  // through the response window, BG task pushed missed → tier shift fired
  // late), don't punish the user with a "0 seconds left, you missed it"
  // — give them a real chance to confirm safe before escalation.
  const promptOpenedAtMs = useRef<number>(Date.now()).current;
  const deadlineMs = Math.max(
    hasValidDueAt ? dueAtMs + RESPONSE_WINDOW_SECONDS * 1000 : 0,
    promptOpenedAtMs + RESPONSE_WINDOW_SECONDS * 1000,
  );

  const effectiveStartedAt = params.startedAt ?? monitoring.startedAt ?? null;
  const elapsedMinutes = effectiveStartedAt
    ? Math.max(0, Math.floor((Date.now() - effectiveStartedAt) / 60000))
    : null;
  const intervalMinutes = params.intervalMinutes ?? monitoring.intervalMinutes ?? null;

  useEffect(() => {
    const timer = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    expiryHandledRef.current = false;

    const getSecondsLeft = () =>
      Math.max(
        0,
        Math.min(
          RESPONSE_WINDOW_SECONDS,
          Math.ceil((deadlineMs - Date.now()) / 1000),
        ),
      );

    setSecondsLeft(getSecondsLeft());

    intervalRef.current = setInterval(() => {
      setSecondsLeft(getSecondsLeft());
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [deadlineMs]);

  useEffect(() => {
    if (!userId) return;
    // Mark check-in prompt as started in backend lifecycle store.
    checkinStart(userId).catch(() => {});
  }, [userId]);

  // If the session ends while the prompt is open (e.g. user backs out of
  // monitoring on the home screen), dismiss this modal — otherwise the
  // user is stuck looking at "Are you safe?" for a session that no longer
  // exists.
  useEffect(() => {
    if (!monitoring.isActive && navigation.canGoBack()) {
      navigation.goBack();
    }
  }, [monitoring.isActive, navigation]);

  useEffect(() => {
    if (secondsLeft > 0 || expiryHandledRef.current) return;
    expiryHandledRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Local tier engine — flips to T3 immediately, no backend round-trip needed.
    monitoring.pushTierSignal('missed_checkin');
    if (userId) {
      checkinMissed(userId).catch(() => {});
      escalationTrigger(userId, 'missed_checkin').catch(() => {});
    }
    navigation.replace('Escalation');
  }, [navigation, secondsLeft, userId, monitoring]);

  const handleSafe = () => {
    if (submitting) return;
    setSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);

    // Wipe every check-in notification — scheduled (so the 30s "missed"
    // alarm can't fire in the gap between tap and state update) AND
    // already-displayed (so the user can't tap a stale "missed" from
    // the tray and get yanked into escalation after confirming safe).
    cancelAllCheckInNotificationsByTag().catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});

    // Optimistic local reset to fresh T1 + 15 min — same contract as
    // EscalationScreen.handleSafe. applyCheckinUpdate also clears
    // lastDeviation / inactivityFlag and arms the safe-ack grace
    // window so the next ping doesn't re-push stale signals.
    monitoring.applyCheckinUpdate({
      tier: 1,
      intervalMinutes: RESET_TIER1_INTERVAL_MIN,
      nextCheckinAt: new Date(
        Date.now() + RESET_TIER1_INTERVAL_MIN * 60_000,
      ).toISOString(),
    });
    monitoring.clearTierSignal('missed_checkin');
    monitoring.clearTierSignal('long_deviation');
    monitoring.clearTierSignal('user_needs_help');
    monitoring.clearTierSignal('short_deviation');
    monitoring.clearTierSignal('inactivity');
    monitoring.clearDeviation();

    // Backend ack — fire-and-forget. Local state already reflects the
    // safe state; the safe-ack grace window suppresses any racy stale
    // ping signals until the server-side reset lands.
    if (userId) {
      checkinRespond(userId, true).catch(() => {});
    }

    setSubmitting(false);
    navigation.goBack();
  };

  const handleNeedHelp = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // The user is entering escalation — they're responding to the prompt
    // deliberately, not missing it. Cancel the pending "missed" alarm so
    // they don't get a ghost notification while the EscalationScreen is
    // already alerting them.
    cancelAllCheckInNotificationsByTag().catch(() => {});
    // Flip the local tier engine FIRST. This recomputes nextCheckinAt off
    // lastCheckinAt + T3_INTERVAL synchronously (no network wait), so the
    // countdown UI flips to the T3 cadence immediately. Without this, the
    // backend's /respond { is_safe: false } response doesn't include
    // next_checkin_at — the screen would show the stale T1 deadline until
    // the next tier shift.
    monitoring.pushTierSignal('user_needs_help');
    if (userId) {
      try {
        const r = await checkinRespond(userId, false);
        monitoring.applyCheckinUpdate({
          tier: r.tier,
          intervalMinutes: r.interval_minutes,
          nextCheckinAt: r.next_checkin_at,
        });
        if (r.trigger_escalation) {
          await escalationTrigger(userId, 'need_help').catch(() => {});
        }
      } catch {
        // fall through to escalation screen anyway
      }
    }
    setSubmitting(false);
    navigation.replace('Escalation');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <View style={styles.body}>
          <View style={styles.shieldCircle}>
            <MaterialCommunityIcons name="shield-check" size={44} color="#eab308" />
          </View>

          <Text style={styles.headline}>Are you safe?</Text>
          <Text style={styles.bodyText}>
            Deep Horizon is checking in.{"\n"}
            {elapsedMinutes != null
              ? `You've been travelling for ${elapsedMinutes} min${elapsedMinutes === 1 ? '' : 's'}.\n`
              : ''}
            {intervalMinutes != null
              ? `Check-ins run every ${intervalMinutes} min.\n`
              : ''}
            Tap to confirm you're okay.
          </Text>

          <View style={styles.countdownCircle}>
            <Text style={styles.countdownText}>{secondsLeft}</Text>
          </View>

          <TouchableOpacity
            style={styles.safeButtonWrapper}
            activeOpacity={0.9}
            onPress={handleSafe}
            accessibilityRole="button"
            accessibilityLabel="Confirm I am safe"
          >
            <LinearGradient
              colors={['#16a34a', '#15803d']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.safeButton}
            >
              <MaterialIcons name="check" size={18} color="#fff" />
              <Text style={styles.safeButtonText}>Yes, I'm Safe</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.helpButton}
            activeOpacity={0.85}
            onPress={handleNeedHelp}
            accessibilityRole="button"
            accessibilityLabel="I need help"
          >
            <MaterialIcons name="warning" size={16} color="#ef4444" />
            <Text style={styles.helpButtonText}>I Need Help</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.extendButton} activeOpacity={0.7}>
            <Text style={styles.extendText}>Need more time? {'->'} Extend session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

export default CheckInPromptScreen;
