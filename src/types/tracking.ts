/**
 * TypeScript types for DeepHorizon Tracking System
 * Aligned with the database schema
 */

export type TrackingSessionStatus = 'active' | 'paused' | 'completed' | 'emergency';

export type CheckinStatus = 'pending' | 'success' | 'failed' | 'timeout' | 'missed';

export interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: string;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export interface TrackingSession {
  id: string;
  mobile_user_id: string;
  session_name: string;
  start_time: string;
  end_time: string;
  checkin_interval_minutes: number;
  use_account_passkey: boolean;
  status: TrackingSessionStatus;
  initial_location?: LocationData;
  last_known_location?: LocationData;
  assigned_agent_id?: string;
  emergency_contact_phone?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface TrackingCheckin {
  id: string;
  tracking_session_id: string;
  scheduled_time: string;
  initiated_at?: string;
  completed_at?: string;
  status: CheckinStatus;
  passkey_attempts: number;
  passkey_correct?: boolean;
  response_time_seconds?: number;
  location_at_checkin?: LocationData;
  agent_call_triggered?: boolean;
  agent_call_reason?: string;
  assigned_agent_id?: string;
  created_at?: string;
}

export interface TrackingSessionWithNextCheckin extends TrackingSession {
  next_checkin?: TrackingCheckin;
  pending_checkins_count?: number;
  successful_checkins_count?: number;
  failed_checkins_count?: number;
}

// Interval options for the dropdown (matches old app)
export const TRACKING_INTERVALS = [
  { value: 1, label: 'Every 1 minute (Testing)' },
  { value: 5, label: 'Every 5 minutes' },
  { value: 10, label: 'Every 10 minutes' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
] as const;

export type TrackingIntervalValue = typeof TRACKING_INTERVALS[number]['value'];

