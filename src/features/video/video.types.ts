/**
 * Video Call Types
 * 
 * Type definitions for video call functionality.
 * 
 * iOS SAFETY: Video calls are foreground-only.
 * Background video is explicitly forbidden by Apple.
 * Video calls MUST terminate when app backgrounds.
 */

/**
 * Video call status values
 * 
 * These represent the lifecycle of a video call.
 */
export type VideoCallStatus =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'failed';

/**
 * Video call payload for incoming calls
 */
export interface VideoCallPayload {
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
 * Video call session information
 */
export interface VideoCallSession {
  id: string;
  call_id: string;
  mobile_user_id: string;
  agent_id?: string;
  status: VideoCallStatus;
  room_code: string;
  session_type?: 'monitoring' | 'emergency' | 'scheduled';
  video_enabled?: boolean;
  audio_enabled?: boolean;
  started_at?: string;
  ended_at?: string;
}

