import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { styles } from './EscalationScreen.styles';
import { useAuth } from '@/core/auth';
import { escalationCancel } from '@/api/monitoring';
import { useMonitoringSession } from '@/features/monitoring/MonitoringSession';
import { cancelAllCheckInNotificationsByTag } from '@/features/monitoring/CheckInWatcher';

// "I'm Safe" anywhere = full reset to fresh Tier 1 with the standard
// 15-minute passive-monitoring interval. Matches the product spec:
// every safe ack clears all signals, drops to T1, and starts a fresh
// 15-min countdown — no quick-follow-up check.
const RESET_TIER1_INTERVAL_MIN = 15;

type StepStatus = 'done' | 'active' | 'pending';

interface EscalationStep {
  label: string;
  status: string;
  state: StepStatus;
  index: string;
}

const STEPS: EscalationStep[] = [
  { label: 'Push notification sent', status: '4:58 PM · No response', state: 'done', index: '1' },
  { label: 'SMS sent to phone', status: '5:00 PM · No response', state: 'done', index: '2' },
  { label: 'AI Safety Call', status: 'Calling now...', state: 'active', index: '3' },
  { label: 'Human SOC Agent', status: 'On standby', state: 'pending', index: '4' },
  { label: 'Trusted contacts notified', status: 'Pending', state: 'pending', index: '5' },
];

const stepIcon = (state: StepStatus, index: string) => {
  if (state === 'done') return '✓';
  if (state === 'active') return '▶';
  return index;
};

const EscalationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const auth = useAuth();
  const monitoring = useMonitoringSession();
  const [cancelling, setCancelling] = useState(false);

  // PRD §FR-ES02: cancellation returns the user to the live session at
  // a fresh Tier 1 baseline — 15-min countdown, all signals cleared, all
  // pending/displayed check-in notifications wiped.
  const handleSafe = () => {
    if (cancelling) return;
    setCancelling(true);

    // ── 1. Wipe all check-in notifications immediately ─────────────────
    // Cancel scheduled alarms (so the old "missed" doesn't fire 30s after
    // the deadline that's already in the past) AND dismiss anything
    // already in the tray (so tapping a stale "missed" can't push a fresh
    // missed_checkin signal and yank the user back to escalation).
    cancelAllCheckInNotificationsByTag().catch(() => {});
    Notifications.dismissAllNotificationsAsync().catch(() => {});

    // ── 2. Optimistic local reset to fresh T1 + 15 min ─────────────────
    // applyCheckinUpdate re-anchors lastCheckinAt to "now", arms the
    // safe-ack grace window, and queues the new tier/interval/deadline
    // into state. Doing this BEFORE clearing signals means the tier
    // engine's onTierChange callback recomputes the deadline from the
    // freshly-anchored baseline, not the stale T3 one.
    const freshDueAt = new Date(
      Date.now() + RESET_TIER1_INTERVAL_MIN * 60_000,
    ).toISOString();
    monitoring.applyCheckinUpdate({
      tier: 1,
      intervalMinutes: RESET_TIER1_INTERVAL_MIN,
      nextCheckinAt: freshDueAt,
    });

    // ── 3. Drop every engine signal so tier truly returns to T1 ────────
    // Without clearing short_deviation / inactivity too, the engine
    // holds T2-level state and the next GPS fix off-corridor (or sitting
    // still) re-bumps the tier within seconds.
    monitoring.clearTierSignal('missed_checkin');
    monitoring.clearTierSignal('long_deviation');
    monitoring.clearTierSignal('user_needs_help');
    monitoring.clearTierSignal('short_deviation');
    monitoring.clearTierSignal('inactivity');
    monitoring.clearDeviation();

    // ── 4. Backend ack — fire-and-forget ───────────────────────────────
    // The PUT clears Redis devstreak / inactwin / deviation keys server-
    // side and resets the checkin store to T1 + 15 min. We don't await
    // and we don't reapply the response: the local state above already
    // matches what the backend will compute, and the safe-ack grace
    // window in MonitoringSession suppresses any stale ping signals
    // until the server catches up.
    if (auth.user?.id) {
      escalationCancel(auth.user.id).catch(() => {});
    }

    setCancelling(false);
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('ActiveMonitoring');
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#1a0a0a" />
      <LinearGradient
        colors={['#7f1d1d', '#450a0a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <MaterialIcons name="warning" size={36} color="#fff" />
            <Text style={styles.headerTitle}>Safety Alert Triggered</Text>
            <Text style={styles.headerSub}>No response in 30 seconds · SOC notified</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stepsCard}>
          <Text style={styles.stepsHeader}>Escalation Progress</Text>
          {STEPS.map((step, idx) => (
            <View
              key={step.index}
              style={[
                styles.stepRow,
                idx === STEPS.length - 1 && styles.stepRowLast,
              ]}
            >
              <View
                style={[
                  styles.stepNum,
                  step.state === 'done' && styles.stepNumDone,
                  step.state === 'active' && styles.stepNumActive,
                  step.state === 'pending' && styles.stepNumPending,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumText,
                    step.state === 'done' && { color: '#22c55e' },
                    step.state === 'active' && { color: '#ef4444' },
                    step.state === 'pending' && { color: '#9ca3af' },
                  ]}
                >
                  {stepIcon(step.state, step.index)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepLabel}>{step.label}</Text>
                <Text
                  style={[
                    styles.stepStatus,
                    step.state === 'active' && styles.stepStatusActive,
                  ]}
                >
                  {step.status}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.safeButtonWrapper}
          activeOpacity={0.9}
          onPress={handleSafe}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="I am safe, stop alert"
        >
          <LinearGradient
            colors={['#16a34a', '#15803d']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.safeButton}
          >
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={styles.safeButtonText}>
              {cancelling ? 'Stopping…' : "I'm Safe — Stop Alert"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.socButton}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Talk to SOC agent now"
        >
          <MaterialIcons name="phone" size={16} color="#ef4444" />
          <Text style={styles.socButtonText}>Talk to SOC Agent Now</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          Hold power + volume for silent SOS{'\n'}or shake device to send location ping
        </Text>
      </ScrollView>
    </View>
  );
};

export default EscalationScreen;
