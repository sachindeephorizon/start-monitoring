import { getApiSession } from '@/session/session';
import { TrackMeRealtimeData } from '@/api/schedule-checking';
import { SocketConnectionState } from './socket.enums';
import { chatSocketService } from './socket.service';
import { NotificationEnvelope } from './socket.types';

type TrackMeListener = (payload: TrackMeRealtimeData) => void;

const TRACK_ME_EVENT = 'track_me';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object';
};

const getEventName = (envelope: NotificationEnvelope): string | null => {
  if (typeof envelope?.event === 'string' && envelope.event !== 'notification') {
    return envelope.event;
  }

  if (isObject(envelope?.data) && typeof envelope.data.event === 'string') {
    return envelope.data.event;
  }

  return null;
};

const getEventData = (envelope: NotificationEnvelope): Record<string, unknown> | null => {
  if (!isObject(envelope?.data)) return null;

  if (isObject(envelope.data.data)) {
    return envelope.data.data;
  }

  return envelope.data;
};

const toTrackMePayload = (raw: Record<string, unknown>): TrackMeRealtimeData | null => {
  const status = typeof raw.status === 'string' ? raw.status.toUpperCase() : null;
  const isLive = typeof raw.isLive === 'boolean' ? raw.isLive : null;

  if (!status || isLive === null) {
    return null;
  }

  return {
    scheduleCheckinId:
      typeof raw.scheduleCheckinId === 'string' ? raw.scheduleCheckinId :
      raw.scheduleCheckinId === null ? null :
      undefined,
    locationTrackingId:
      typeof raw.locationTrackingId === 'string' ? raw.locationTrackingId :
      raw.locationTrackingId === null ? null :
      undefined,
    status: status as TrackMeRealtimeData['status'],
    isLive,
    intervalMinutes: typeof raw.intervalMinutes === 'number' ? raw.intervalMinutes : undefined,
    startAt: typeof raw.startAt === 'string' ? raw.startAt : undefined,
    endAt:
      typeof raw.endAt === 'string' ? raw.endAt :
      raw.endAt === null ? null :
      undefined,
    nextRunAt:
      typeof raw.nextRunAt === 'string' ? raw.nextRunAt :
      raw.nextRunAt === null ? null :
      undefined,
    counts: isObject(raw.counts)
      ? {
          success: typeof raw.counts.success === 'number' ? raw.counts.success : 0,
          failed: typeof raw.counts.failed === 'number' ? raw.counts.failed : 0,
          pending: typeof raw.counts.pending === 'number' ? raw.counts.pending : 0,
          missed: typeof raw.counts.missed === 'number' ? raw.counts.missed : 0,
        }
      : undefined,
    source: typeof raw.source === 'string' ? raw.source : undefined,
  };
};

class TrackMeSocketService {
  private listeners = new Set<TrackMeListener>();
  private initialized = false;

  private readonly notificationHandler = (envelope: NotificationEnvelope) => {
    const eventName = getEventName(envelope)?.trim().toLowerCase();
    if (eventName !== TRACK_ME_EVENT) {
      return;
    }

    const data = getEventData(envelope);
    if (!data) {
      return;
    }

    const payload = toTrackMePayload(data);
    if (!payload) {
      return;
    }

    this.listeners.forEach((listener) => listener(payload));
  };

  private readonly connectionHandler = (state: SocketConnectionState) => {
    if (state === SocketConnectionState.CONNECTED) {
      return;
    }
  };

  async start(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const socketBaseUrl = (
      process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
      process.env.EXPO_PUBLIC_BACKEND_URL ||
      ''
    ).replace(/\/$/, '');

    if (!socketBaseUrl) {
      return;
    }

    const { token } = await getApiSession();
    if (!token) {
      return;
    }

    chatSocketService.connect(socketBaseUrl, token);
    chatSocketService.onNotification(this.notificationHandler);
    chatSocketService.onConnectionStateChange(this.connectionHandler);
    this.initialized = true;
  }

  stop(): void {
    if (!this.initialized) {
      return;
    }

    chatSocketService.offNotification(this.notificationHandler);
    chatSocketService.offConnectionStateChange(this.connectionHandler);
    this.initialized = false;
  }

  onTrackMeUpdate(listener: TrackMeListener): void {
    this.listeners.add(listener);
  }

  offTrackMeUpdate(listener: TrackMeListener): void {
    this.listeners.delete(listener);
  }
}

export const trackMeSocketService = new TrackMeSocketService();
