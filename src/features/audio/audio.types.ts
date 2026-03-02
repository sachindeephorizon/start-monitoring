/**
 * Audio Call Types
 * 
 * Type definitions for audio call functionality.
 * 
 * iOS SAFETY: Audio calls can run in background while active.
 * Background audio is ONLY allowed while a call is active.
 */

/**
 * Audio call status values
 * 
 * These represent the lifecycle of an audio call.
 */
export type AudioCallStatus =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'failed';

/**
 * Audio call payload for incoming calls
 */
export interface AudioCallPayload {
  /**
   * Call session ID (from call_sessions table)
   */
  call_id: string;

  /**
   * Optional emergency ID if call is related to emergency
   */
  emergency_id?: string;

  /**
   * Optional check-in ID if call is related to check-in
   */
  checkin_id?: string;

  /**
   * Stream.io room code
   */
  room_code?: string;
}

/**
 * Audio call session information
 */
export interface AudioCallSession {
  id: string;
  call_id: string;
  mobile_user_id: string;
  agent_id?: string;
  status: AudioCallStatus;
  room_code: string;
  session_type?: 'monitoring' | 'emergency' | 'scheduled';
  started_at?: string;
  ended_at?: string;
}

