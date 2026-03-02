/**
 * Video Call Hooks
 * 
 * React hooks for video call functionality.
 * 
 * iOS SAFETY: Video calls are foreground-only.
 * AppState monitoring ensures calls end when app backgrounds.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StreamVideoClient, Call } from '@stream-io/video-react-native-sdk';
import { CallingState } from '@stream-io/video-client';
import { VideoCallService } from './video.service';
import { VideoCallSession, VideoCallStatus } from './video.types';

/**
 * Hook for video call operations
 * 
 * Provides methods to join, leave, and manage video calls.
 * 
 * ⚠️ CRITICAL: This hook monitors AppState and automatically ends calls
 * when the app backgrounds. This is MANDATORY for iOS compliance.
 * 
 * @param client Stream.io video client (must be initialized)
 * @returns Video call state and methods
 */
export function useVideoCall(client: StreamVideoClient | null) {
  const [loading, setLoading] = useState(false);
  const [currentCall, setCurrentCall] = useState<Call | null>(null);
  const [callSession, setCallSession] = useState<VideoCallSession | null>(null);
  const [status, setStatus] = useState<VideoCallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const callingStateSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  /**
   * Leave the current call
   *
   * @returns Success status
   */
  const handleLeave = useCallback(async (callToLeave?: Call | null): Promise<boolean> => {
    const call = callToLeave ?? currentCall;
    if (!call) return false;

    setLoading(true);

    try {
      callingStateSubRef.current?.unsubscribe();
      callingStateSubRef.current = null;

      await VideoCallService.leave(call);

      // Update database status
      if (callSession?.call_id) {
        await VideoCallService.updateCallStatus(callSession.call_id, 'ended');
      }

      setCurrentCall(null);
      setCallSession(null);
      setStatus('ended');

      return true;
    } catch (err: any) {
      console.error('[Video Call Hook] Error leaving call:', err);
      setError(err.message || 'Failed to leave call');
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentCall, callSession]);

  /**
   * Handle app state changes
   * 
   * CRITICAL: Video calls MUST end when app backgrounds.
   * This is a non-negotiable iOS requirement.
   */
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState !== 'active' && currentCall) {
        console.log('[Video Call Hook] App backgrounded, ending video call');
        await handleLeave(currentCall);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [currentCall, handleLeave]);

  /**
   * Join a video call
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
        const call = await VideoCallService.join(callId, client);
        setCurrentCall(call);

        // Set up call event listeners
        call.on('call.ended', () => {
          console.log('[Video Call Hook] Call ended');
          setStatus('ended');
          handleLeave(call).catch(() => {});
        });

        // Watch for reconnect failure as a "call failed" equivalent.
        callingStateSubRef.current?.unsubscribe();
        callingStateSubRef.current = call.state.callingState$.subscribe((callingState) => {
          if (callingState === CallingState.RECONNECTING_FAILED) {
            console.log('[Video Call Hook] Call reconnecting failed');
            setStatus('failed');
            handleLeave(call).catch(() => {});
          }
        });

        // Update status when call becomes active
        setStatus('active');

        // Update database status if callSessionId provided
        if (callSessionId) {
          await VideoCallService.updateCallStatus(callSessionId, 'active');
          
          // Load call session info
          const session = await VideoCallService.getCallSession(callSessionId);
          setCallSession(session);
        }

        return true;
      } catch (err: any) {
        console.error('[Video Call Hook] Error joining call:', err);
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
   * Create and join a new video call
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
        const result = await VideoCallService.createCallSession(
          agentId,
          contextReason,
          priority
        );

        if (!result.success || !result.callSessionId) {
          setError(result.error || 'Failed to create call session');
          return false;
        }

        // Get call session to get room code
        const session = await VideoCallService.getCallSession(result.callSessionId);
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
        console.error('[Video Call Hook] Error creating call:', err);
        setError(err.message || 'Failed to create call');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [client, joinCall]
  );

  /**
   * Toggle camera on/off
   * 
   * @param enabled Whether camera should be enabled
   */
  const toggleCamera = useCallback(
    async (enabled: boolean): Promise<void> => {
      if (!currentCall) {
        return;
      }

      try {
        if (enabled) {
          await currentCall.camera.enable();
        } else {
          await currentCall.camera.disable();
        }
      } catch (err) {
        console.error('[Video Call Hook] Error toggling camera:', err);
      }
    },
    [currentCall]
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
        console.error('[Video Call Hook] Error toggling mute:', err);
      }
    },
    [currentCall]
  );

  // Cleanup on unmount - ensure call is ended
  useEffect(() => {
    return () => {
      if (currentCall) {
        handleLeave();
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
    toggleCamera,
    toggleMute,
  };
}

