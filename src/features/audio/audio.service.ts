/**
 * Audio Call Service
 * 
 * Core audio call operations using Stream.io for WebRTC communication.
 * 
 * iOS SAFETY: Audio session is managed separately (audio.session.ts).
 * This service handles call lifecycle and Stream.io integration.
 */

import { StreamVideoClient, Call } from '@stream-io/video-react-native-sdk';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { AudioSession } from './audio.session';
import { AudioCallStatus, AudioCallSession } from './audio.types';

/**
 * Audio Call Service
 * 
 * Provides methods for audio call operations.
 * Audio session management is handled separately to ensure proper iOS background audio.
 */
export const AudioCallService = {
  /**
   * Join an audio call
   * 
   * Joins an existing audio call using Stream.io.
   * Audio session is configured BEFORE joining to ensure background audio works.
   * 
   * @param callId Stream.io call ID (room code)
   * @param client Stream.io video client
   * @returns Stream.io Call object
   */
  async join(callId: string, client: StreamVideoClient): Promise<Call> {
    try {
      console.log('[Audio Call Service] Joining audio call:', callId);

      // CRITICAL: Start audio session BEFORE joining call
      // This ensures background audio is configured correctly
      await AudioSession.startCall();

      // Get Stream.io call object
      const call = client.call('default', callId);

      // Join the call
      await call.join({ create: false });

      console.log('[Audio Call Service] Successfully joined audio call:', callId);

      return call;
    } catch (error) {
      console.error('[Audio Call Service] Failed to join audio call:', error);
      
      // Clean up audio session if join fails
      await AudioSession.endCall();
      
      throw error;
    }
  },

  /**
   * Leave an audio call
   * 
   * Leaves the call and cleans up audio session.
   * 
   * @param call Stream.io Call object
   */
  async leave(call: Call): Promise<void> {
    try {
      console.log('[Audio Call Service] Leaving audio call');

      // Leave the Stream.io call
      await call.leave();

      // CRITICAL: End audio session AFTER leaving call
      // This stops background audio and releases resources
      await AudioSession.endCall();

      console.log('[Audio Call Service] Successfully left audio call');
    } catch (error) {
      console.error('[Audio Call Service] Failed to leave audio call:', error);
      
      // Still try to clean up audio session even if leave fails
      await AudioSession.endCall();
      
      throw error;
    }
  },

  /**
   * Create a new audio call session
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

      // Generate room code (Stream.io format)
      const roomCode = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create call session in database
      const { data, error } = await supabase
        .from('call_sessions')
        .insert({
          mobile_user_id: user.id,
          user_name: userProfile?.name || 'User',
          user_phone: userProfile?.phone || null,
          agent_id: agentId || null,
          call_type: 'audio_call',
          status: 'initiating',
          priority,
          room_code: roomCode,
          context_reason: contextReason || null,
        })
        .select('id')
        .single();

      if (error) {
        console.error('[Audio Call Service] Failed to create call session:', error);
        return {
          success: false,
          error: error.message || 'Failed to create call session',
        };
      }

      // Create audio session record
      const { error: audioSessionError } = await supabase
        .from('audio_sessions')
        .insert({
          session_id: data.id,
          mobile_user_id: user.id,
          agent_id: agentId || null,
          status: 'waiting',
          room_code: roomCode,
          session_type: priority === 'emergency' ? 'emergency' : 'monitoring',
        });

      if (audioSessionError) {
        console.error('[Audio Call Service] Failed to create audio session:', audioSessionError);
        // Continue anyway - call session was created
      }

      return {
        success: true,
        callSessionId: data.id,
      };
    } catch (error: any) {
      console.error('[Audio Call Service] Error creating call session:', error);
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
    status: AudioCallStatus
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

      // Also update audio session status
      await supabase
        .from('audio_sessions')
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
      console.error('[Audio Call Service] Error updating call status:', error);
    }
  },

  /**
   * Get call session by ID
   * 
   * @param callSessionId Call session ID
   * @returns Call session record
   */
  async getCallSession(callSessionId: string): Promise<AudioCallSession | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('call_sessions')
        .select('*, audio_sessions(*)')
        .eq('id', callSessionId)
        .eq('mobile_user_id', user.id)
        .single();

      if (error || !data) {
        return null;
      }

      const audioSession = data.audio_sessions?.[0];

      return {
        id: callSessionId,
        call_id: callSessionId,
        mobile_user_id: data.mobile_user_id,
        agent_id: data.agent_id,
        status: data.status as AudioCallStatus,
        room_code: data.room_code,
        session_type: audioSession?.session_type,
        started_at: data.started_at,
        ended_at: data.ended_at,
      };
    } catch (error) {
      console.error('[Audio Call Service] Error getting call session:', error);
      return null;
    }
  },
};

