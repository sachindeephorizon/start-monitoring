import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { styles } from './ActiveMonitoringScreen.styles';
import { useMonitoringSession } from '@/features/monitoring/MonitoringSession';
import { MonitoringMap } from '@/components/monitoring';

interface SignalItem {
  label: string;
  status: string;
  variant: 'ok' | 'warning';
}

// Threshold: how long the user has to be near the anchor before we flip
// "Moving · Active" to "Stationary". Sub-threshold dwell (red lights, brief
// stops) doesn't flip the tile, so it stops flickering.
const STATIONARY_DWELL_MS = 30_000;
// Speed below which we don't trust the GPS as "moving" (typical walking
// speed floor is ~0.6 m/s; below this is GPS jitter, not movement).
const MOVING_SPEED_MPS_FLOOR = 0.6;

function buildSignals(opts: {
  hasDeviation: boolean;       // local engine has short_ or long_deviation signal
  inactive: boolean;           // local engine has inactivity signal (10-min flag)
  stationaryMs: number;        // how long since the engine's anchor was last reset
  speedMps: number | undefined;
  hasGps: boolean;
  socAlerted: boolean;         // tier 3 OR escalation in flight
}): SignalItem[] {
  // "Stationary" = either the engine has formally fired inactivity (10 min)
  // OR the user has been near the anchor for ≥30 s with no detected speed.
  // The 30 s dwell stops the tile flickering on red lights.
  const movingNow = (opts.speedMps ?? 0) > MOVING_SPEED_MPS_FLOOR;
  const isStationary =
    opts.inactive || (!movingNow && opts.stationaryMs >= STATIONARY_DWELL_MS);

  return [
    {
      label: 'Route',
      status: opts.hasDeviation ? 'Deviation' : 'Normal',
      variant: opts.hasDeviation ? 'warning' : 'ok',
    },
    {
      label: 'Moving',
      status: opts.inactive ? 'Inactive' : isStationary ? 'Stationary' : 'Active',
      variant: opts.inactive || isStationary ? 'warning' : 'ok',
    },
    {
      label: 'GPS',
      status: opts.hasGps ? 'Locked' : 'Searching',
      variant: opts.hasGps ? 'ok' : 'warning',
    },
    {
      label: 'SOC',
      status: opts.socAlerted ? 'Alerted' : 'Watching',
      variant: opts.socAlerted ? 'warning' : 'ok',
    },
  ];
}

