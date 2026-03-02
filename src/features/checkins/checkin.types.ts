/**
 * Check-In Types
 * 
 * Type definitions for scheduled check-in functionality.
 * 
 * iOS SAFETY: Check-ins are server-driven. The app never schedules timers
 * or waits for check-in times. The server sends push notifications when
 * check-ins are due, and the app only responds to those notifications.
 */

/**
 * Check-in status values
 * 
 * These match the database schema and represent the lifecycle of a check-in.
 */
export type CheckInStatus =
  | 'pending'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'missed'
  | 'overdue'
  | 'cancelled'
  | 'escalated';

/**
 * Check-in frequency options
 */
export type CheckInFrequency = 'one-time' | 'daily' | 'weekly';

/**
 * Check-in payload for scheduling a check-in
 * 
 * This is the minimal data needed to schedule a check-in.
 * The server handles scheduling push notifications and escalation.
 */
export interface CheckInPayload {
  /**
   * When the check-in is scheduled (ISO 8601 timestamp)
   */
  scheduled_at: string;

  /**
   * Optional message/notes for the check-in
   */
  message?: string;

  /**
   * Optional location where check-in should occur
   */
  location?: {
    latitude: number;
    longitude: number;
    description?: string;
  };
}

/**
 * Check-in record from database
 * 
 * Note: The database doesn't store frequency. Recurring check-ins
 * are handled by creating new check-in records when one completes.
 */
export interface CheckIn {
  id: string;
  mobile_user_id: string;
  scheduled_at: string;
  status: CheckInStatus;
  notes?: string;
  passkey_attempts?: number;
  passkey_correct?: boolean;
  response_time_seconds?: number;
  location_at_checkin?: any; // JSONB
  agent_call_triggered?: boolean;
  agent_call_reason?: string;
  assigned_agent_id?: string;
  agent_notified_at?: string;
  agent_response_status?: 'pending' | 'acknowledged' | 'responding' | 'resolved';
  checked_in_at?: string; // Database uses checked_in_at, not completed_at
  cancelled_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at?: string;
}

/**
 * Check-in scheduling result
 */
export interface CheckInSchedulingResult {
  success: boolean;
  checkInId?: string;
  error?: string;
}

/**
 * Check-in completion result
 */
export interface CheckInCompletionResult {
  success: boolean;
  error?: string;
}

