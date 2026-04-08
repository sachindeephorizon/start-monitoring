import * as Location from 'expo-location';
import { createLocationTrackerPoint } from '@/api/location-tracker';

class TrackMeLocationSyncService {
  private trackerId: string | null = null;
  private watch: Location.LocationSubscription | null = null;
  private lastSentAt = 0;

  private normalizeMetric(value: number | null): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return undefined;
    }
    return value;
  }

  private toPayload(location: Location.LocationObject) {
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: this.normalizeMetric(location.coords.altitude),
      accuracy: this.normalizeMetric(location.coords.accuracy),
      speed: this.normalizeMetric(location.coords.speed),
      heading: this.normalizeMetric(location.coords.heading),
      capturedAt: new Date(location.timestamp || Date.now()).toISOString(),
    };
  }

  async start(trackerId: string): Promise<boolean> {
    if (this.trackerId === trackerId && this.watch) {
      return true;
    }

    await this.stop();

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return false;
    }

    this.trackerId = trackerId;
    this.lastSentAt = 0;

    try {
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await createLocationTrackerPoint(trackerId, this.toPayload(initial));
      this.lastSentAt = Date.now();
    } catch {
      // Best-effort initial point.
    }

    this.watch = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        // Keep periodic updates even when stationary.
        // Distance constraints can suppress updates entirely on some devices.
        timeInterval: 5_000,
      },
      (location) => {
        void this.handleLocation(location);
      },
    );

    return true;
  }

  private async handleLocation(location: Location.LocationObject): Promise<void> {
    if (!this.trackerId) {
      return;
    }

    const now = Date.now();
    if (now - this.lastSentAt < 10_000) {
      return;
    }

    this.lastSentAt = now;

    try {
      await createLocationTrackerPoint(this.trackerId, this.toPayload(location));
    } catch {
      // Non-fatal: next location update will retry naturally.
    }
  }

  async stop(): Promise<void> {
    if (this.watch) {
      this.watch.remove();
      this.watch = null;
    }

    this.trackerId = null;
    this.lastSentAt = 0;
  }
}

export const trackMeLocationSyncService = new TrackMeLocationSyncService();