function formatRemaining(meters: number | null): string {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatEta(meters: number | null, speedMps: number | undefined): string {
  if (!meters || !speedMps || speedMps < 0.5) return '—';
  const secs = meters / speedMps;
  if (secs < 60) return `~${Math.round(secs)}s`;
  return `~${Math.round(secs / 60)} min`;
}

function formatNextCheckin(nextIso: string | null, intervalMinutes: number | null): string {
  if (!nextIso) {
    if (intervalMinutes) return `every ${intervalMinutes} min`;
    return '—';
  }
  const remainingMs = new Date(nextIso).getTime() - Date.now();
  if (!Number.isFinite(remainingMs)) return '—';
  if (remainingMs <= 0) return 'due now';
  const totalSecs = Math.floor(remainingMs / 1000);
  if (totalSecs < 60) return `in ${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `in ${hrs}h ${remMins}m` : `in ${hrs}h`;
}

const ActiveMonitoringScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const monitoring = useMonitoringSession();
  const [ending, setEnding] = useState(false);
  const [, setNowTick] = useState(0);

  // 1-second tick drives the elapsed + next-checkin countdown rerenders.
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = monitoring.startedAt
    ? Math.max(0, Math.floor((Date.now() - monitoring.startedAt) / 1000))
    : 0;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  // Backend signals arrival when the user is within ~200m of destination.
  // Auto-prompt to end the session.
  useEffect(() => {
    if (monitoring.arrivalDetected) {
      handleEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitoring.arrivalDetected]);

  // Auto-open check-in prompt is handled GLOBALLY by CheckInWatcher
  // (mounted in MonitoringSessionProvider) so it fires from any screen
  // and also schedules a local notification for the background case.
  // See src/features/monitoring/CheckInWatcher.tsx.

  const formatElapsed = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    // Read client-side traveled distance BEFORE endSession — the backend
    // summary often reports 0 km because it derives from server-side trail
    // reconstruction which can miss rapid-fire pings. The client walks
    // haversine on every GPS fix (foreground + bg task), so this value
    // is the authoritative on-device truth.
    const traveledMeters = await monitoring.getTraveledMeters();
    const counts = monitoring.getSessionCounts();
    const summary = await monitoring.endSession();
    setEnding(false);
    navigation.replace('SessionSummary', {
      elapsedSeconds: summary?.session?.durationSecs ?? elapsed,
      distanceMeters: traveledMeters,
      totalPings: summary?.session?.totalPings,
      checkinCount: counts.checkins,
      escalationCount: counts.escalations,
    });
  };

  // Use the local tier engine as the source of truth for signal status —
  // it auto-clears (anchor reset on movement, signal decay) so a deviation
  // that resolves correctly flips the Route tile back to "Normal" without
  // waiting for the backend to confirm via a fresh ping.
  const engineDebug = monitoring.getEngineDebug();
  const engineSignals = engineDebug?.activeSignals ?? [];
  const stationaryMs = engineDebug?.stationaryMs ?? 0;
  const hasDeviation =
    engineSignals.includes('short_deviation') ||
    engineSignals.includes('long_deviation') ||
    !!monitoring.lastDeviation;
  const speedMps = monitoring.lastLocation?.coords.speed ?? undefined;
  const socAlerted = monitoring.tier === 3;

  const signals = buildSignals({
    hasDeviation,
    inactive: monitoring.inactivityFlag || engineSignals.includes('inactivity'),
    stationaryMs,
    speedMps,
    hasGps: !!monitoring.lastLocation,
    socAlerted,
  });
  const remainingLabel = formatRemaining(monitoring.remainingMeters);
  const etaLabel = formatEta(monitoring.remainingMeters, speedMps);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1b2e" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#0d1b2e' }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <MaterialCommunityIcons name="shield-check" size={14} color="rgba(255,255,255,0.8)" />
            <Text style={styles.brand}>DeepHorizon</Text>
          </View>
          <Text style={styles.timeText}>{formatElapsed(elapsed)}</Text>
        </View>

        <View style={styles.monitoringBadge}>
          <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.monitoringBadgeText}>MONITORING ACTIVE</Text>
        </View>

        <MonitoringMap
          user={
            monitoring.lastLocation
              ? {
                  lat: monitoring.lastLocation.coords.latitude,
                  lng: monitoring.lastLocation.coords.longitude,
                }
              : null
          }
          destination={
            monitoring.destination
              ? { lat: monitoring.destination.lat, lng: monitoring.destination.lng }
              : null
          }
          destinationName={monitoring.destination?.name ?? null}
          route={monitoring.routePolyline}
          height={180}
        />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatElapsed(elapsed)}</Text>
            <Text style={styles.statLabel}>Elapsed</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{remainingLabel}</Text>
            <Text style={styles.statLabel}>Remaining</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{etaLabel}</Text>
            <Text style={styles.statLabel}>ETA</Text>
          </View>
        </View>

        <View style={styles.signalRow}>
          <View style={styles.signalHeader}>
            <Text style={styles.signalTitle}>Safety Signals</Text>
            <Text style={styles.signalOk}>
              {monitoring.lastDeviation || monitoring.inactivityFlag
                ? 'Watching ⚠'
                : 'All Clear ✓'}
            </Text>
          </View>
          <View style={styles.signalItems}>
            {signals.map((s) => (
              <View
                key={s.label}
                style={[
                  styles.signalItem,
                  s.variant === 'warning' && styles.signalItemWarning,
                ]}
              >
                <Text
                  style={[
                    styles.signalText,
                    s.variant === 'warning' && styles.signalTextWarning,
                  ]}
                >
                  {s.variant === 'warning' ? '⚡' : '✓'} {s.label}
                </Text>
                <Text
                  style={[
                    styles.signalText,
                    s.variant === 'warning' && styles.signalTextWarning,
                  ]}
                >
                  {s.status}
                </Text>
              </View>
            ))}
          </View>
          {__DEV__ && <EngineDebugLine monitoring={monitoring} />}
        </View>

        <TouchableOpacity
          style={styles.checkinBar}
          onPress={() =>
            navigation.navigate('CheckInPrompt', {
              dueAt: monitoring.nextCheckinAt ?? undefined,
              intervalMinutes: monitoring.intervalMinutes ?? undefined,
              startedAt: monitoring.startedAt ?? undefined,
            })
          }
          activeOpacity={0.85}
          disabled={!monitoring.hasFirstPing}
        >
          {monitoring.hasFirstPing ? (
            <>
              <Text style={styles.checkinText}>
                Next check-in · T{monitoring.tier} ({monitoring.tierName})
              </Text>
              <Text style={styles.checkinTime}>
                {formatNextCheckin(monitoring.nextCheckinAt, monitoring.intervalMinutes)}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.checkinText}>Connecting…</Text>
              <Text style={styles.checkinTime}>—</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.endButton}
          onPress={handleEnd}
          activeOpacity={0.85}
          disabled={ending}
          accessibilityRole="button"
          accessibilityLabel="End monitoring"
        >
          <MaterialIcons name="stop" size={16} color="#ef4444" />
          <Text style={styles.endButtonText}>
            {ending ? 'Ending…' : 'End Monitoring'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.shareButton} activeOpacity={0.7}>
          <MaterialIcons name="share" size={14} color="rgba(255,255,255,0.5)" />
          <Text style={styles.shareButtonText}>Share trip with family</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// ── DEV-only debug line: shows tier engine internals so you can see why
// inactivity is/isn't firing in real time. Hidden in production builds.
const EngineDebugLine: React.FC<{ monitoring: ReturnType<typeof useMonitoringSession> }> = ({ monitoring }) => {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const dbg = monitoring.getEngineDebug();
  if (!dbg) return null;

  const fmtSpan = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const fmtMeters = (m: number) => (m < 1 ? '0 m' : m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`);
  const sigs = dbg.activeSignals.length ? dbg.activeSignals.join(',') : 'none';

  // Ping diagnostics — surface backend connectivity in real time.
  const lastPingAgo =
    monitoring.lastPingAt
      ? `${Math.max(0, Math.round((Date.now() - monitoring.lastPingAt) / 1000))}s ago`
      : 'never';
  const pingStatusColor =
    monitoring.lastPingStatus === 'ok' ? '#22c55e'
    : monitoring.lastPingStatus === 'filtered' ? '#eab308'
    : monitoring.lastPingStatus === 'cooldown' ? '#eab308'
    : monitoring.lastPingStatus === 'error' ? '#ef4444'
    : monitoring.lastPingStatus === 'no-fix' ? '#ef4444'
    : 'rgba(255,255,255,0.5)';

  return (
    <View style={{ marginTop: 6 }}>
      <Text
        style={{
          fontSize: 9,
          color: 'rgba(255,255,255,0.5)',
          fontFamily: 'monospace',
        }}
      >
        DBG · samples {dbg.samples} · still {fmtSpan(dbg.stationaryMs)} · {fmtMeters(dbg.distFromAnchorM)} from anchor · localT{dbg.tier} ({dbg.reason}) · sigs:{sigs}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: 9,
          color: pingStatusColor,
          fontFamily: 'monospace',
        }}
      >
        PING · ok {monitoring.pingCountSent} · filtered {monitoring.pingCountFiltered} · failed {monitoring.pingCountFailed} · last {lastPingAgo} ({monitoring.lastPingStatus ?? '—'}){monitoring.lastPingFilterReason ? ` "${monitoring.lastPingFilterReason}"` : ''}{monitoring.pingError ? ` · ERR: ${monitoring.pingError}` : ''}
      </Text>
    </View>
  );
};

export default ActiveMonitoringScreen;
