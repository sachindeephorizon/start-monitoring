import { useEffect, useRef } from 'react';
import { getApiSession } from '@/session/session';
import { chatSocketService, NotificationEnvelope } from '@/realtime/core';
import { useAuth } from '@/core/auth';
import { navigationRef } from '@/navigation/navigationRef';
import { createInAppAlert, showAlert } from './inAppAlert.store';

const DEDUPE_WINDOW_MS = 15_000;

type ActiveRouteInfo = {
  name: string | null;
  params?: Record<string, any>;
};

function isObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object';
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractEventAndData(envelope: NotificationEnvelope): { event: string | null; data: Record<string, any> } {
  if (!envelope) {
    return { event: null, data: {} };
  }

  if (typeof envelope.event === 'string' && envelope.event !== 'notification') {
    return {
      event: envelope.event,
      data: isObject(envelope.data) ? envelope.data : {},
    };
  }

  if (isObject(envelope.data) && typeof envelope.data.event === 'string') {
    return {
      event: envelope.data.event,
      data: isObject(envelope.data.data) ? envelope.data.data : envelope.data,
    };
  }

  return {
    event: typeof envelope.event === 'string' ? envelope.event : null,
    data: isObject(envelope.data) ? envelope.data : {},
  };
}

function getDeepestActiveRoute(): ActiveRouteInfo {
  const rootState = (navigationRef as any).getRootState?.();
  if (!rootState || !Array.isArray(rootState.routes)) {
    return { name: null };
  }

  let state: any = rootState;
  let route: any = state.routes[state.index ?? 0];

  while (route?.state && Array.isArray(route.state.routes)) {
    state = route.state;
    route = state.routes[state.index ?? 0];
  }

  return {
    name: typeof route?.name === 'string' ? route.name : null,
    params: isObject(route?.params) ? route.params : undefined,
  };
}

export default function InAppAlertBridge() {
  const { isAuthReady, user } = useAuth();
  const recentEventMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isAuthReady) return;

    const socketBaseUrl = (
      process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      ''
    ).replace(/\/$/, '');

    if (!socketBaseUrl) {
      console.warn('[InAppAlertBridge] Missing socket URL.');
      return;
    }

    const rememberEvent = (eventId: string): boolean => {
      const now = Date.now();
      const map = recentEventMapRef.current;

      for (const [key, ts] of map.entries()) {
        if (now - ts > DEDUPE_WINDOW_MS) {
          map.delete(key);
        }
      }

      if (map.has(eventId)) {
        return false;
      }

      map.set(eventId, now);
      return true;
    };

    const ensureSocketConnection = async () => {
      try {
        const { token } = await getApiSession();
        if (!token) return;
        chatSocketService.connect(socketBaseUrl, token);
      } catch (error) {
        console.warn('[InAppAlertBridge] Failed to connect socket:', error);
      }
    };

    void ensureSocketConnection();

    const handler = (envelope: NotificationEnvelope) => {
      const { event, data } = extractEventAndData(envelope);
      if (!event) return;

      if (event === 'chat.message.created') {
        const threadId = asString(data.threadId);
        const senderId = asString(data.senderId);
        const messageId = asString(data.messageId);
        const createdAt = asString(data.createdAt);
        const eventId = messageId || `${threadId || 'unknown'}:${createdAt || 'now'}`;

        if (!rememberEvent(`chat:${eventId}`)) {
          return;
        }

        if (senderId && user?.id && senderId === user.id) {
          return;
        }

        const route = getDeepestActiveRoute();

        if (route.name === 'Chat') {
          const currentThreadId = asString(route.params?.threadId) || asString(route.params?.chatRequestId);
          if (threadId && currentThreadId === threadId) {
            return;
          }
          return;
        }

        if (route.name !== 'Home') {
          return;
        }

        showAlert(
          createInAppAlert({
            id: `chat:${eventId}`,
            kind: 'chat',
            title: asString(data.senderName) || 'New message',
            body: asString(data.content) || 'You have a new message',
            threadId: threadId || undefined,
            autoDismissMs: 4000,
          }),
        );

        return;
      }

      if (event === 'call.incoming') {
        const callId = asString(data.callId) || asString(data.call_id) || asString(data.entity_id);
        const eventId = asString(data.eventId) || asString(data.id) || callId;
        if (!eventId || !rememberEvent(`call:${eventId}`)) {
          return;
        }

        const route = getDeepestActiveRoute();
        if (route.name !== 'Home') {
          return;
        }

        showAlert(
          createInAppAlert({
            id: `call:${eventId}`,
            kind: 'call',
            title: asString(data.title) || 'Incoming call',
            body: asString(data.body) || 'A security agent is calling you',
            callId: callId || undefined,
            autoDismissMs: 5000,
          }),
        );
      }
    };

    chatSocketService.onNotification(handler);

    return () => {
      chatSocketService.offNotification(handler);
    };
  }, [isAuthReady, user?.id]);

  return null;
}
