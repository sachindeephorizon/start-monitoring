import { AppState, AppStateStatus } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import { ensureValidSession } from '@/lib/supabase';
import {
  chatSocketService,
  SocketConnectionState,
} from '@/realtime/core';

export type LocationTrackerType =
  | 'VIDEO_CALL'
  | 'AUDIO_CALL'
  | 'TRACK_ME'
  | 'SCHEDULE_CHECKIN'
  | 'EMERGENCY';

export type LocationTrackerStopStatus =
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ESCALATED';

export enum LocationTrackerSocketEvent {
  START = 'location.tracker.start',
  POINT = 'location.tracker.point',
  STOP = 'location.tracker.stop',
}

export interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StartTrackerAckData {
  trackerId: string;
}

export interface StopTrackerAckData {
  status?: string;
}

export interface StartLocationTrackerInput {
  type: LocationTrackerType;
  startedAt?: string;
}

export interface StopLocationTrackerInput {
  status?: LocationTrackerStopStatus;
  endedAt?: string;
}

export interface LocationTrackerPointPayload {
  trackerId: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt?: string;
}

interface QueuedLocationPoint {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt: string;
}

interface TrackingSamplingProfile {
  timeInterval: number;
  minEmitIntervalMs: number;
  accuracy: Location.LocationAccuracy;
}

export interface StartLocationTrackerResult {
  ok: boolean;
  trackerId: string | null;
  reason?: string;
}

const DEFAULT_ACK_TIMEOUT_MS = 8_000;
const MAX_BUFFERED_POINTS = 50;

const SAMPLING_BY_TYPE: Record<LocationTrackerType, TrackingSamplingProfile> = {
  EMERGENCY: {
    timeInterval: 1_000,
    minEmitIntervalMs: 1_000,
    accuracy: Location.Accuracy.BestForNavigation,
  },
  VIDEO_CALL: {
    timeInterval: 2_000,
    minEmitIntervalMs: 1_500,
    accuracy: Location.Accuracy.High,
  },
  AUDIO_CALL: {
    timeInterval: 3_000,
    minEmitIntervalMs: 2_000,
    accuracy: Location.Accuracy.Balanced,
  },
  TRACK_ME: {
    timeInterval: 5_000,
    minEmitIntervalMs: 3_000,
    accuracy: Location.Accuracy.Balanced,
  },
  SCHEDULE_CHECKIN: {
    timeInterval: 8_000,
    minEmitIntervalMs: 5_000,
    accuracy: Location.Accuracy.Balanced,
  },
};

function resolveSocketBaseUrl(): string | null {
  return (
    process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    null
  );
}

function normalizeNumber(value: number | null): number | undefined {
  // iOS returns -1 for speed/heading/altitude when the value is unavailable.
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return value;
}

function isLocationPermissionPrecise(
  permission: Location.LocationPermissionResponse,
): boolean {
  const maybeAccuracy = (
    permission as Location.LocationPermissionResponse & {
      ios?: { accuracy?: 'full' | 'reduced' | string };
    }
  ).ios?.accuracy;

  if (!maybeAccuracy) {
    return true;
  }

  return maybeAccuracy === 'full';
}

class LocationTrackingSocketService {
  private isActive = false;
  private trackerType: LocationTrackerType | null = null;
  private trackerId: string | null = null;
  private startedAt: string | undefined;
  private pointBuffer: QueuedLocationPoint[] = [];
  private lastEmitAt = 0;
  private locationWatch: Location.LocationSubscription | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private flushInProgress = false;
  private startInProgress = false;

  getState(): { isActive: boolean; trackerId: string | null; type: LocationTrackerType | null } {
    return {
      isActive: this.isActive,
      trackerId: this.trackerId,
      type: this.trackerType,
    };
  }

  async startTracking(input: StartLocationTrackerInput): Promise<StartLocationTrackerResult> {
    if (this.startInProgress) {
      return {
        ok: false,
        trackerId: this.trackerId,
        reason: 'Tracker start already in progress',
      };
    }

    this.startInProgress = true;

    try {
      if (this.isActive && this.trackerId && this.trackerType === input.type) {
        return {
          ok: true,
          trackerId: this.trackerId,
        };
      }

      const permissionGranted = await this.ensureLocationPermission();
      if (!permissionGranted) {
        return {
          ok: false,
          trackerId: null,
          reason: 'Location permission denied',
        };
      }

      const connected = await this.ensureSocketConnected();
      if (!connected) {
        return {
          ok: false,
          trackerId: null,
          reason: 'Socket connection unavailable',
        };
      }

      const startedAt = input.startedAt || new Date().toISOString();
      const startAck = await chatSocketService.emitWithAck<
        StartLocationTrackerInput,
        SocketAck<StartTrackerAckData>
      >(
        LocationTrackerSocketEvent.START,
        {
          type: input.type,
          startedAt,
        },
        DEFAULT_ACK_TIMEOUT_MS,
      );

      if (!startAck?.ok || !startAck.data?.trackerId) {
        return {
          ok: false,
          trackerId: null,
          reason: startAck?.error || startAck?.message || 'Tracker start rejected',
        };
      }

      this.isActive = true;
      this.trackerType = input.type;
      this.trackerId = startAck.data.trackerId;
      this.startedAt = startedAt;
      this.lastEmitAt = 0;

      this.attachLifecycleGuards();
      await this.startLocationWatch(input.type);

      // Emit an immediate first point so the backend receives location data
      // without waiting for the watcher's first timeInterval to elapse.
      void this.emitImmediatePoint();

      return {
        ok: true,
        trackerId: this.trackerId,
      };
    } catch (error) {
      return {
        ok: false,
        trackerId: null,
        reason: error instanceof Error ? error.message : 'Failed to start tracker',
      };
    } finally {
      this.startInProgress = false;
    }
  }

