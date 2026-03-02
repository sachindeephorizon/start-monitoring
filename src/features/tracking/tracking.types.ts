/**
 * Tracking Types
 * 
 * Type definitions for location tracking functionality.
 * 
 * iOS SAFETY: Tracking intervals are logical, not timers.
 * The server decides when to expect updates, not the app.
 */

/**
 * Tracking interval options (in minutes)
 * 
 * These represent logical intervals that the server uses to
 * determine expected update frequency. The app does NOT use
 * these as timers - they're informational only.
 */
export type TrackingInterval = 15 | 30 | 60 | 120 | 240 | 480 | 1440; // minutes

/**
 * Tracking session (server-side data structure)
 * 
 * This represents a tracking session stored in the database.
 * The app sends location updates to the server, and the server
 * manages session state, expiration, and check-ins.
 */
export interface TrackingSession {
  id: string;
  mobile_user_id: string;
  session_name: string;
  start_time: string;
  end_time: string;
  checkin_interval_minutes: TrackingInterval;
  use_account_passkey: boolean;
  status: 'active' | 'paused' | 'completed' | 'emergency';
  initial_location?: any;
  last_known_location?: any;
  assigned_agent_id?: string;
  emergency_contact_phone?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

/**
 * Location data point
 * 
 * Represents a single location update sent to the server.
 */
export interface TrackingLocation {
  id?: string;
  tracking_session_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  network_type?: string;
  timestamp: string;
  recorded_during?: 'tracking' | 'checkin' | 'emergency';
  battery_level?: number;
}

/**
 * Tracking state (client-side)
 * 
 * Represents the current tracking state in the app.
 */
export interface TrackingState {
  isTracking: boolean;
  activeSessionId: string | null;
  lastLocation: TrackingLocation | null;
  startedAt: string | null;
}

