import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const deadlineMs = hasValidDueAt
    ? dueAtMs + RESPONSE_WINDOW_SECONDS * 1000
    : Date.now() + RESPONSE_WINDOW_SECONDS * 1000;

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

  const handleSafe = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // Pre-emptively cancel the pending missed-check-in alarm BEFORE the
    // network call. Without this, a slow /checkin/respond call lets the
    // 30s missed alarm fire in the gap between tap and applyCheckinUpdate
    // → user sees a false "Check-in missed" notification seconds after
    // they already marked themselves safe.
    cancelAllCheckInNotificationsByTag().catch(() => {});
    if (userId) {
      try {
        const r = await checkinRespond(userId, true);
        // Apply the new tier + next_checkin_at IMMEDIATELY so the auto-prompt
        // dedup ref sees a fresh future deadline (otherwise it would re-fire
        // on the next tick because the old deadline is still in the past).
        monitoring.applyCheckinUpdate({
          tier: r.tier,
          intervalMinutes: r.interval_minutes,
          nextCheckinAt: r.next_checkin_at,
        });
      } catch {
        // best-effort, UI returns to live session regardless
      }
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