  async stopTracking(input: StopLocationTrackerInput = {}): Promise<SocketAck<StopTrackerAckData>> {
    this.isActive = false;

    await this.stopLocationWatch();
    this.detachLifecycleGuards();

    if (!this.trackerId) {
      this.resetTrackingState();
      return { ok: true, data: { status: 'COMPLETED' } };
    }

    const trackerIdToStop = this.trackerId;

    try {
      const connected = await this.ensureSocketConnected();
      if (!connected) {
        return {
          ok: false,
          error: 'Socket connection unavailable',
        };
      }

      const stopAck = await chatSocketService.emitWithAck<
        { trackerId: string; status?: LocationTrackerStopStatus; endedAt: string },
        SocketAck<StopTrackerAckData>
      >(
        LocationTrackerSocketEvent.STOP,
        {
          trackerId: trackerIdToStop,
          status: input.status,
          endedAt: input.endedAt || new Date().toISOString(),
        },
        DEFAULT_ACK_TIMEOUT_MS,
      );

      if (stopAck?.ok) {
        this.resetTrackingState();
      }

      return stopAck;
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to stop tracker',
      };
    }
  }

  private async ensureSocketConnected(): Promise<boolean> {
    const baseUrl = resolveSocketBaseUrl();
    if (!baseUrl) {
      return false;
    }

    const session = await ensureValidSession();
    const token = session?.access_token;
    if (!token) {
      return false;
    }

    chatSocketService.connect(baseUrl, token);
    return true;
  }

  private async ensureLocationPermission(): Promise<boolean> {
    const currentPermission = await Location.getForegroundPermissionsAsync();

    if (currentPermission.status === 'granted') {
      if (!isLocationPermissionPrecise(currentPermission) && __DEV__) {
        console.warn('[LocationTrackingSocketService] Reduced location accuracy enabled.');
      }
      return true;
    }

    if (currentPermission.status === 'denied') {
      return false;
    }

    const requestedPermission = await Location.requestForegroundPermissionsAsync();
    if (!requestedPermission.granted) {
      return false;
    }

    if (!isLocationPermissionPrecise(requestedPermission) && __DEV__) {
      console.warn('[LocationTrackingSocketService] Precise location is not enabled.');
    }

    return true;
  }

  private async startLocationWatch(type: LocationTrackerType): Promise<void> {
    await this.stopLocationWatch();

    const profile = SAMPLING_BY_TYPE[type];

    // distanceInterval is intentionally omitted: on Android, setting it > 0
    // requires BOTH the time AND distance thresholds to be met before the OS
    // fires an update, so a stationary user would never receive any points.
    // Rate control is handled by timeInterval + minEmitIntervalMs.
    this.locationWatch = await Location.watchPositionAsync(
      {
        accuracy: profile.accuracy,
        timeInterval: profile.timeInterval,
      },
      (location) => {
        void this.onLocationUpdate(location);
      },
    );
  }

  private async emitImmediatePoint(): Promise<void> {
    if (!this.isActive || !this.trackerId || !this.trackerType) {
      return;
    }

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: SAMPLING_BY_TYPE[this.trackerType].accuracy,
      });

      if (!this.isActive || !this.trackerId) {
        return;
      }

      const point: QueuedLocationPoint = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: normalizeNumber(location.coords.altitude),
        accuracy: normalizeNumber(location.coords.accuracy),
        speed: normalizeNumber(location.coords.speed),
        heading: normalizeNumber(location.coords.heading),
        capturedAt: new Date(location.timestamp || Date.now()).toISOString(),
      };

      this.lastEmitAt = Date.now();
      const emitted = await this.emitPoint(point, true);
      if (!emitted) {
        this.enqueuePoint(point);
      }
    } catch {
      // best-effort; the watcher will provide subsequent updates
    }
  }

  private async stopLocationWatch(): Promise<void> {
    if (!this.locationWatch) {
      return;
    }

    this.locationWatch.remove();
    this.locationWatch = null;
  }

  private async onLocationUpdate(location: Location.LocationObject): Promise<void> {
    if (!this.isActive || !this.trackerId || !this.trackerType) {
      return;
    }

    const { minEmitIntervalMs } = SAMPLING_BY_TYPE[this.trackerType];
    const now = Date.now();
    if (now - this.lastEmitAt < minEmitIntervalMs) {
      return;
    }

    this.lastEmitAt = now;

    const point: QueuedLocationPoint = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: normalizeNumber(location.coords.altitude),
      accuracy: normalizeNumber(location.coords.accuracy),
      speed: normalizeNumber(location.coords.speed),
      heading: normalizeNumber(location.coords.heading),
      capturedAt: new Date(location.timestamp || Date.now()).toISOString(),
    };

    const emitted = await this.emitPoint(point, true);
    if (!emitted) {
      this.enqueuePoint(point);
    }
  }

  private async emitPoint(
    point: QueuedLocationPoint,
    allowRestart: boolean,
  ): Promise<boolean> {
    if (!this.trackerId || !this.isActive) {
      return false;
    }

    if (!chatSocketService.isConnected()) {
      return false;
    }

    const payload: LocationTrackerPointPayload = {
      trackerId: this.trackerId,
      ...point,
    };

    try {
      const ack = await chatSocketService.emitWithAck<
        LocationTrackerPointPayload,
        SocketAck
      >(
        LocationTrackerSocketEvent.POINT,
        payload,
        DEFAULT_ACK_TIMEOUT_MS,
      );

      if (ack?.ok) {
        return true;
      }

      if (allowRestart && this.isTrackerInactiveAck(ack)) {
        const restarted = await this.restartTracker();
        if (restarted) {
          return this.emitPoint(point, false);
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private isTrackerInactiveAck(ack?: SocketAck): boolean {
    const reason = `${ack?.error || ''} ${ack?.message || ''}`.toLowerCase();
    return reason.includes('not active') || reason.includes('not found');
  }

  private async restartTracker(): Promise<boolean> {
    if (!this.trackerType) {
      return false;
    }

    const connected = await this.ensureSocketConnected();
    if (!connected) {
      return false;
    }

    try {
      const ack = await chatSocketService.emitWithAck<
        StartLocationTrackerInput,
        SocketAck<StartTrackerAckData>
      >(
        LocationTrackerSocketEvent.START,
        {
          type: this.trackerType,
          startedAt: this.startedAt || new Date().toISOString(),
        },
        DEFAULT_ACK_TIMEOUT_MS,
      );

      if (ack?.ok && ack.data?.trackerId) {
        this.trackerId = ack.data.trackerId;
        return true;
      }
    } catch {
      // no-op
    }

    return false;
  }

  private enqueuePoint(point: QueuedLocationPoint): void {
    this.pointBuffer.push(point);
    if (this.pointBuffer.length > MAX_BUFFERED_POINTS) {
      this.pointBuffer.splice(0, this.pointBuffer.length - MAX_BUFFERED_POINTS);
    }
  }

  private async flushBufferedPoints(): Promise<void> {
    if (this.flushInProgress) {
      return;
    }

    if (!this.isActive || !this.trackerId || !chatSocketService.isConnected()) {
      return;
    }

    this.flushInProgress = true;

    try {
      while (this.pointBuffer.length > 0 && this.isActive && this.trackerId) {
        const next = this.pointBuffer[0];
        const emitted = await this.emitPoint(next, true);
        if (!emitted) {
          break;
        }
        this.pointBuffer.shift();
      }
    } finally {
      this.flushInProgress = false;
    }
  }

  private attachLifecycleGuards(): void {
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextState: AppStateStatus) => {
          if (nextState === 'active' && this.isActive) {
            void this.ensureSocketConnected().then((connected) => {
              if (connected) {
                void this.flushBufferedPoints();
              }
            });
          }
        },
      );
    }

    if (!this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
        if (state.isConnected !== false && this.isActive) {
          void this.ensureSocketConnected().then((connected) => {
            if (connected) {
              void this.flushBufferedPoints();
            }
          });
        }
      });
    }

    chatSocketService.onConnectionStateChange(this.handleSocketConnectionChange);
  }

  private detachLifecycleGuards(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }

    chatSocketService.offConnectionStateChange(this.handleSocketConnectionChange);
  }

  private handleSocketConnectionChange = (state: SocketConnectionState): void => {
    if (state === SocketConnectionState.CONNECTED && this.isActive) {
      void this.flushBufferedPoints();
    }
  };

  private resetTrackingState(): void {
    this.trackerId = null;
    this.trackerType = null;
    this.startedAt = undefined;
    this.pointBuffer = [];
    this.lastEmitAt = 0;
  }
}

export const locationTrackingSocketService = new LocationTrackingSocketService();
