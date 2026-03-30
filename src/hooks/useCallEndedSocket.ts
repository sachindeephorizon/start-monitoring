import { useEffect, useRef } from 'react';
import { getApiSession } from '@/session/session';
import { chatSocketService, NotificationEnvelope } from '@/realtime/core';

type CallEndedPayload = {
  sessionId?: string | null;
  reason?: string | null;
};

type NormalizedCallEndedEnvelope = {
  isCallEnded: boolean;
  payload: CallEndedPayload;
};

const isMatchingSession = (
  sessionIds: string[],
  payload: CallEndedPayload,
): boolean => {
  const incoming = String(payload.sessionId || '').trim();
  if (!incoming) {
    return false;
  }

  return sessionIds.includes(incoming);
};

const normalizeCallEndedEnvelope = (
  envelope: NotificationEnvelope,
): NormalizedCallEndedEnvelope => {
  // Shape A: { event: 'call.ended', data: { sessionId, reason } }
  if (envelope?.event === 'call.ended') {
    return {
      isCallEnded: true,
      payload: (envelope.data ?? {}) as CallEndedPayload,
    };
  }

  // Shape B: { event: 'notification', data: { event: 'call.ended', data: { sessionId, reason } } }
  const nested = envelope?.data as Record<string, unknown> | undefined;
  if (
    nested &&
    typeof nested === 'object' &&
    nested.event === 'call.ended'
  ) {
    return {
      isCallEnded: true,
      payload: (nested.data ?? {}) as CallEndedPayload,
    };
  }

  return {
    isCallEnded: false,
    payload: {},
  };
};

/**
 * Listens for backend call.ended realtime notifications and triggers callback
 * when the ended session matches one of the active call session IDs.
 */
export function useCallEndedSocket(
  sessionIds: Array<string | null | undefined>,
  onEnded: (reason?: string | null) => void,
  options?: {
    closeOnAnyCallEnded?: boolean;
    debugLabel?: string;
  },
): void {
  const handledRef = useRef(false);
  const onEndedRef = useRef(onEnded);
  const sessionKey = sessionIds
    .map((id) => id?.trim())
    .filter((id): id is string => !!id)
    .join('|');
  const closeOnAnyCallEnded = options?.closeOnAnyCallEnded === true;
  const debugLabel = options?.debugLabel || 'useCallEndedSocket';

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    handledRef.current = false;

    const normalizedSessionIds = sessionKey ? sessionKey.split('|') : [];

    console.log(`[${debugLabel}] subscribe`, {
      sessionIds: normalizedSessionIds,
      closeOnAnyCallEnded,
    });

    if (normalizedSessionIds.length === 0) {
      console.log(`[${debugLabel}] skip subscribe because no active session IDs`);
      return;
    }

    const socketBaseUrl = (
      process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      ''
    ).replace(/\/$/, '');

    if (!socketBaseUrl) {
      console.warn('[useCallEndedSocket] Missing socket URL.');
      return;
    }

    const ensureSocketConnection = async () => {
      try {
        const { token } = await getApiSession();
        if (!token) {
          console.warn(`[${debugLabel}] no auth token found for socket connection`);
          return;
        }
        console.log(`[${debugLabel}] ensuring socket connection`, {
          socketBaseUrl,
          tokenPresent: !!token,
        });
        chatSocketService.connect(socketBaseUrl, token);
      } catch (error) {
        console.warn(`[${debugLabel}] failed to ensure socket connection:`, error);
      }
    };

    void ensureSocketConnection();

    const notificationHandler = (envelope: NotificationEnvelope) => {
      if (handledRef.current) {
        return;
      }

      const { isCallEnded, payload } = normalizeCallEndedEnvelope(envelope);

      console.log(`[${debugLabel}] notification received`, {
        envelopeEvent: envelope?.event,
        normalizedIsCallEnded: isCallEnded,
        envelopeData: envelope?.data,
      });

      if (!isCallEnded) {
        return;
      }

      const matched = isMatchingSession(normalizedSessionIds, payload);
      if (!matched && !closeOnAnyCallEnded) {
        console.log(`[${debugLabel}] call.ended ignored due to session mismatch`, {
          incomingSessionId: payload.sessionId,
          expectedSessionIds: normalizedSessionIds,
          reason: payload.reason,
        });
        return;
      }

      if (!matched && closeOnAnyCallEnded) {
        console.log(`[${debugLabel}] call.ended accepted via closeOnAnyCallEnded fallback`, {
          incomingSessionId: payload.sessionId,
          expectedSessionIds: normalizedSessionIds,
          reason: payload.reason,
        });
      }

      handledRef.current = true;
      console.log(`[${debugLabel}] triggering onEnded callback`, {
        incomingSessionId: payload.sessionId,
        reason: payload.reason,
      });
      onEndedRef.current(payload.reason ?? null);
    };

    chatSocketService.onNotification(notificationHandler);

    return () => {
      console.log(`[${debugLabel}] unsubscribe`);
      chatSocketService.offNotification(notificationHandler);
    };
  }, [closeOnAnyCallEnded, debugLabel, sessionKey]);
}
