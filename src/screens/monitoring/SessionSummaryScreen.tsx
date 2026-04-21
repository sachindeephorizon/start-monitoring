import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './SessionSummaryScreen.styles';
import { useAuth } from '@/core/auth';
import { entrySummary } from '@/api/monitoring';

interface TimelineItemRender {
  time: string;
  event: string;
  color: string;
}

interface BackendTimelineEvent {
  time: string; // ISO
  event: string;
  type: 'info' | 'warning' | 'success' | 'danger';
}

interface BackendSummary {
  user_id: string;
  session_id: string;
  status: string;
  destination?: { name: string; lat: number; long: number } | null;
  trip_type?: string | null;
  stats: {
    elapsed_minutes: number;
    distance_covered_km: number;
    total_checkins: number;
    total_escalations: number;
  };
  timeline: BackendTimelineEvent[];
  started_at: string;
  ended_at: string | null;
  trusted_contacts: { name: string; relation: string; notify: boolean }[];
}

const TYPE_TO_COLOR: Record<BackendTimelineEvent['type'], string> = {
  info: '#1d6fa4',
  warning: '#eab308',
  success: '#22c55e',
  danger: '#ef4444',
};

function formatLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const SessionSummaryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const auth = useAuth();
  const fallbackElapsed: number = route.params?.elapsedSeconds ?? 0;

  const [summary, setSummary] = useState<BackendSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    entrySummary(auth.user.id)
      .then((data) => {
        if (!cancelled) setSummary(data as BackendSummary);
      })
      .catch(() => {
        // 404 means /handling/entry/start was never called for this user, or
        // the in-memory store cleared. Render fallback below.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.user?.id]);

  const minutes = summary?.stats.elapsed_minutes
    ?? Math.max(1, Math.round(fallbackElapsed / 60));
  const distanceKm = summary?.stats.distance_covered_km ?? 0;
  const checkinCount = summary?.stats.total_checkins ?? 0;
  const escalationCount = summary?.stats.total_escalations ?? 0;
  const tripType = summary?.trip_type ?? null;
  const destName = summary?.destination?.name ?? null;

  const timeline: TimelineItemRender[] = (summary?.timeline ?? []).map((e) => ({
    time: formatLocalTime(e.time),
    event: e.event,
    color: TYPE_TO_COLOR[e.type] ?? '#6b7280',
  }));

  const handleDone = () => {
    navigation.popToTop();
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#16a34a" />
      <LinearGradient
        colors={['#16a34a', '#15803d']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            <View style={styles.checkCircle}>
              <MaterialIcons name="check" size={36} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>You reached safely!</Text>
            <Text style={styles.headerSub}>
              Deep Horizon watched over your{tripType ? ` ${tripType}` : ''} trip
              {destName ? ` to ${destName}` : ''}
            </Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session Timeline</Text>
          {loading ? (
            <ActivityIndicator color="#1d6fa4" />
          ) : timeline.length === 0 ? (
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              No events recorded for this session.
            </Text>
          ) : (
            timeline.map((item, idx) => (
              <View
                key={`${item.time}-${idx}`}
                style={[
                  styles.timelineItem,
                  idx === timeline.length - 1 && { marginBottom: 0 },
                ]}
              >
                <View style={[styles.timelineDot, { backgroundColor: item.color }]} />
                <Text style={styles.timelineTime}>{item.time}</Text>
                <Text style={styles.timelineEvent}>{item.event}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.pillRow}>
          <View style={styles.pill}>
            <MaterialIcons name="timer" size={12} color="#374151" />
            <Text style={styles.pillText}>{minutes} min session</Text>
          </View>
          <View style={styles.pill}>
            <MaterialIcons name="place" size={12} color="#374151" />
            <Text style={styles.pillText}>{distanceKm.toFixed(1)} km covered</Text>
          </View>
          <View style={styles.pill}>
            <MaterialIcons name="check-circle" size={12} color="#374151" />
            <Text style={styles.pillText}>
              {checkinCount} check-in{checkinCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.pill}>
            <MaterialIcons name="shield" size={12} color="#374151" />
            <Text style={styles.pillText}>
              {escalationCount} escalation{escalationCount === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={handleDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to Home"
        >
          <Text style={styles.doneButtonText}>Back to Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} activeOpacity={0.85}>
          <MaterialIcons name="share" size={14} color="#374151" />
          <Text style={styles.shareButtonText}>Share summary with family</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default SessionSummaryScreen;
