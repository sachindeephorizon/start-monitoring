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
import { Alert, AppState } from 'react-native';
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

const NEAR_DESTINATION_M = 400;
const AUTO_STOP_RADIUS_M = 250;

const BG_INTERVAL_BY_TIER: Record<Tier, number> = {
  1: 60_000,
  2: 15_000,
  3: 5_000,
};
const BG_DISTANCE_M = 5;
const BG_ACCURACY_BY_TIER: Record<Tier, Location.LocationAccuracy> = {
  1: Location.Accuracy.Lowest,
  2: Location.Accuracy.Balanced,
  3: Location.Accuracy.High,
};

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

interface TierProfile {
  accuracy: Location.LocationAccuracy;
  pingMs: number;
  distanceM: number;
  stationaryCooldownMs: number;
}

const TIER_PROFILES: Record<Tier, TierProfile> = {
  1: { accuracy: Location.Accuracy.Lowest,   pingMs: 60_000, distanceM: 100, stationaryCooldownMs: 120_000 },
  2: { accuracy: Location.Accuracy.Balanced, pingMs: 15_000, distanceM: 25,  stationaryCooldownMs: 60_000  },
  3: { accuracy: Location.Accuracy.High,     pingMs: 5_000,  distanceM: 5,   stationaryCooldownMs: 15_000  },
};

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
  startedAt: number | null;
  tripType: TripType;
  destination: MonitoringDestination | null;
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
  hasFirstPing: boolean;
  lastPingAt: number | null;
  lastPingStatus: 'ok' | 'filtered' | 'cooldown' | 'no-fix' | 'error' | null;
  lastPingFilterReason: string | null;
  pingCountSent: number;
  pingCountFiltered: number;
  pingCountFailed: number;
}

