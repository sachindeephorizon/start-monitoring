import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/core/auth';
import {
  createTrackMeSession,
  endTrackMeSession,
  getActiveTrackMeSession,
  getTrackMeState,
  TrackMeActiveResponse,
  TrackMeHistoryItem,
  TrackMeLocationPayload,
  TrackMeRealtimeData,
  TrackMeStateResponse,
} from '@/api/schedule-checking';
import { trackMeSocketService } from '@/realtime/core';
import { trackMeLocationSyncService } from '@/services/trackMeLocationSync.service';

const TRACK_ME_STATE_REFRESH_SOURCES = new Set([
  'socket_connect_snapshot',
  'track_me_created',
  'next_run_scheduled',
  'checkin_completed',
  'checkin_failed',
  'checkin_missed',
  'track_me_ended',
  'track_me_escalated',
  'track_me_cancelled',
]);

interface TrackingSessionState {
  id: string;
  checkin_interval_minutes: number;
  start_time: string;
  end_time: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ESCALATED';
  location_tracker_id?: string | null;
  next_run_at?: string | null;
  last_run_at?: string | null;
}

interface TrackingCheckin {
  id: string;
  scheduled_time: string;
  status: 'pending' | 'success' | 'failed' | 'missed';
}

interface TrackingStatsState {
  totalScheduled: number;
  totalCompleted: number;
  success: number;
  totalMissed: number;
  totalPending: number;
  totalFailed: number;
  wrongPin: number;
  timeout: number;
  remainingScheduled: number;
  expectedTotalUntilEnd?: number;
  pending: number;
  missed: number;
  failed: number;
}

const EMPTY_STATS: TrackingStatsState = {
  totalScheduled: 0,
  totalCompleted: 0,
  success: 0,
  totalMissed: 0,
  totalPending: 0,
  totalFailed: 0,
  wrongPin: 0,
  timeout: 0,
  remainingScheduled: 0,
  expectedTotalUntilEnd: undefined,
  pending: 0,
  missed: 0,
  failed: 0,
};

function computeNextCheckinAt(startTimeIso: string, intervalMinutes: number): number {
  const sessionStartMs = new Date(startTimeIso).getTime();
  const now = Date.now();
  const intervalMs = intervalMinutes * 60_000;

  if (!Number.isFinite(sessionStartMs) || intervalMs <= 0) {
    return now + 60_000;
  }

  if (now <= sessionStartMs) {
    return sessionStartMs;
  }

  const elapsed = now - sessionStartMs;
  const intervalsElapsed = Math.ceil(elapsed / intervalMs);
  return sessionStartMs + intervalsElapsed * intervalMs;
}

function toSessionState(active: TrackMeActiveResponse): TrackingSessionState {
  return {
    id: active.checkinId,
    checkin_interval_minutes: active.intervalMinutes ?? 15,
    start_time: active.startAt,
    end_time: active.endAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: active.status,
    location_tracker_id: active.trackerId,
    next_run_at: active.nextRunAt,
    last_run_at: active.lastRunAt,
  };
}

function mapHistoryStatus(status: TrackMeHistoryItem['status']): TrackingCheckin['status'] {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'MISSED':
      return 'missed';
    case 'TIMEOUT':
    case 'WRONG_PIN':
      return 'failed';
    case 'SCHEDULED':
    case 'CANCELED':
    default:
      return 'pending';
  }
}

function toHistory(history: TrackMeHistoryItem[]): TrackingCheckin[] {
  return history.map((item) => ({
    id: item.id,
    scheduled_time: item.scheduledAt,
    status: mapHistoryStatus(item.status),
  }));
}

