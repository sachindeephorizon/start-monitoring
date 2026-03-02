/**
 * Audio Call Hooks
 * 
 * React hooks for audio call functionality.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { StreamVideoClient, Call } from '@stream-io/video-react-native-sdk';
import { CallingState } from '@stream-io/video-client';
import { AudioCallService } from './audio.service';
import { AudioCallSession, AudioCallStatus } from './audio.types';
import { AudioSession } from './audio.session';

/**
 * Hook for audio call operations
 * 
 * Provides methods to join, leave, and manage audio calls.
 * Audio session is automatically managed (started on join, ended on leave).
 * 
 * @param client Stream.io video client (must be initialized)
 * @returns Audio call state and methods
 */
export function useAudioCall(client: StreamVideoClient | null) {
  const [loading, setLoading] = useState(false);
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [callSession, setCallSession] = useState<AudioCallSession | null>(null);
  const [status, setStatus] = useState<AudioCallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const callingStateSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  /**
   * Leave the current call
   *
   * @returns Success status
   */
  const handleLeave = useCallback(async (callToLeave?: Call | null): Promise<boolean> => {
    const call = callToLeave ?? currentCall;
    if (!call) {
      return false;
    }

    setLoading(true);

    try {
      callingStateSubRef.current?.unsubscribe();
      callingStateSubRef.current = null;

      await AudioCallService.leave(call);

      // Update database status
      if (callSession?.call_id) {
        await AudioCallService.updateCallStatus(callSession.call_id, 'ended');
      }

      setCurrentCall(null);
      setCallSession(null);
      setStatus('ended');

      return true;
    } catch (err: any) {
      console.error('[Audio Call Hook] Error leaving call:', err);
      setError(err.message || 'Failed to leave call');
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentCall, callSession]);

  /**
   * Join an audio call
   * 
   * @param callId Stream.io call ID (room code)
   * @param callSessionId Optional call session ID from database
   * @returns Success status
   */
  const joinCall = useCallback(
    async (callId: string, callSessionId?: string): Promise<boolean> => {
      if (!client) {
        setError('Stream client not initialized');
        return false;
      }

      setLoading(true);
      setError(null);
      setStatus('connecting');

      try {
        // Join the call via Stream.io
        const call = await AudioCallService.join(callId, client);
        setCurrentCall(call);

        // Set up call event listeners
        call.on('call.ended', () => {
          console.log('[Audio Call Hook] Call ended');
          setStatus('ended');
          handleLeave(call).catch(() => {});
        });

        // Watch for reconnect failure as a "call failed" equivalent.
        callingStateSubRef.current?.unsubscribe();
        callingStateSubRef.current = call.state.callingState$.subscribe((callingState) => {
          if (callingState === CallingState.RECONNECTING_FAILED) {
            console.log('[Audio Call Hook] Call reconnecting failed');
            setStatus('failed');
            handleLeave(call).catch(() => {});
          }
        });

        // Update status when call becomes active
        setStatus('active');

        // Update database status if callSessionId provided
        if (callSessionId) {
          await AudioCallService.updateCallStatus(callSessionId, 'active');
          
          // Load call session info
          const session = await AudioCallService.getCallSession(callSessionId);
          setCallSession(session);
        }

        return true;
      } catch (err: any) {
        console.error('[Audio Call Hook] Error joining call:', err);
        setError(err.message || 'Failed to join call');
        setStatus('failed');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client, handleLeave]
  );

  /**
   * Create and join a new audio call
   * 
   * @param agentId Optional agent ID
   * @param contextReason Reason for the call
   * @param priority Call priority
   * @returns Success status
   */
  const createAndJoinCall = useCallback(
    async (
      agentId?: string,
      contextReason?: string,
      priority: 'low' | 'medium' | 'high' | 'emergency' = 'medium'
    ): Promise<boolean> => {
      if (!client) {
        setError('Stream client not initialized');
        return false;
      }

      setLoading(true);
      setError(null);

      try {
        // Create call session in database
        const result = await AudioCallService.createCallSession(
          agentId,
          contextReason,
          priority
        );

        if (!result.success || !result.callSessionId) {
          setError(result.error || 'Failed to create call session');
          return false;
        }

        // Get call session to get room code
        const session = await AudioCallService.getCallSession(result.callSessionId);
        if (!session) {
          setError('Failed to retrieve call session');
          return false;
        }

        // Join the call using room code
        const joined = await joinCall(session.room_code, result.callSessionId);
        if (joined) {
          setCallSession(session);
        }

        return joined;
      } catch (err: any) {
        console.error('[Audio Call Hook] Error creating call:', err);
        setError(err.message || 'Failed to create call');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client, joinCall]
  );

  /**
   * Toggle microphone mute
   * 
   * @param muted Whether to mute or unmute
   */
  const toggleMute = useCallback(
    async (muted: boolean): Promise<void> => {
      if (!currentCall) {
        return;
      }

      try {
        await currentCall.microphone.toggle();
      } catch (err) {
        console.error('[Audio Call Hook] Error toggling mute:', err);
      }
    },
    [currentCall]
  );

  // Cleanup on unmount - ensure audio session is ended
  useEffect(() => {
    return () => {
      if (currentCall) {
        handleLeave();
      } else {
        // Just clean up audio session if no call
        AudioSession.endCall();
      }
    };
  }, [currentCall, handleLeave]);

  return {
    loading,
    currentCall,
    callSession,
    status,
    error,
    isActive: status === 'active',
    joinCall,
    leaveCall: handleLeave,
    createAndJoinCall,
    toggleMute,
  };
}