export interface MonitoringSessionContextValue extends MonitoringSessionState {
  startSession: (opts?: { tripType?: TripType }) => Promise<boolean>;
  endSession: () => Promise<StopResponse | null>;
  setDestination: (dest: MonitoringDestination) => Promise<boolean>;
  clearDestination: () => Promise<void>;
  setTripType: (t: TripType) => void;
  applyCheckinUpdate: (update: {
    tier?: Tier;
    intervalMinutes?: number;
    nextCheckinAt?: string;
  }) => void;
  pushTierSignal: (type: SignalType) => void;
  clearTierSignal: (type: SignalType) => void;
  getEngineDebug: () => {
    samples: number;
    spanMs: number;
    stationaryMs: number;
    distFromAnchorM: number;
    activeSignals: SignalType[];
    tier: Tier;
    reason: string;
  } | null;
  getTraveledMeters: () => Promise<number>;
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
  const lastCheckinAtRef = useRef<number | null>(null);
  const tierServiceRef = useRef<TierSignalService | null>(null);
  const signalSourceRef = useRef<StubSignalSource | null>(null);
  const destinationRef = useRef<{ lat: number; lng: number } | null>(null);
  const autoStoppedRef = useRef<boolean>(false);
  const endSessionRef = useRef<(() => Promise<StopResponse | null>) | null>(null);
  const tripTypeRef = useRef<TripType>('cab');
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
          updateTraveledDistance(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy,
          );
        },
      );
    } catch (e) {
      // best-effort
    }
    pingTimerRef.current = setInterval(() => {
      sendPingFromLatestRef.current?.();
    }, profile.pingMs);
  }, []);

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
      restartBackgroundForTier(newTier).catch(() => {});
      reconfiguringRef.current = false;
    },
    [startWatcherForTier, restartBackgroundForTier],
  );

  const sendPingFromLatestRef = useRef<(() => Promise<void>) | null>(null);

  const sendPingFromLatest = useCallback(async () => {
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
      appState: AppState.currentState,
      sequence: ++sequenceRef.current,
      gpsIntervalMs: profile.pingMs,
      sessionId: sessionIdRef.current ?? undefined,
    };

    const tier = tierServiceRef.current;

    try {
      const res = await pingLocation(uid, payload);

      // Backend set stopped flag — session already torn down server-side, end locally.
      if (res.stopped) {
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

      if (tier) {
        if (res.deviationAlert) {
          const sev = (res.deviationAlert as any).severity as 'short' | 'long' | undefined;
          if (sev === 'long') tier.pushSignal('long_deviation');
          else if (sev === 'short') tier.pushSignal('short_deviation');
        }
        if (res.inactivityFlag) {
          tier.pushSignal('inactivity');
        }
        if (res.missedCheckin) {
          console.log('[ping] backend reports missed check-in — escalating');
          tier.pushSignal('missed_checkin');
        }
      }

      const serverTier = (res.tier ?? null) as Tier | null;
      setState((s) => ({
        ...s,
        lastLocation: loc,
        // Hold lastDeviation while still deviated; clear only when deviationFlag is false.
        lastDeviation: res.deviationFlag
          ? (res.deviationAlert ?? s.lastDeviation)
          : null,
        arrivalDetected: !!res.arrivalDetected || s.arrivalDetected,
        inactivityFlag: !!res.inactivityFlag,
        pingError: null,
        hasFirstPing: true,
      }));
      if (serverTier && serverTier > tierRef.current) {
        tier?.pushSignal(
          serverTier === 3 ? 'missed_checkin' : 'short_deviation',
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Ping failed';
      console.warn(`[ping] FAILED seq=${payload.sequence} err=${msg}`);
      setState((s) => ({
        ...s,
        pingError: msg,
        lastPingStatus: 'error',
        pingCountFailed: s.pingCountFailed + 1,
      }));
    }
  }, [reconfigureForTier]);

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

      sequenceRef.current = 0;
      lastSentRef.current = 0;
      sessionIdRef.current = `sm_${Date.now()}`;
      tierRef.current = DEFAULT_TIER;
      destinationRef.current = null;
      autoStoppedRef.current = false;
      const startCheckinMs = Date.now();
      lastCheckinAtRef.current = startCheckinMs;

      SecureStore.deleteItemAsync(BG_KEYS.distanceM).catch(() => {});
      SecureStore.deleteItemAsync(BG_KEYS.lastLat).catch(() => {});
      SecureStore.deleteItemAsync(BG_KEYS.lastLng).catch(() => {});
      SecureStore.setItemAsync(BG_KEYS.lastCheckinAt, String(startCheckinMs)).catch(() => {});
      checkinCountRef.current = 0;
      escalationCountRef.current = 0;

      const tierService = new TierSignalService();
      tierServiceRef.current = tierService;
      tierService.onTierChange((newTier, reason, prev) => {
        console.log(`[tier] ${prev} → ${newTier} (${reason})`);
        reconfigureForTier(newTier).catch(() => {});

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

      const startMs = Date.now();
      const t1IntervalMin = TIER_INTERVAL_MIN[DEFAULT_TIER];
      const t1DueIso = new Date(startMs + t1IntervalMin * 60_000).toISOString();

      void (async () => {
        Promise.all([
          SecureStore.setItemAsync(BG_KEYS.active, 'true'),
          SecureStore.setItemAsync(BG_KEYS.userId, userId),
          SecureStore.setItemAsync(BG_KEYS.sessionId, sessionIdRef.current ?? ''),
          SecureStore.setItemAsync(BG_KEYS.appState, AppState.currentState),
          SecureStore.setItemAsync(BG_KEYS.sequence, '0'),
          SecureStore.setItemAsync(BG_KEYS.startedAt, String(startMs)),
          SecureStore.setItemAsync(BG_KEYS.tripType, opts?.tripType ?? tripTypeRef.current),
        ]).catch((e) =>
          console.warn('[monitoring] SecureStore bridge write failed', e),
        );

        entryStart(userId)
          .then((r) => {
            if (r?.session_id) sessionIdRef.current = r.session_id;
          })
          .catch(() => {});

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

        try {
          await restartBackgroundForTier(DEFAULT_TIER);
        } catch (e) {
          console.warn('[monitoring] restartBackgroundForTier failed', e);
        }
        try {
          await startWatcherForTier(DEFAULT_TIER);
        } catch (e) {
          console.warn('[monitoring] startWatcherForTier failed', e);
        }

        Location.requestBackgroundPermissionsAsync().catch(() => {});
      })();

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
        const res = await apiSetDestination(
          uid,
          { lat: loc.coords.latitude, lng: loc.coords.longitude },
          { lat: dest.lat, lng: dest.lng },
          dest.name,
          tripTypeRef.current,
        );
        destinationRef.current = { lat: dest.lat, lng: dest.lng };
        autoStoppedRef.current = false;
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
            // ignore
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

  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current) return;
    if (!userId) return;
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

        const taskAlive = await Location.hasStartedLocationUpdatesAsync(MONITORING_BG_TASK).catch(() => false);
        if (!taskAlive) {
          SecureStore.setItemAsync(BG_KEYS.active, 'false').catch(() => {});
          return;
        }

        const startMs = Number(storedStart ?? Date.now());
        const t1IntervalMin = TIER_INTERVAL_MIN[DEFAULT_TIER];
        const nowMs = Date.now();

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

        startWatcherForTier(DEFAULT_TIER).catch((e) =>
          console.warn('[monitoring] rehydrate watcher start failed', e),
        );

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
              // ignore
            }
          }, REMAINING_POLL_MS);
        }
        console.log(`[monitoring] rehydrated session startedAt=${new Date(startMs).toISOString()}`);
      } catch (e) {
        console.warn('[monitoring] rehydrate failed', e);
      }
    })();
  }, [userId, state.isActive, state.isStarting, reconfigureForTier, startWatcherForTier]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (!state.isActive) return;
      const flag =
        next === 'active' ? 'foreground' : next === 'background' ? 'background' : next;
      SecureStore.setItemAsync(BG_KEYS.appState, flag).catch(() => {});
    });
    return () => sub.remove();
  }, [state.isActive]);

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
