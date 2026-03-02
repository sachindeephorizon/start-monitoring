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
import { supabase, ensureValidSession } from '@/lib/supabase';
import { VideoCallStatus, VideoCallSession } from './video.types';

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
   * Create a new video call session
   * 
   * Creates a call session record in the database.
   * The actual Stream.io call is created separately.
   * 
   * @param agentId Optional agent ID if call is agent-initiated
   * @param contextReason Reason/context for the call
   * @param priority Call priority
   * @returns Created call session ID
   */
  async createCallSession(
    agentId?: string,
    contextReason?: string,
    priority: 'low' | 'medium' | 'high' | 'emergency' = 'medium'
  ): Promise<{ success: boolean; callSessionId?: string; error?: string }> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Get user info
      const { data: userProfile } = await supabase
        .from('mobile_users')
        .select('name, phone')
        .eq('id', user.id)
        .single();

      // Generate room code matching old app pattern (max 50 chars for DB)
      // Pattern: call-${shortUserId}-${timestamp}
      const sanitizedUserId = user.id.replace(/\./g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase();
      const shortUserId = sanitizedUserId.substring(0, 8); // Use first 8 chars
      const timestamp = Date.now().toString().slice(-8); // Use last 8 digits
      const roomCode = `call-${shortUserId}-${timestamp}`;
      
      // Ensure room code is never longer than 50 characters
      if (roomCode.length > 50) {
        throw new Error(`Room code too long: ${roomCode.length} characters (max 50)`);
      }

      // Create call session in database
      const { data, error } = await supabase
        .from('call_sessions')
        .insert({
          mobile_user_id: user.id,
          user_name: userProfile?.name || 'User',
          user_phone: userProfile?.phone || null,
          agent_id: agentId || null,
          call_type: 'video',
          status: 'initiating',
          priority,
          room_code: roomCode,
          context_reason: contextReason || null,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[Video Call Service] Failed to create call session:', error);
        return {
          success: false,
          error: error.message || 'Failed to create call session',
        };
      }

      // Create video session record
      const { error: videoSessionError } = await supabase
        .from('video_sessions')
        .insert({
          session_id: data.id,
          mobile_user_id: user.id,
          agent_id: agentId || null,
          status: 'waiting',
          room_code: roomCode,
          session_type: priority === 'emergency' ? 'emergency' : 'monitoring',
          video_enabled: true,
          audio_enabled: true,
        });

      if (videoSessionError) {
        console.error('[Video Call Service] Failed to create video session:', videoSessionError);
        // Continue anyway - call session was created
      }

      return {
        success: true,
        callSessionId: data.id,
      };
    } catch (error: any) {
      console.error('[Video Call Service] Error creating call session:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Update call session status
   * 
   * @param callSessionId Call session ID
   * @param status New status
   */
  async updateCallStatus(
    callSessionId: string,
    status: VideoCallStatus
  ): Promise<void> {
    try {
      const dbStatus = status === 'active' ? 'active' : 
                       status === 'ended' ? 'ended' :
                       status === 'failed' ? 'failed' :
                       'connecting';

      await supabase
        .from('call_sessions')
        .update({
          status: dbStatus,
          ...(status === 'active' && { started_at: new Date().toISOString() }),
          ...(status === 'ended' && { ended_at: new Date().toISOString() }),
        })
        .eq('id', callSessionId);

      // Also update video session status
      await supabase
        .from('video_sessions')
        .update({
          status: status === 'active' ? 'connected' :
                  status === 'ended' ? 'ended' :
                  status === 'failed' ? 'failed' :
                  'connecting',
          ...(status === 'active' && { connected_at: new Date().toISOString() }),
          ...(status === 'ended' && { ended_at: new Date().toISOString() }),
        })
        .eq('session_id', callSessionId);
    } catch (error) {
      console.error('[Video Call Service] Error updating call status:', error);
    }
  },

  /**
   * Get call session by ID
   * 
   * @param callSessionId Call session ID
   * @returns Call session record
   */
  async getCallSession(callSessionId: string): Promise<VideoCallSession | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('call_sessions')
        .select('*, video_sessions(*)')
        .eq('id', callSessionId)
        .eq('mobile_user_id', user.id)
        .single();

      if (error || !data) {
        return null;
      }

      const videoSession = data.video_sessions?.[0];

      return {
        id: callSessionId,
        call_id: callSessionId,
        mobile_user_id: data.mobile_user_id,
        agent_id: data.agent_id,
        status: data.status as VideoCallStatus,
        room_code: data.room_code,
        session_type: videoSession?.session_type,
        video_enabled: videoSession?.video_enabled,
        audio_enabled: videoSession?.audio_enabled,
        started_at: data.started_at,
        ended_at: data.ended_at,
      };
    } catch (error) {
      console.error('[Video Call Service] Error getting call session:', error);
      return null;
    }
  },
};

