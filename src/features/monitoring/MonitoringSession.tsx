/**
 * MonitoringSession — global context for an active Start-Monitoring session.
 *
 * Owns: GPS watcher + 3s ping loop + destination state.
 * Backend convention: all calls use the user's id as the path segment
 * (the backend creates the session implicitly on the first ping).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/core/auth';
import {
  pingLocation,
  setDestination as apiSetDestination,
  clearDestination as apiClearDestination,
  stopTracking,
  getDestinationRemaining,
  getDestination as apiGetDestination,
  entryStart,
  entryEnd,
  PingPayload,
  DeviationAlert,
  StopResponse,
  Tier,
  LatLng,
} from '@/api/monitoring';
import { TierSignalService, SignalType } from './tierSignal';
import { StubSignalSource } from './stubSignalSource';
import { CheckInWatcher } from './CheckInWatcher';
import * as SecureStore from 'expo-secure-store';
import { MONITORING_BG_TASK, BG_KEYS, updateTraveledDistance } from './backgroundLocation';

// "Near destination" radius — keep in sync with rewp2:
//   src/routes/tracking.ts → INACTIVITY_NEAR_DEST_M (= ARRIVAL_RADIUS_M * 2 = 400)
// Used to suppress inactivity flagging when the user is essentially at
// destination (sitting at the cab drop-off, parking, etc.).
const NEAR_DESTINATION_M = 400;

// Auto-stop monitoring when the user has arrived. Tighter than NEAR_DESTINATION_M
// because arrival should mean "actually at the drop-off", not "approaching it".
const AUTO_STOP_RADIUS_M = 250;

// Background ping cadence per tier. The OS task gets restarted with these
// values whenever the local tier engine flips. Android's Doze mode may
// coalesce sub-15 s intervals when the screen has been off for a while —
// the requested interval is a floor, not a guarantee.
const BG_INTERVAL_BY_TIER: Record<Tier, number> = {
  1: 60_000,  // T1 passive — 30 s, battery-sensitive
  2: 15_000,  // T2 active  — 10 s
  3: 5_000,   // T3 emergency — 5 s
};
const BG_DISTANCE_M = 5;     // tighter than foreground; OS dedupes anyway
const BG_ACCURACY_BY_TIER: Record<Tier, Location.LocationAccuracy> = {
  // Use Balanced even in T1. Lowest produces cell-tower fixes that the
  // backend intentionally rejects (>35 m accuracy), which makes passive
  // monitoring look like it only works in foreground or only intermittently.
  1: Location.Accuracy.Balanced,
  2: Location.Accuracy.Balanced,
  3: Location.Accuracy.High,
};

// Distance threshold (m) for the haversine "moved enough to count" check.
function approxDistanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

const REMAINING_POLL_MS = 10_000;
const MOVING_SPEED_MPS = 0.6;

// Normalize React Native's AppState ('active'/'background'/'inactive') to the
// 'foreground'/'background' vocabulary the background task uses. Keeps the
// dashboard's `appState` field consistent across both ping paths — without
// this, the foreground watcher tagged pings with 'active' while the BG task
// tagged them with 'foreground'/'background', making the two streams look
// like they came from different worlds.
function normalizeAppState(s: AppStateStatus | string | null | undefined): 'foreground' | 'background' {
  return s === 'active' || s === 'foreground' ? 'foreground' : 'background';
}

// ── Per-tier GPS strategy ──────────────────────────────────────────────────
//   T1  passive    cell-tower / low-power, infrequent pings
//   T2  active     balanced GPS, moderate cadence
//   T3  emergency  full GPS, fast cadence
// `pingMs` doubles as the watcher's `timeInterval` so every observation is sent.
interface TierProfile {
  accuracy: Location.LocationAccuracy;
  pingMs: number;          // ping cadence + watcher timeInterval
  distanceM: number;       // watcher distanceInterval
  stationaryCooldownMs: number;
}

const TIER_PROFILES: Record<Tier, TierProfile> = {
  // T1 — Balanced keeps passive mode battery-aware while still producing
  // points accurate enough to survive the backend's strict accuracy gate.
  1: { accuracy: Location.Accuracy.Balanced, pingMs: 60_000, distanceM: 100, stationaryCooldownMs: 120_000 },
  2: { accuracy: Location.Accuracy.Balanced, pingMs: 15_000, distanceM: 25,  stationaryCooldownMs: 60_000  },
  3: { accuracy: Location.Accuracy.High,     pingMs: 5_000,  distanceM: 5,   stationaryCooldownMs: 15_000  },
};

// Check-in interval per tier, in minutes.
// MUST stay in sync with the backend's TIER_CONFIG in
// rewp2/src/routes/checkin.ts. Used locally to re-baseline `nextCheckinAt`
// the moment the tier engine flips, so the user doesn't keep seeing a stale
// "in 25 min" countdown after the system already escalated to T3.
const TIER_INTERVAL_MIN: Record<Tier, number> = {
  1: 15,
  2: 10,
  3: 5,
};

const DEFAULT_TIER: Tier = 1;

export type TripType = 'cab' | 'walking' | 'meeting' | 'custom';

export interface MonitoringDestination {
  lat: number;
  lng: number;
  name?: string;
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface MonitoringSessionState {
  isActive: boolean;
  isStarting: boolean;
  /**
   * ms-epoch of the last time the app transitioned to the foreground while
   * a session was active. Bumped by the AppState listener on every
   * 'active' event. Including this in a screen's hooks/deps forces stale
   * "Elapsed" / "Next check-in" counters to recompute the moment the user
   * returns to the app, instead of showing a frozen value until the next
   * 1 s tick of whatever interval drives them.
   */
  lastForegroundAt: number;
  startedAt: number | null;
  tripType: TripType;
  destination: MonitoringDestination | null;
  /** Driving polyline from origin → destination, fetched from backend OSRM. */
  routePolyline: LatLng[] | null;
  remainingMeters: number | null;
  lastLocation: Location.LocationObject | null;
  lastDeviation: DeviationAlert | null;
  arrivalDetected: boolean;
  inactivityFlag: boolean;
  pingError: string | null;
  tier: Tier;
  tierName: 'passive' | 'active' | 'emergency';
  intervalMinutes: number | null;
  nextCheckinAt: string | null;
  /**
   * True once the FIRST successful ping response has arrived. Tier /
   * check-in values are unreliable until this flips — UI should show a
   * "warming up" state until then to avoid "ghost" values.
   */
  hasFirstPing: boolean;
  /** Diagnostics: last ping attempt outcome surface for the DEV overlay. */
  lastPingAt: number | null;
  lastPingStatus: 'ok' | 'filtered' | 'cooldown' | 'no-fix' | 'error' | null;
  /** Backend's reason if the ping was filtered (GPS spike, etc.) */
  lastPingFilterReason: string | null;
  pingCountSent: number;       // accepted by backend (Redis updated)
  pingCountFiltered: number;   // 200 OK but rejected as spike
  pingCountFailed: number;
}