export function useTrackingSession() {
  const { isAuthReady } = useAuth();
  const [session, setSession] = useState<TrackingSessionState | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentCheckin] = useState<TrackingCheckin | null>(null);
  const [nextCheckinAt, setNextCheckinAt] = useState<number | null>(null);
  const [trackingCountdown, setTrackingCountdown] = useState<string>('--:--');
  const [trackingStats, setTrackingStats] = useState<TrackingStatsState>(EMPTY_STATS);
  const [checkInHistory, setCheckInHistory] = useState<TrackingCheckin[]>([]);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkeyTimeLeft, setPasskeyTimeLeft] = useState(30);

  const mountedRef = useRef(true);
  const stateRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTrackingState = useCallback(async () => {
    await trackMeLocationSyncService.stop();
    if (!mountedRef.current) return;

    setSession(null);
    setIsTracking(false);
    setNextCheckinAt(null);
    setTrackingStats(EMPTY_STATS);
    setCheckInHistory([]);
    setShowPasskeyModal(false);
    setPasskeyTimeLeft(30);
  }, []);

  const applyStatePayload = useCallback((state: TrackMeStateResponse) => {
    const nextSession = toSessionState(state.session);
    setSession(nextSession);
    setIsTracking(state.session.isLive);
    setTrackingStats({
      totalScheduled: state.stats.totalScheduled,
      totalCompleted: state.stats.totalCompleted,
      success: state.stats.success,
      totalMissed: state.stats.totalMissed,
      totalPending: state.stats.totalPending,
      totalFailed: state.stats.totalFailed,
      wrongPin: state.stats.wrongPin,
      timeout: state.stats.timeout,
      remainingScheduled: state.stats.remainingScheduled,
      expectedTotalUntilEnd: state.stats.expectedTotalUntilEnd,
      pending: state.stats.totalPending,
      missed: state.stats.totalMissed,
      failed: state.stats.totalFailed,
    });
    setCheckInHistory(toHistory(state.history));

    if (state.session.nextRunAt) {
      setNextCheckinAt(new Date(state.session.nextRunAt).getTime());
    } else {
      setNextCheckinAt(computeNextCheckinAt(nextSession.start_time, nextSession.checkin_interval_minutes));
    }
  }, []);

  const refreshTrackMeState = useCallback(async (checkinId: string, historyLimit = 20) => {
    try {
      const state = await getTrackMeState(checkinId, historyLimit);
      if (!mountedRef.current) return;
      applyStatePayload(state);
    } catch (error) {
      console.warn('[useTrackingSession] Failed to load Track Me state:', error);
    }
  }, [applyStatePayload]);

  const scheduleStateRefresh = useCallback((checkinId: string, delayMs = 600) => {
    if (stateRefreshTimerRef.current) {
      clearTimeout(stateRefreshTimerRef.current);
      stateRefreshTimerRef.current = null;
    }

    stateRefreshTimerRef.current = setTimeout(() => {
      void refreshTrackMeState(checkinId, 50);
      stateRefreshTimerRef.current = null;
    }, Math.max(0, delayMs));
  }, [refreshTrackMeState]);

  const hydrateActiveSession = useCallback(async () => {
    try {
      const active = await getActiveTrackMeSession();
      if (!mountedRef.current) return;

      if (!active || !active.isLive) {
        await clearTrackingState();
        return;
      }

      const nextSession = toSessionState(active);
      setSession(nextSession);
      setIsTracking(true);

      if (active.nextRunAt) {
        setNextCheckinAt(new Date(active.nextRunAt).getTime());
      } else {
        setNextCheckinAt(computeNextCheckinAt(nextSession.start_time, nextSession.checkin_interval_minutes));
      }

      if (active.trackerId) {
        await trackMeLocationSyncService.start(active.trackerId);
      }

      void refreshTrackMeState(active.checkinId);
    } catch (error) {
      console.warn('[useTrackingSession] Failed to load active Track Me session:', error);
    }
  }, [clearTrackingState, refreshTrackMeState]);

  const applyTrackMeRealtime = useCallback(async (payload: TrackMeRealtimeData) => {
    if (!payload.isLive || !payload.locationTrackingId || !payload.scheduleCheckinId) {
      await clearTrackingState();
      return;
    }

    const checkinId = payload.scheduleCheckinId;
    const trackerId = payload.locationTrackingId;

    setIsTracking(true);
    setSession((prev) => {
      const interval = payload.intervalMinutes ?? prev?.checkin_interval_minutes ?? 15;
      const startTime = payload.startAt ?? prev?.start_time ?? new Date().toISOString();
      const endTime = payload.endAt ?? prev?.end_time ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      return {
        id: checkinId,
        checkin_interval_minutes: interval,
        start_time: startTime,
        end_time: endTime,
        status: payload.status,
        location_tracker_id: trackerId,
        next_run_at: payload.nextRunAt,
        last_run_at: prev?.last_run_at,
      };
    });

    if (payload.nextRunAt) {
      setNextCheckinAt(new Date(payload.nextRunAt).getTime());
    } else if (payload.startAt) {
      setNextCheckinAt(computeNextCheckinAt(payload.startAt, payload.intervalMinutes ?? 15));
    }

    if (payload.counts) {
      const computedTotal = payload.counts.success + payload.counts.failed + payload.counts.pending + payload.counts.missed;
      setTrackingStats({
        totalScheduled: computedTotal,
        totalCompleted: payload.counts.success,
        success: payload.counts.success,
        totalMissed: payload.counts.missed,
        totalPending: payload.counts.pending,
        totalFailed: payload.counts.failed,
        wrongPin: 0,
        timeout: 0,
        remainingScheduled: payload.counts.pending,
        expectedTotalUntilEnd: undefined,
        pending: payload.counts.pending,
        missed: payload.counts.missed,
        failed: payload.counts.failed,
      });
    }

    await trackMeLocationSyncService.start(trackerId);

    const source = (payload.source ?? '').trim();
    const shouldRefreshState = !payload.counts || TRACK_ME_STATE_REFRESH_SOURCES.has(source);
    if (shouldRefreshState) {
      scheduleStateRefresh(checkinId, source === 'socket_connect_snapshot' ? 0 : 600);
    }
  }, [clearTrackingState, scheduleStateRefresh]);

  useEffect(() => {
    if (!isAuthReady) return;

    mountedRef.current = true;

    const bootstrap = async () => {
      try {
        await trackMeSocketService.start();
        await hydrateActiveSession();
      } catch (error) {
        console.warn('[useTrackingSession] Failed to initialize Track Me socket service:', error);
      }
    };

    const realtimeHandler = (payload: TrackMeRealtimeData) => {
      void applyTrackMeRealtime(payload);
    };

    void bootstrap();
    trackMeSocketService.onTrackMeUpdate(realtimeHandler);

    return () => {
      mountedRef.current = false;
      if (stateRefreshTimerRef.current) {
        clearTimeout(stateRefreshTimerRef.current);
        stateRefreshTimerRef.current = null;
      }
      trackMeSocketService.offTrackMeUpdate(realtimeHandler);
      void trackMeLocationSyncService.stop();
    };
  }, [isAuthReady, hydrateActiveSession, applyTrackMeRealtime]);

  useEffect(() => {
    if (!nextCheckinAt || !session) {
      setTrackingCountdown('--:--');
      return;
    }

    const timer = setInterval(() => {
      if (!mountedRef.current) return;

      const diff = nextCheckinAt - Date.now();
      if (diff <= 0) {
        setTrackingCountdown('00:00');
        return;
      }

      const minutes = Math.floor(diff / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      setTrackingCountdown(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [nextCheckinAt, session]);

  useEffect(() => {
    if (!session?.id) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshTrackMeState(session.id);
    });

    return () => subscription.remove();
  }, [session?.id, refreshTrackMeState]);

  const createSession = useCallback(async (
    startTime: Date,
    endTime: Date,
    interval: number,
    initialLocation?: TrackMeLocationPayload,
  ): Promise<boolean> => {
    if (!initialLocation) {
      return false;
    }

    try {
      setLoading(true);

      const result = await createTrackMeSession({
        startAt: startTime.toISOString(),
        endAt: endTime.toISOString(),
        interval,
        location: initialLocation,
      });

      const nextSession: TrackingSessionState = {
        id: result.checkin.id,
        checkin_interval_minutes: result.checkin.intervalMinutes ?? interval,
        start_time: result.checkin.startAt,
        end_time: result.checkin.endAt ?? endTime.toISOString(),
        status: result.checkin.status,
        location_tracker_id: result.trackerId,
        next_run_at: result.checkin.nextRunAt,
        last_run_at: result.checkin.lastRunAt,
      };

      setSession(nextSession);
      setIsTracking(true);
      if (result.checkin.nextRunAt) {
        setNextCheckinAt(new Date(result.checkin.nextRunAt).getTime());
      } else {
        setNextCheckinAt(computeNextCheckinAt(nextSession.start_time, nextSession.checkin_interval_minutes));
      }

      await trackMeLocationSyncService.start(result.trackerId);
      void refreshTrackMeState(result.checkin.id, 50);

      return true;
    } catch (error) {
      console.error('[useTrackingSession] Error creating Track Me session:', error);
      return false;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [refreshTrackMeState]);

  const completeTrackingSession = useCallback(async (
    options?: { passcode?: string; isSafe?: boolean },
  ): Promise<boolean> => {
    if (!session) return false;

    const passcode = options?.passcode?.trim();
    if (!passcode) return false;

    try {
      setLoading(true);

      await endTrackMeSession(session.id, {
        isSafe: options?.isSafe ?? true,
        passcode,
      });

      await clearTrackingState();
      return true;
    } catch (error) {
      console.error('[useTrackingSession] Error ending Track Me session:', error);
      return false;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [session, clearTrackingState]);

  const onPasskeySuccess = useCallback(async () => {
    setShowPasskeyModal(false);
    setPasskeyTimeLeft(30);
  }, []);

  const onPasskeyFailure = useCallback(async () => {
    setShowPasskeyModal(false);
    setPasskeyTimeLeft(30);
  }, []);

  const nextTrackingCheckIn = useMemo(() => {
    if (!nextCheckinAt) return null;
    return new Date(nextCheckinAt);
  }, [nextCheckinAt]);

  return {
    session,
    isTracking,
    loading,
    currentCheckin,
    nextCheckinAt,
    nextTrackingCheckIn,
    trackingCountdown,
    trackingStats,
    checkInHistory,
    showPasskeyModal,
    passkeyTimeLeft,

    createSession,
    completeTrackingSession,
    onPasskeySuccess,
    onPasskeyFailure,
    setShowPasskeyModal,
  };
}
