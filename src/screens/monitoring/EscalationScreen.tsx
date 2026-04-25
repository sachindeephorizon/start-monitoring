import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './EscalationScreen.styles';
import { useAuth } from '@/core/auth';
import { escalationCancel } from '@/api/monitoring';
import { useMonitoringSession } from '@/features/monitoring/MonitoringSession';

const RESET_INTERVAL_MINUTES = 3;

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

  // PRD §FR-ES02: cancellation returns the user to the live session.
  // Backend resets tier to 1 and computes a fresh next_checkin_at — apply
  // both locally so ActiveMonitoring's auto-prompt doesn't re-fire.
  const handleSafe = async () => {
    if (cancelling) return;
    setCancelling(true);
    // Rebase the next check-in BEFORE clearing the Tier 3 signals.
    // Otherwise the tier engine drops to T1 using the stale baseline and
    // briefly computes "due now".
    const optimisticNextCheckinAt = new Date(
      Date.now() + RESET_INTERVAL_MINUTES * 60_000,
    ).toISOString();
    monitoring.applyCheckinUpdate({
      tier: 1,
      intervalMinutes: RESET_INTERVAL_MINUTES,
      nextCheckinAt: optimisticNextCheckinAt,
    });
    monitoring.clearTierSignal('missed_checkin');
    monitoring.clearTierSignal('long_deviation');
    monitoring.clearTierSignal('user_needs_help');
    if (auth.user?.id) {
      try {
        const r = await escalationCancel(auth.user.id);
        monitoring.applyCheckinUpdate({
          tier: r.tier_reset_to ?? 1,
          intervalMinutes: RESET_INTERVAL_MINUTES,
          nextCheckinAt: optimisticNextCheckinAt,
        });
      } catch {
        // best-effort — UI returns to monitoring regardless
      }
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