export interface MonitoringSessionContextValue extends MonitoringSessionState {
  startSession: (opts?: { tripType?: TripType }) => Promise<boolean>;
  endSession: () => Promise<StopResponse | null>;
  setDestination: (dest: MonitoringDestination) => Promise<boolean>;
  clearDestination: () => Promise<void>;
  setTripType: (t: TripType) => void;
  /**
   * Apply a check-in / escalation response to local state without waiting
   * for the next ping. Use after Safe/Cancel calls to immediately reset
   * the auto-prompt countdown.
   */
  applyCheckinUpdate: (update: {
    tier?: Tier;
    intervalMinutes?: number;
    nextCheckinAt?: string;
  }) => void;
  /** Push a signal into the local tier engine (e.g. on missed check-in). */
  pushTierSignal: (type: SignalType) => void;
  /** Clear a signal (e.g. when escalation is cancelled). */
  clearTierSignal: (type: SignalType) => void;
  /** Snapshot of the engine's internals — for DEV debug overlay. */
  getEngineDebug: () => {
    samples: number;
    spanMs: number;
    stationaryMs: number;
    distFromAnchorM: number;
    activeSignals: SignalType[];
    tier: Tier;
    reason: string;
  } | null;
  /**
   * Cumulative meters traveled in the current/just-ended session,
   * computed client-side from GPS fixes (foreground watcher + bg task).
   * Read this BEFORE calling endSession so the next session's reset
   * doesn't wipe it out.
   */
  getTraveledMeters: () => Promise<number>;
  /**
   * Client-side counters kept for the summary screen. The backend often
   * reports 0 for these in /handling/entry/:userId/summary.
   */
  getSessionCounts: () => { checkins: number; escalations: number };
}

const TIER_NAMES: Record<Tier, 'passive' | 'active' | 'emergency'> = {
  1: 'passive',
  2: 'active',
  3: 'emergency',
};

const initialState: MonitoringSessionState = {
  isActive: false,
  isStarting: false,
  lastForegroundAt: Date.now(),
  startedAt: null,
  tripType: 'cab',
  destination: null,
  routePolyline: null,
  remainingMeters: null,
  lastLocation: null,
  lastDeviation: null,
  arrivalDetected: false,
  inactivityFlag: false,
  pingError: null,
  tier: DEFAULT_TIER,
  tierName: TIER_NAMES[DEFAULT_TIER],
  intervalMinutes: null,
  nextCheckinAt: null,
  hasFirstPing: false,
  lastPingAt: null,
  lastPingStatus: null,
  lastPingFilterReason: null,
  pingCountSent: 0,
  pingCountFiltered: 0,
  pingCountFailed: 0,
};

const MonitoringSessionContext = createContext<MonitoringSessionContextValue | null>(null);

