/**
 * Assigned Check-Ins Hook (Family/Group Head)
 *
 * Loads and subscribes to schedule check-ins that the current user
 * has assigned to other group members via POST /schedule-checkin/assign.
 *
 * Mirrors the socket pattern used by useCheckIn — both the target user
 * AND the creator (assigner) receive the "schedule_checkin" event, so
 * we refetch on any such event.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Alert } from 'react-native';
import { useAuth } from '@/core/auth';
import { getApiSession } from '@/session/session';
import {
  chatSocketService,
  NotificationEnvelope,
  SocketConnectionState,
} from '@/realtime/core';
import {
  assignScheduleCheckIn,
  cancelScheduleCheckIn,
  getAssignedScheduleCheckIns,
  type AssignedCheckinItem,
  type AssignScheduleCheckInPayload,
} from '@/api/schedule-checking';

const CHECKIN_SOCKET_EVENT_NAME = 'schedule_checkin';

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

const getSocketEventName = (envelope: NotificationEnvelope): string | null => {
  if (typeof envelope?.event === 'string' && envelope.event !== 'notification') {
    return envelope.event;
  }
  if (isObject(envelope?.data) && typeof envelope.data.event === 'string') {
    return envelope.data.event;
  }
  return null;
};

const isCheckInSocketEvent = (envelope: NotificationEnvelope): boolean => {
  const eventName = getSocketEventName(envelope)?.trim().toLowerCase();
  return eventName === CHECKIN_SOCKET_EVENT_NAME;
};

export interface UseAssignedCheckInsReturn {
  assignedCheckIns: AssignedCheckinItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  isAssigning: boolean;
  assign: (payload: AssignScheduleCheckInPayload) => Promise<AssignedCheckinItem | null>;
  cancel: (checkinId: string) => Promise<boolean>;
  recentWindowHours: number;
  setRecentWindowHours: (hours: number) => void;
}

export interface UseAssignedCheckInsOptions {
  recentWindowHours?: number;
}

export function useAssignedCheckIns(
  options: UseAssignedCheckInsOptions = {},
): UseAssignedCheckInsReturn {
  const { isAuthReady } = useAuth();

  const [assignedCheckIns, setAssignedCheckIns] = useState<AssignedCheckinItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentWindowHours, setRecentWindowHours] = useState<number>(
    options.recentWindowHours ?? 24,
  );

  const mountedRef = useRef(true);
  const inflightRef = useRef(false);
  const recentWindowHoursRef = useRef(recentWindowHours);
  recentWindowHoursRef.current = recentWindowHours;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setIsLoading(true);
    try {
      const items = await getAssignedScheduleCheckIns({
        includeRecent: true,
        recentWindowHours: recentWindowHoursRef.current,
      });
      if (!mountedRef.current) return;
      setAssignedCheckIns(Array.isArray(items) ? items : []);
      setError(null);
    } catch (err: any) {
      console.error('[useAssignedCheckIns] Failed to load assigned check-ins:', err);
      if (!mountedRef.current) return;
      setError(err?.message || 'Failed to load assigned check-ins');
    } finally {
      inflightRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // Initial load + refetch when the window changes
  useEffect(() => {
    if (!isAuthReady) return;
    void refresh();
  }, [isAuthReady, refresh, recentWindowHours]);

  // Socket listener — same pattern as useCheckIn
  useEffect(() => {
    if (!isAuthReady) return;

    const socketBaseUrl = (
      process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      ''
    ).replace(/\/$/, '');

    if (!socketBaseUrl) return;

    const ensureSocketConnection = async () => {
      try {
        const { token } = await getApiSession();
        if (!token) return;
        chatSocketService.connect(socketBaseUrl, token);
      } catch (err) {
        console.warn('[useAssignedCheckIns] Failed to ensure socket connection:', err);
      }
    };

    void ensureSocketConnection();

    const notificationHandler = (envelope: NotificationEnvelope) => {
      if (!mountedRef.current || AppState.currentState !== 'active') return;
      if (!isCheckInSocketEvent(envelope)) return;
      void refresh();
    };

    const connectionStateHandler = (state: SocketConnectionState) => {
      if (!mountedRef.current) return;
      if (state !== SocketConnectionState.CONNECTED) return;
      void refresh();
    };

    chatSocketService.onNotification(notificationHandler);
    chatSocketService.onConnectionStateChange(connectionStateHandler);

    return () => {
      chatSocketService.offNotification(notificationHandler);
      chatSocketService.offConnectionStateChange(connectionStateHandler);
    };
  }, [isAuthReady, refresh]);

  const assign = useCallback(async (payload: AssignScheduleCheckInPayload) => {
    if (isAssigning) return null;
    setIsAssigning(true);
    try {
      const created = await assignScheduleCheckIn(payload);
      await refresh();
      return created as unknown as AssignedCheckinItem;
    } catch (err: any) {
      const responseData = err?.response?.data;
      const message =
        responseData?.message ||
        responseData?.error ||
        err?.message ||
        'Failed to assign check-in';
      Alert.alert('Assignment Failed', message);
      return null;
    } finally {
      if (mountedRef.current) setIsAssigning(false);
    }
  }, [isAssigning, refresh]);

  const cancel = useCallback(async (checkinId: string) => {
    try {
      const cancelled = await cancelScheduleCheckIn(checkinId);
      const success = cancelled?.status === 'CANCELLED';
      if (success) {
        await refresh();
        return true;
      }
      Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
      return false;
    } catch (err: any) {
      console.error('[useAssignedCheckIns] Cancel failed:', err);
      const responseData = err?.response?.data;
      const message =
        responseData?.message ||
        responseData?.error ||
        err?.message ||
        'Failed to cancel check-in';
      Alert.alert('Error', message);
      return false;
    }
  }, [refresh]);

  return {
    assignedCheckIns,
    isLoading,
    error,
    refresh,
    isAssigning,
    assign,
    cancel,
    recentWindowHours,
    setRecentWindowHours,
  };
}
