import { post } from './config';

export interface LocationTrackerPointPayload {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt?: string;
}

export interface CommandResponse<T> {
  status: number;
  message: string;
  data: T;
}

export const createLocationTrackerPoint = async (
  trackerId: string,
  input: LocationTrackerPointPayload,
): Promise<void> => {
  await post(`/location-tracker/${encodeURIComponent(trackerId)}/points`, input) as CommandResponse<unknown>;
};