export const MonitoringSessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;

  const [state, setState] = useState<MonitoringSessionState>(initialState);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const latestLocationRef = useRef<Location.LocationObject | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const remainingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<number>(0);
  const sequenceRef = useRef<number>(0);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const tierRef = useRef<Tier>(DEFAULT_TIER);
  const reconfiguringRef = useRef<boolean>(false);
  // Baseline for the "next check-in" countdown. Starts at session start,
  // bumps to `now` whenever the user successfully responds "Safe". On a
  // tier shift we use this + new tier's interval to compute the new
  // deadline — accounting for elapsed time, so 5 min spent in T1 isn't
  // silently re-paid when we move to T2.
  const lastCheckinAtRef = useRef<number | null>(null);
  // Tier engine + stub signal source (lifecycle: created in startSession,
  // destroyed in endSession). Refs because they live across renders.
  const tierServiceRef = useRef<TierSignalService | null>(null);
  const signalSourceRef = useRef<StubSignalSource | null>(null);
  const destinationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Latched once the user crosses into AUTO_STOP_RADIUS_M of destination so
  // we don't re-enter endSession on every subsequent ping at the same spot.
  // Reset on startSession and whenever setDestination picks a new target.
  const autoStoppedRef = useRef<boolean>(false);
  // Forward reference so sendPingFromLatest can call endSession even though
  // endSession is declared later in the hook body.
  const endSessionRef = useRef<(() => Promise<StopResponse | null>) | null>(null);
  // Mirror tripType into a ref so the empty-deps callbacks (setDestination)
  // see the latest value without recreating on every change.
  const tripTypeRef = useRef<TripType>('cab');
  // Client-side counters for the summary screen. The backend reports 0
  // when the /handling/entry store is empty (most common in testing), so
  // we count locally and pass them through.
  const checkinCountRef = useRef<number>(0);
  const escalationCountRef = useRef<number>(0);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const stopWatchersInternal = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (remainingTimerRef.current) {
      clearInterval(remainingTimerRef.current);
      remainingTimerRef.current = null;
    }
    if (signalSourceRef.current) {
      signalSourceRef.current.destroy();
      signalSourceRef.current = null;
    }
    if (tierServiceRef.current) {
      tierServiceRef.current.destroy();
      tierServiceRef.current = null;
    }
    destinationRef.current = null;
  }, []);

  const startWatcherForTier = useCallback(async (tier: Tier) => {
    const profile = TIER_PROFILES[tier];
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    try {
      watcherRef.current = await Location.watchPositionAsync(
        {
          accuracy: profile.accuracy,
          timeInterval: profile.pingMs,
          distanceInterval: profile.distanceM,
        },
        (loc) => {
          latestLocationRef.current = loc;
          // Accumulate traveled distance for the final summary. Fire-and-forget
          // — SecureStore write latency must not block the watcher callback.
          updateTraveledDistance(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy,
          );
        },
      );
    } catch (e) {
      // best-effort — the next tier change will retry
    }
    pingTimerRef.current = setInterval(() => {
      sendPingFromLatestRef.current?.();
    }, profile.pingMs);
  }, []);

  // Stop + restart the OS-level background task with the cadence/accuracy
  // for `tier`. Safe to call repeatedly; if the task is already running,
  // we tear it down first so the new options actually take effect (the OS
  // ignores subsequent start calls with the same task name otherwise).
  const restartBackgroundForTier = useCallback(async (tier: Tier) => {
    try {
      const already = await Location.hasStartedLocationUpdatesAsync(
        MONITORING_BG_TASK,
      );
      if (already) {
        await Location.stopLocationUpdatesAsync(MONITORING_BG_TASK).catch(
          () => {},
        );
      }
      await Location.startLocationUpdatesAsync(MONITORING_BG_TASK, {
        accuracy: BG_ACCURACY_BY_TIER[tier],
        timeInterval: BG_INTERVAL_BY_TIER[tier],
        distanceInterval: BG_DISTANCE_M,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: `Deep Horizon · Monitoring`,
          notificationBody: `Your trip is being monitored in the background. Tap to return to the app.`,
          notificationColor: '#1d6fa4',
        },
        pausesUpdatesAutomatically: false,
      });
      console.log(
        `[monitoring] bg task running at T${tier}: ${BG_INTERVAL_BY_TIER[tier] / 1000}s`,
      );
    } catch (e) {
      console.warn(`[monitoring] bg task restart for T${tier} failed`, e);
    }
  }, []);

  const reconfigureForTier = useCallback(
    async (newTier: Tier) => {
      if (reconfiguringRef.current) return;
      if (tierRef.current === newTier) return;
      reconfiguringRef.current = true;
      tierRef.current = newTier;
      console.log(`[MonitoringSession] tier shift → T${newTier} (${TIER_NAMES[newTier]})`);
      await startWatcherForTier(newTier);
      // Also retune the OS-level background task. Fire-and-forget — the
      // foreground watcher restart is the user-visible part.
      restartBackgroundForTier(newTier).catch(() => {});
      reconfiguringRef.current = false;
    },
    [startWatcherForTier, restartBackgroundForTier],
  );

  // forward-decl ref so startWatcherForTier can call sendPingFromLatest before it's defined
  const sendPingFromLatestRef = useRef<(() => Promise<void>) | null>(null);

  const sendPingFromLatest = useCallback(async () => {
    if (AppState.currentState !== 'active') {
      return;
    }
    const loc = latestLocationRef.current;
    const uid = userIdRef.current;
    if (!loc) {
      console.log('[ping] skipped: no GPS fix yet');
      setState((s) => ({ ...s, lastPingStatus: 'no-fix' }));
      return;
    }
    if (!uid) {
      console.log('[ping] skipped: no userId');
      setState((s) => ({ ...s, lastPingStatus: 'no-fix' }));
      return;
    }

    const profile = TIER_PROFILES[tierRef.current];
    const speed = loc.coords.speed ?? 0;
    const moving = speed > MOVING_SPEED_MPS;
    const now = Date.now();

    // Feed the tier engine FIRST — it must see every fix to drive
    // inactivity. Doing this before the stationary cooldown ensures we
    // don't starve the very detector that should fire on inactivity.
    {
      const tierEngine = tierServiceRef.current;
      const dest = destinationRef.current;
      const distanceToDest = dest
        ? approxDistanceM(
            { lat: loc.coords.latitude, lng: loc.coords.longitude },
            dest,
          )
        : null;
      if (tierEngine) {
        const nearDest = distanceToDest !== null && distanceToDest <= NEAR_DESTINATION_M;
        tierEngine.reportPosition(loc.coords.latitude, loc.coords.longitude, nearDest);
      }

      // Auto-stop once the user arrives at destination. Latch via ref so we
      // don't re-fire on every subsequent ping at the same spot.
      if (
        distanceToDest !== null &&
        distanceToDest <= AUTO_STOP_RADIUS_M &&
        !autoStoppedRef.current
      ) {
        autoStoppedRef.current = true;
        console.log(
          `[monitoring] auto-stopping: within ${AUTO_STOP_RADIUS_M}m of destination (${distanceToDest.toFixed(0)}m)`,
        );
        endSessionRef.current?.().catch(() => {});
        return;
      }
    }

    if (!moving && now - lastSentRef.current < profile.stationaryCooldownMs) {
      console.log(`[ping] cooldown: stationary, ${Math.round((profile.stationaryCooldownMs - (now - lastSentRef.current)) / 1000)}s left`);
      setState((s) => ({ ...s, lastPingStatus: 'cooldown' }));
      return;
    }
    lastSentRef.current = now;

    const payload: PingPayload = {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
      speed: speed ?? undefined,
      heading: loc.coords.heading ?? undefined,
      timestamp: loc.timestamp,
      moving,
      source: 'expo-location',
      appState: normalizeAppState(AppState.currentState),
      sequence: ++sequenceRef.current,
      gpsIntervalMs: profile.pingMs,
      sessionId: sessionIdRef.current ?? undefined,
    };

    // (Tier engine was already fed above, before the cooldown bail.)
    const tier = tierServiceRef.current;

    try {
      const res = await pingLocation(uid, payload);
      // Backend says "session stopped" — bail out, don't update state, and
      // make sure our endSession ran so the bg task gets torn down.
      if ((res as any).stopped) {
        console.log('[ping] backend reports session stopped — bailing');
        endSessionRef.current?.().catch(() => {});
        return;
      }
      const wasFiltered = res.filtered === true;
      console.log(
        `[ping] ${wasFiltered ? 'FILTERED' : 'OK'} seq=${payload.sequence} ` +
        `uid=${uid.slice(0, 8)} tier=${res.tier ?? 'n/a'} ` +
        `lat=${payload.lat.toFixed(5)} lng=${payload.lng.toFixed(5)}` +
        (wasFiltered ? ` reason="${res.reason ?? '?'}"` : '') +
        ` dev=${res.deviationAlert ? 'YES' : 'no'} inact=${res.inactivityFlag ? 'YES' : 'no'}`
      );
      setState((s) => ({
        ...s,
        lastPingAt: Date.now(),
        lastPingStatus: wasFiltered ? 'filtered' : 'ok',
        lastPingFilterReason: wasFiltered ? (res.reason ?? null) : null,
        pingCountSent: wasFiltered ? s.pingCountSent : s.pingCountSent + 1,
        pingCountFiltered: wasFiltered ? s.pingCountFiltered + 1 : s.pingCountFiltered,
      }));

      // Bridge backend signals into the local tier engine. The engine is
      // the single source of tier truth for the client; the backend still
      // independently maintains its own checkin store for SOC visibility.
      if (tier) {
        if (res.deviationAlert) {
          const sev = (res.deviationAlert as any).severity as 'short' | 'long' | undefined;
          if (sev === 'long') tier.pushSignal('long_deviation');
          else if (sev === 'short') tier.pushSignal('short_deviation');
        }
        if (res.inactivityFlag) {
          tier.pushSignal('inactivity');
        }
        // Server detected the user missed the 30s response window while
        // the app was backgrounded (so the client's setInterval-based
        // countdown couldn't run). Push the signal locally so engine + UI
        // catch up. CheckInWatcher will navigate to EscalationScreen.
        if (res.missedCheckin) {
          console.log('[ping] backend reports missed check-in — escalating');
          tier.pushSignal('missed_checkin');
        }
      }

      // Server tier is informational only — the local engine is the single
      // source of truth for tier / intervalMinutes / nextCheckinAt. Without
      // this, server's "still T2" lingers (no client-side decay) and would
      // overwrite the local engine's correct "back to T1 · 30 min" with
      // a stale "T1 · 15 min" between local decay and the next ping that
      // re-bridges the signal. Tier sync happens further down via
      // pushSignal(), not here.
      const serverTier = (res.tier ?? null) as Tier | null;
      // ── ISSUE 1 FIX: The backend only emits `deviationAlert` on threshold
      // crossings (streak ∈ {3, 8}). Between those, alert is null even when
      // the user is still off-corridor. The new `deviationFlag` boolean
      // tells us "currently deviated" regardless of threshold — keep the
      // last alert visible while flagged, clear only when flag drops.
      setState((s) => ({
        ...s,
        lastLocation: loc,
        lastDeviation: res.deviationFlag
          ? (res.deviationAlert ?? s.lastDeviation)
          : null,
        arrivalDetected: !!res.arrivalDetected || s.arrivalDetected,
        inactivityFlag: !!res.inactivityFlag,
        pingError: null,
        hasFirstPing: true,
      }));
      // Keep server-side tier in sync as a safety net (rare disagreement).
      if (serverTier && serverTier > tierRef.current) {
        tier?.pushSignal(
          serverTier === 3 ? 'missed_checkin' : 'short_deviation',
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Ping failed';
      console.warn(`[ping] FAILED seq=${payload.sequence} err=${msg}`);
      // Don't surface transient network errors to the user — pings happen
      // every 5–15 s and the next one will succeed. Showing "Network Error"
      // for every momentary connectivity blip is noise, not actionable.
      // Detect axios network/timeout errors and downgrade them to a silent
      // failure: bump the counter, mark the status, but keep `pingError`
      // null so the in-app banner stays clean.
      const isTransientNetwork =
        e?.code === 'ERR_NETWORK' ||
        e?.code === 'ECONNABORTED' ||
        e?.code === 'ETIMEDOUT' ||
        e?.message === 'Network Error' ||
        /timeout|aborted|network/i.test(msg);
      setState((s) => ({
        ...s,
        pingError: isTransientNetwork ? null : msg,
        lastPingStatus: 'error',
        pingCountFailed: s.pingCountFailed + 1,
      }));
    }
  }, [reconfigureForTier]);

  // Bind for use inside startWatcherForTier (declared above sendPingFromLatest).
  useEffect(() => {
    sendPingFromLatestRef.current = sendPingFromLatest;
  }, [sendPingFromLatest]);

  const startSession = useCallback(
    async (opts?: { tripType?: TripType }) => {
      if (state.isActive || state.isStarting) return true;
      if (!userId) {
        Alert.alert('Sign in required', 'Please sign in to start monitoring.');
        return false;
      }

      setState((s) => ({ ...s, isStarting: true, pingError: null }));

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState((s) => ({ ...s, isStarting: false }));
        Alert.alert(
          'Location permission required',
          'Deep Horizon needs your location to monitor your trip.',
        );
        return false;
      }
      // Background permission is asked inside the deferred block below
      // so it doesn't block navigation either.

      // ── SYNCHRONOUS path — only the cheap stuff before flipping isActive.
      // Everything below this block returns the user to QuickStart instantly;
      // the slow native calls happen in the deferred async block below.

      sequenceRef.current = 0;
      lastSentRef.current = 0;
      sessionIdRef.current = `sm_${Date.now()}`;
      tierRef.current = DEFAULT_TIER;
      destinationRef.current = null;
      autoStoppedRef.current = false;
      const startCheckinMs = Date.now();
      lastCheckinAtRef.current = startCheckinMs;

      // Wipe any stale distance from a prior session so this one starts at 0.
      SecureStore.deleteItemAsync(BG_KEYS.distanceM).catch(() => {});
      SecureStore.deleteItemAsync(BG_KEYS.lastLat).catch(() => {});
      SecureStore.deleteItemAsync(BG_KEYS.lastLng).catch(() => {});
      SecureStore.setItemAsync(BG_KEYS.lastCheckinAt, String(startCheckinMs)).catch(() => {});
      checkinCountRef.current = 0;
      escalationCountRef.current = 0;

      // Spin up the local tier engine synchronously — it drives every
      // tier-change UI update and adapts the GPS watcher when shifts occur.
      const tierService = new TierSignalService();
      tierServiceRef.current = tierService;
      tierService.onTierChange((newTier, reason, prev) => {
        console.log(`[tier] ${prev} → ${newTier} (${reason})`);
        // 1. Drive the GPS strategy reconfig (Lowest/Balanced/High).
        reconfigureForTier(newTier).catch(() => {});

        // 2. Re-baseline the check-in countdown to the new interval,
        //    anchored to the last successful check-in (or session start).
        const intervalMin = TIER_INTERVAL_MIN[newTier];
        const baseMs = lastCheckinAtRef.current ?? Date.now();
        const dueMs = Math.max(Date.now(), baseMs + intervalMin * 60_000);
        const nextDueIso = new Date(dueMs).toISOString();

        setState((s) => ({
          ...s,
          tier: newTier,
          tierName: TIER_NAMES[newTier],
          intervalMinutes: intervalMin,
          nextCheckinAt: nextDueIso,
        }));
      });

      // Stamp session start NOW (before the deferred block) so it can be
      // persisted to SecureStore for rehydration and reused below when we
      // seed the initial check-in deadline.
      const startMs = Date.now();
      const t1IntervalMin = TIER_INTERVAL_MIN[DEFAULT_TIER];
      const t1DueIso = new Date(startMs + t1IntervalMin * 60_000).toISOString();

      // ── DEFERRED async path — runs in the background after we return.
      // None of these block navigation. The user gets to QuickStart now;
      // the OS native calls + first ping arrive within seconds.
      void (async () => {
        // SecureStore handoff (parallel writes)
        Promise.all([
          SecureStore.setItemAsync(BG_KEYS.active, 'true'),
          SecureStore.setItemAsync(BG_KEYS.userId, userId),
          SecureStore.setItemAsync(BG_KEYS.sessionId, sessionIdRef.current ?? ''),
          // Seed appState NOW so the BG task isn't reading a stale value
          // from a previous session — and use the same vocabulary the
          // AppState 'change' listener uses so dashboards see consistent
          // labels across the FG ping path and the BG ping path.
          SecureStore.setItemAsync(
            BG_KEYS.appState,
            normalizeAppState(AppState.currentState),
          ),
          SecureStore.setItemAsync(BG_KEYS.sequence, '0'),
          SecureStore.setItemAsync(BG_KEYS.startedAt, String(startMs)),
          SecureStore.setItemAsync(BG_KEYS.tripType, opts?.tripType ?? tripTypeRef.current),
        ]).catch((e) =>
          console.warn('[monitoring] SecureStore bridge write failed', e),
        );

        // Backend lifecycle entry — fire-and-forget, pings are the truth.
        entryStart(userId)
          .then((r) => {
            if (r?.session_id) sessionIdRef.current = r.session_id;
          })
          .catch(() => {});

        // Seed location — best-effort. If it succeeds before the watcher
        // produces its first fix, fire an immediate ping so /users/active
        // populates within a couple of seconds.
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
          .then((seed) => {
            latestLocationRef.current = seed;
            console.log(
              `[monitoring] seeded GPS fix lat=${seed.coords.latitude.toFixed(5)} lng=${seed.coords.longitude.toFixed(5)}`,
            );
            sendPingFromLatestRef.current?.().catch(() => {});
          })
          .catch((e) =>
            console.warn('[monitoring] could not get initial GPS fix', e),
          );

        // Request background permission BEFORE starting the native task.
        // If Android rejects task startup while the permission dialog is
        // still pending, the session appears to work only in foreground.
        try {
          const bgPerm = await Location.requestBackgroundPermissionsAsync();
          if (bgPerm.status === 'granted') {
            await restartBackgroundForTier(DEFAULT_TIER);
          } else {
            console.warn('[monitoring] background location permission not granted; background pings disabled');
          }
        } catch (e) {
          console.warn('[monitoring] background permission / restart failed', e);
        }
        try {
          await startWatcherForTier(DEFAULT_TIER);
        } catch (e) {
          console.warn('[monitoring] startWatcherForTier failed', e);
        }
      })();

      // (The first ping fires from the deferred block above as soon as
      // the seed location resolves — no need to fire one here.)

      setState((s) => ({
        ...s,
        isActive: true,
        isStarting: false,
        startedAt: startMs,
        tripType: opts?.tripType ?? s.tripType,
        destination: null,
        routePolyline: null,
        remainingMeters: null,
        lastLocation: null,
        lastDeviation: null,
        arrivalDetected: false,
        inactivityFlag: false,
        tier: DEFAULT_TIER,
        tierName: TIER_NAMES[DEFAULT_TIER],
        intervalMinutes: t1IntervalMin,
        nextCheckinAt: t1DueIso,
        hasFirstPing: false,
        // Reset diagnostics so the DEV overlay reflects only this session.
        lastPingAt: null,
        lastPingStatus: null,
        lastPingFilterReason: null,
        pingCountSent: 0,
        pingCountFiltered: 0,
        pingCountFailed: 0,
      }));

      return true;
    },
    [state.isActive, state.isStarting, userId, startWatcherForTier, restartBackgroundForTier],
  );

  const endSession = useCallback(async (): Promise<StopResponse | null> => {
    stopWatchersInternal();
    const uid = userIdRef.current;
    // Wipe everything the CheckInWatcher reads — without this, the deadline
    // stays in state and the watcher will navigate to CheckInPrompt (or
    // re-fire the queued local notification) after the session has ended.
    setState((s) => ({
      ...s,
      isActive: false,
      isStarting: false,
      nextCheckinAt: null,
      intervalMinutes: null,
      hasFirstPing: false,
      lastPingStatus: null,
      arrivalDetected: false,
      inactivityFlag: false,
      lastDeviation: null,
    }));
    lastCheckinAtRef.current = null;

    // Tear down the OS-level background task. CRITICAL: also flip the
    // SecureStore "active" gate to false BEFORE stopping the task, so any
    // in-flight delivery silently no-ops instead of pinging.
    SecureStore.setItemAsync(BG_KEYS.active, 'false').catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.startedAt).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.tripType).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.nextCheckinAt).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.lastCheckinAt).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.destinationLat).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.destinationLng).catch(() => {});
    SecureStore.deleteItemAsync(BG_KEYS.destinationName).catch(() => {});
    Location.hasStartedLocationUpdatesAsync(MONITORING_BG_TASK)
      .then((started) => {
        if (started) {
          Location.stopLocationUpdatesAsync(MONITORING_BG_TASK).catch(() => {});
        }
      })
      .catch(() => {});

    if (!uid) return null;
    // Tear down both layers: location-service session + /handling lifecycle.
    entryEnd(uid).catch(() => {});
    try {
      const res = await stopTracking(uid);
      sessionIdRef.current = null;
      return res;
    } catch (e) {
      sessionIdRef.current = null;
      return null;
    }
  }, [stopWatchersInternal]);

  useEffect(() => {
    endSessionRef.current = endSession;
  }, [endSession]);

  const setDestination = useCallback(
    async (dest: MonitoringDestination) => {
      const uid = userIdRef.current;
      const loc = latestLocationRef.current;
      if (!uid || !loc) {
        Alert.alert(
          'Waiting for GPS',
          'We need your current location to compute the route. Try again in a moment.',
        );
        return false;
      }
      try {
        // Pass the user's selected trip type so the backend uses the right
        // OSRM profile (driving for cab/meeting/custom, walking for foot trips).
        const res = await apiSetDestination(
          uid,
          { lat: loc.coords.latitude, lng: loc.coords.longitude },
          { lat: dest.lat, lng: dest.lng },
          dest.name,
          tripTypeRef.current,
        );
        destinationRef.current = { lat: dest.lat, lng: dest.lng };
        autoStoppedRef.current = false;
        // Persist the destination so it survives app-swipe-from-Recents.
        // Fire-and-forget — SecureStore writes are idempotent and a failure
        // here just means the next cold start will lose the target.
        Promise.all([
          SecureStore.setItemAsync(BG_KEYS.destinationLat, String(dest.lat)),
          SecureStore.setItemAsync(BG_KEYS.destinationLng, String(dest.lng)),
          SecureStore.setItemAsync(BG_KEYS.destinationName, dest.name ?? ''),
        ]).catch(() => {});
        setState((s) => ({
          ...s,
          destination: {
            ...dest,
            distanceMeters: res.distance,
            durationSeconds: res.duration,
          },
        }));

        // Fetch the OSRM polyline now that the route exists server-side.
        // Async, fire-and-forget — the map will render the line as soon as
        // it arrives. Failure is non-fatal (map just shows straight markers).
        apiGetDestination(uid, { includeRoute: true })
          .then((d) => {
            if (d?.route && d.route.length >= 2) {
              setState((s) => ({ ...s, routePolyline: d.route ?? null }));
            }
          })
          .catch(() => {});

        if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
        remainingTimerRef.current = setInterval(async () => {
          try {
            const r = await getDestinationRemaining(uid);
            setState((s) => ({
              ...s,
              remainingMeters: r.active ? r.remaining ?? null : null,
            }));
          } catch {
            // ignore — transient errors are expected on flaky networks
          }
        }, REMAINING_POLL_MS);

        return true;
      } catch (e: any) {
        Alert.alert('Could not set destination', e?.message ?? 'Routing failed');
        return false;
      }
    },
    [],
  );

  const clearDestination = useCallback(async () => {
    const uid = userIdRef.current;
    if (remainingTimerRef.current) {
      clearInterval(remainingTimerRef.current);
      remainingTimerRef.current = null;
    }
    destinationRef.current = null;
    Promise.all([
      SecureStore.deleteItemAsync(BG_KEYS.destinationLat),
      SecureStore.deleteItemAsync(BG_KEYS.destinationLng),
      SecureStore.deleteItemAsync(BG_KEYS.destinationName),
    ]).catch(() => {});
    setState((s) => ({
      ...s,
      destination: null,
      routePolyline: null,
      remainingMeters: null,
    }));
    if (!uid) return;
    try {
      await apiClearDestination(uid);
    } catch {
      // best-effort
    }
  }, []);

  // Direct signal-source pokes for the screens (e.g. CheckInPrompt timer
  // expiry pushes 'missed_checkin' to drop straight into Tier 3).
  const pushTierSignal = useCallback((type: SignalType) => {
    tierServiceRef.current?.pushSignal(type);
    if (type === 'missed_checkin' || type === 'long_deviation') {
      escalationCountRef.current += 1;
    }
  }, []);

  const clearTierSignal = useCallback((type: SignalType) => {
    tierServiceRef.current?.clearSignal(type);
  }, []);

  const getEngineDebug = useCallback(() => {
    return tierServiceRef.current?.getDebugSnapshot() ?? null;
  }, []);

  const getTraveledMeters = useCallback(async (): Promise<number> => {
    try {
      const raw = await SecureStore.getItemAsync(BG_KEYS.distanceM);
      if (!raw) return 0;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }, []);

  const getSessionCounts = useCallback(
    () => ({
      checkins: checkinCountRef.current,
      escalations: escalationCountRef.current,
    }),
    [],
  );

  const setTripType = useCallback((t: TripType) => {
    tripTypeRef.current = t;
    setState((s) => ({ ...s, tripType: t }));
  }, []);

  const applyCheckinUpdate = useCallback(
    (update: { tier?: Tier; intervalMinutes?: number; nextCheckinAt?: string }) => {
      // A response from /checkin/respond or /escalation/safe means the user
      // just successfully checked in. Re-anchor the countdown baseline so
      // a subsequent tier shift recomputes from "now", not session start.
      if (update.nextCheckinAt) {
        const now = Date.now();
        lastCheckinAtRef.current = now;
        checkinCountRef.current += 1;
        SecureStore.setItemAsync(BG_KEYS.lastCheckinAt, String(now)).catch(() => {});
      }
      setState((s) => ({
        ...s,
        tier: update.tier ?? s.tier,
        tierName: update.tier ? TIER_NAMES[update.tier] : s.tierName,
        intervalMinutes: update.intervalMinutes ?? s.intervalMinutes,
        nextCheckinAt: update.nextCheckinAt ?? s.nextCheckinAt,
      }));
      if (update.tier && update.tier !== tierRef.current) {
        reconfigureForTier(update.tier).catch(() => {});
      }
    },
    [reconfigureForTier],
  );

  useEffect(() => {
    return () => {
      stopWatchersInternal();
    };
  }, [stopWatchersInternal]);

  // ── Rehydrate a session that outlived the JS bundle ─────────────────────
  // When the user swipes the app from Recents (or it's killed by low-memory),
  // the native foreground-location service keeps running (see
  // android:stopWithTask="false" in AndroidManifest.xml). On cold relaunch,
  // React state is empty → the UI shows "Start Monitoring" even though GPS
  // is still pinging in the background. Detect that case and restore state.
  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current) return;
    if (!userId) return;              // wait for auth
    if (state.isActive || state.isStarting) return;

    didRehydrateRef.current = true;
    (async () => {
      try {
        const [active, storedUid, storedSid, storedStart, storedTrip] = await Promise.all([
          SecureStore.getItemAsync(BG_KEYS.active),
          SecureStore.getItemAsync(BG_KEYS.userId),
          SecureStore.getItemAsync(BG_KEYS.sessionId),
          SecureStore.getItemAsync(BG_KEYS.startedAt),
          SecureStore.getItemAsync(BG_KEYS.tripType),
        ]);
        if (active !== 'true') return;
        if (!storedUid || storedUid !== userId) return;

        // Also verify the native task is still alive — if it was killed
        // (stopWithTask flag didn't take effect, or OEM task-killer removed
        // it) there's nothing to resume; clear the stale flag instead.
        const taskAlive = await Location.hasStartedLocationUpdatesAsync(MONITORING_BG_TASK).catch(() => false);
        if (!taskAlive) {
          SecureStore.setItemAsync(BG_KEYS.active, 'false').catch(() => {});
          return;
        }

        const startMs = Number(storedStart ?? Date.now());
        const t1IntervalMin = TIER_INTERVAL_MIN[DEFAULT_TIER];
        const nowMs = Date.now();

        // Restore the real check-in anchors from SecureStore so scheduled
        // notifications and the in-app countdown stay in sync. If we reset
        // nextCheckinAt to "now + interval" on rehydration, then the stale
        // AlarmManager entry fires at the original time → prompt appears
        // out of sync, and missed-check-in fires even when the user didn't
        // actually miss.
        const [
          storedNextCheckin,
          storedLastCheckin,
          storedDestLat,
          storedDestLng,
          storedDestName,
        ] = await Promise.all([
          SecureStore.getItemAsync(BG_KEYS.nextCheckinAt),
          SecureStore.getItemAsync(BG_KEYS.lastCheckinAt),
          SecureStore.getItemAsync(BG_KEYS.destinationLat),
          SecureStore.getItemAsync(BG_KEYS.destinationLng),
          SecureStore.getItemAsync(BG_KEYS.destinationName),
        ]);
        const restoredDestLat = storedDestLat ? Number(storedDestLat) : NaN;
        const restoredDestLng = storedDestLng ? Number(storedDestLng) : NaN;
        const restoredDestination: MonitoringDestination | null =
          Number.isFinite(restoredDestLat) && Number.isFinite(restoredDestLng)
            ? {
                lat: restoredDestLat,
                lng: restoredDestLng,
                name: storedDestName ?? '',
              }
            : null;
        const storedNextMs = storedNextCheckin ? new Date(storedNextCheckin).getTime() : NaN;
        // Only trust the persisted deadline if it's still in the future or
        // very recently past — otherwise fall back to a fresh interval.
        const nextDueIso =
          Number.isFinite(storedNextMs) && storedNextMs > nowMs - 60_000
            ? new Date(storedNextMs).toISOString()
            : new Date(nowMs + t1IntervalMin * 60_000).toISOString();

        sessionIdRef.current = storedSid || `sm_${startMs}`;
        lastCheckinAtRef.current = storedLastCheckin ? Number(storedLastCheckin) : nowMs;
        tierRef.current = DEFAULT_TIER;
        if (restoredDestination) {
          destinationRef.current = {
            lat: restoredDestination.lat,
            lng: restoredDestination.lng,
          };
          autoStoppedRef.current = false;
        }

        const tierService = new TierSignalService();
        tierServiceRef.current = tierService;
        tierService.onTierChange((newTier, reason, prev) => {
          console.log(`[tier] ${prev} → ${newTier} (${reason})`);
          reconfigureForTier(newTier).catch(() => {});
          const intervalMin = TIER_INTERVAL_MIN[newTier];
          const baseMs = lastCheckinAtRef.current ?? Date.now();
          const dueMs = Math.max(Date.now(), baseMs + intervalMin * 60_000);
          setState((s) => ({
            ...s,
            tier: newTier,
            tierName: TIER_NAMES[newTier],
            intervalMinutes: intervalMin,
            nextCheckinAt: new Date(dueMs).toISOString(),
          }));
        });

        setState((s) => ({
          ...s,
          isActive: true,
          isStarting: false,
          startedAt: startMs,
          tripType: (storedTrip as TripType) ?? s.tripType,
          tier: DEFAULT_TIER,
          tierName: TIER_NAMES[DEFAULT_TIER],
          intervalMinutes: t1IntervalMin,
          nextCheckinAt: nextDueIso,
          hasFirstPing: false,
          pingError: null,
          destination: restoredDestination ?? s.destination,
        }));

        // Spin the foreground watcher back up so the in-app UI shows live
        // pings. The background task is already running; this is purely
        // for UI/diagnostic freshness while the app is open.
        startWatcherForTier(DEFAULT_TIER).catch((e) =>
          console.warn('[monitoring] rehydrate watcher start failed', e),
        );

        // Re-fetch polyline + remaining-distance for the restored destination
        // so the Route tile isn't stuck showing raw coords only. Backend may
        // have also expired the destination server-side — failure is fine.
        if (restoredDestination) {
          apiGetDestination(userId, { includeRoute: true })
            .then((d) => {
              if (d?.route && d.route.length >= 2) {
                setState((s) => ({ ...s, routePolyline: d.route ?? null }));
              }
              if (d?.distance || d?.duration) {
                setState((s) => ({
                  ...s,
                  destination: s.destination
                    ? {
                        ...s.destination,
                        distanceMeters: d.distance ?? s.destination.distanceMeters,
                        durationSeconds: d.duration ?? s.destination.durationSeconds,
                      }
                    : s.destination,
                }));
              }
            })
            .catch(() => {});

          if (remainingTimerRef.current) clearInterval(remainingTimerRef.current);
          remainingTimerRef.current = setInterval(async () => {
            try {
              const r = await getDestinationRemaining(userId);
              setState((s) => ({
                ...s,
                remainingMeters: r.active ? r.remaining ?? null : null,
              }));
            } catch {
              // ignore — transient errors
            }
          }, REMAINING_POLL_MS);
        }
        console.log(`[monitoring] rehydrated session startedAt=${new Date(startMs).toISOString()}`);
      } catch (e) {
        console.warn('[monitoring] rehydrate failed', e);
      }
    })();
  }, [userId, state.isActive, state.isStarting, reconfigureForTier, startWatcherForTier]);

  // Mirror app foreground/background state into SecureStore so the
  // background task tags pings with the right `appState`. The bridge is
  // only meaningful while a session is active.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (!state.isActive) return;
      const flag = normalizeAppState(next);
      SecureStore.setItemAsync(BG_KEYS.appState, flag).catch(() => {});

      // ── Hand off to background task on backgrounding ──────────────────
      // The setInterval that drives sendPingFromLatest can race the
      // `AppState.currentState !== 'active'` guard for one or two ticks
      // when the OS first backgrounds the app — those late pings get
      // tagged `source: expo-location` even though the app is no longer
      // foregrounded, which is misleading on the dashboard. Killing the
      // interval here is deterministic: from the moment the OS reports
      // background, every ping comes from the BG task with
      // `source: background_task`.
      if (flag === 'background') {
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
      } else if (flag === 'foreground') {
        // Bump the foreground timestamp so any screen consuming
        // `lastForegroundAt` re-renders immediately on return-to-app.
        // Stale "Elapsed" / "Next check-in" counters refresh now instead
        // of waiting for the next 1 s tick of whatever drives them.
        setState((s) => ({ ...s, lastForegroundAt: Date.now() }));

        // Returning to foreground — re-arm the FG ping cadence at the
        // current tier. (The location watcher itself was never stopped;
        // it kept feeding `latestLocationRef`. We only restart the timer
        // that triggers backend pings.)
        if (!pingTimerRef.current) {
          const tierProfile = TIER_PROFILES[tierRef.current];
          pingTimerRef.current = setInterval(() => {
            sendPingFromLatestRef.current?.();
          }, tierProfile.pingMs);
        }
      }
    });
    return () => sub.remove();
  }, [state.isActive]);

  // Mirror nextCheckinAt to SecureStore. On app-kill + relaunch the
  // rehydration path reads this to restore the real deadline, keeping
  // the in-app countdown in sync with Android's AlarmManager entries.
  useEffect(() => {
    if (state.nextCheckinAt) {
      SecureStore.setItemAsync(BG_KEYS.nextCheckinAt, state.nextCheckinAt).catch(() => {});
    } else {
      SecureStore.deleteItemAsync(BG_KEYS.nextCheckinAt).catch(() => {});
    }
  }, [state.nextCheckinAt]);

  const value = useMemo<MonitoringSessionContextValue>(
    () => ({
      ...state,
      startSession,
      endSession,
      setDestination,
      clearDestination,
      setTripType,
      applyCheckinUpdate,
      pushTierSignal,
      clearTierSignal,
      getEngineDebug,
      getTraveledMeters,
      getSessionCounts,
    }),
    [
      state,
      startSession,
      endSession,
      setDestination,
      clearDestination,
      setTripType,
      applyCheckinUpdate,
      pushTierSignal,
      clearTierSignal,
      getEngineDebug,
      getTraveledMeters,
      getSessionCounts,
    ],
  );

  return (
    <MonitoringSessionContext.Provider value={value}>
      {children}
      {/* Global check-in trigger: prompts the user from any screen + fires
          a local notification when the app is backgrounded. */}
      <CheckInWatcher />
    </MonitoringSessionContext.Provider>
  );
};

export function useMonitoringSession(): MonitoringSessionContextValue {
  const ctx = useContext(MonitoringSessionContext);
  if (!ctx) {
    throw new Error(
      'useMonitoringSession must be used inside <MonitoringSessionProvider>',
    );
  }
  return ctx;
}
