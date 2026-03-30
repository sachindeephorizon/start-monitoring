/**
 * Video Call Service
 *
 * Core video call operations using Stream.io for WebRTC communication.
 *
 * iOS SAFETY: Video calls are foreground-only. No background execution is allowed.
 * Video calls MUST terminate when the app backgrounds or screen locks.
 *
 * DESIGN PRINCIPLE:
 * > Video calls exist ONLY while the app is in the foreground.
 * > When the app backgrounds, the call must end immediately.
 */

import { StreamVideoClient, Call } from '@stream-io/video-react-native-sdk';
import {
  initiateCallSession,
  initiateCallSessionWithAgent,
  updateCallSessionStatus,
  endCallSession,
  CallType,
  CallServiceType,
  CallPriority,
  CallStatus,
} from '@/api/call-sessions';
import { VideoCallStatus, VideoCallSession } from './video.types';

/**
 * Generate a unique call ID.
 * Stream.io uses this string as the room identifier — it must be unique per call.
 */
function generateCallId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `call-${timestamp}-${random}`;
}

function mapPriority(priority: string): CallPriority {
  switch (priority) {
    case 'emergency':
    case 'high':
      return CallPriority.HIGH;
    case 'low':
      return CallPriority.LOW;
    default:
      return CallPriority.MEDIUM;
  }
}

function resolveServiceType(
  priority: string,
  contextReason?: string
): CallServiceType {
  if (
    priority === 'emergency' ||
    contextReason?.toLowerCase().includes('emergency')
  ) {
    return CallServiceType.EMERGENCY_VIDEO_CALL;
  }
  return CallServiceType.DIRECT_VIDEO_CALL;
}

/**
 * Video Call Service
 * 
 * Provides methods for video call operations.
 * All video calls are foreground-only - no background execution.
 */
export const VideoCallService = {
  /**
   * Join a video call
   * 
   * Joins an existing video call using Stream.io.
   * Video calls only work in foreground - no background support.
   * 
   * @param callId Stream.io call ID (room code)
   * @param client Stream.io video client
   * @returns Stream.io Call object
   */
  async join(callId: string, client: StreamVideoClient): Promise<Call> {
    try {
      console.log('[Video Call Service] Joining video call:', callId);

      // Get Stream.io call object
      const call = client.call('default', callId);

      // Join the call
      await call.join({ create: false });

      console.log('[Video Call Service] Successfully joined video call:', callId);

      return call;
    } catch (error) {
      console.error('[Video Call Service] Failed to join video call:', error);
      throw error;
    }
  },

  /**
   * Leave a video call
   * 
   * Leaves the call and releases camera/microphone resources.
   * 
   * @param call Stream.io Call object
   */
  async leave(call: Call): Promise<void> {
    try {
      console.log('[Video Call Service] Leaving video call');

      // Leave the Stream.io call
      // This releases camera and microphone resources
      await call.leave();

      console.log('[Video Call Service] Successfully left video call');
    } catch (error) {
      console.error('[Video Call Service] Failed to leave video call:', error);
      throw error;
    }
  },

  /**
   * Create a new video call session via the app backend.
   *
   * Generates a unique callId locally — this IS the Stream room code.
   * Registers it with the backend so the agent dashboard can see the call.
   *
   * @param agentId   Unused (kept for call-site compatibility)
   * @param contextReason  Reason/context for the call
   * @param priority  Call priority
   * @returns { success, callSessionId } where callSessionId === Stream room code
   */
  async createCallSession(
    agentId?: string,
    contextReason?: string,
    priority: 'low' | 'medium' | 'high' | 'emergency' = 'medium'
  ): Promise<{ success: boolean; callSessionId?: string; error?: string }> {
    try {
      const callId = generateCallId();

      const payload = {
        callType: CallType.VIDEO,
        serviceType: resolveServiceType(priority, contextReason),
        priority: mapPriority(priority),
        callId,
      };

      if (agentId) {
        await initiateCallSessionWithAgent(payload, agentId);
      } else {
        await initiateCallSession(payload);
      }

      return { success: true, callSessionId: callId };
    } catch (error: any) {
      console.error('[Video Call Service] Failed to create call session:', error);
      return {
        success: false,
        error: error.message || 'Failed to create call session',
      };
    }
  },

  /**
   * Update call session status via the app backend.
   *
   * Calls endCallSession for terminal states (ended/failed),
   * and updateCallSessionStatus for intermediate states.
   *
   * @param callSessionId Call session ID (= Stream room code)
   * @param status        New status
   */
  async updateCallStatus(
    callSessionId: string,
    status: VideoCallStatus
  ): Promise<void> {
    try {
      if (status === 'ended' || status === 'failed') {
        await endCallSession(callSessionId);
      } else {
        const apiStatus =
          status === 'active' ? CallStatus.ACTIVE : CallStatus.INITIATED;
        await updateCallSessionStatus(callSessionId, apiStatus);
      }
    } catch (error) {
      console.error('[Video Call Service] Error updating call status:', error);
    }
  },

  /**
   * Get call session by ID.
   *
   * In the new flow the callId IS the Stream room code — no backend
   * round-trip is needed. Returns a minimal session object immediately.
   *
   * @param callSessionId Call session ID (= Stream room code)
   */
  async getCallSession(callSessionId: string): Promise<VideoCallSession | null> {
    return {
      id: callSessionId,
      call_id: callSessionId,
      mobile_user_id: '',
      status: 'active',
      room_code: callSessionId,
    };
  },
};

