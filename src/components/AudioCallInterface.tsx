/**
 * Audio Call Interface Component
 * 
 * Dedicated audio-only interface for calling agents.
 * Completely separate from video call implementation.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  StreamVideoClient,
  StreamVideo,
  StreamCall,
  CallingState,
  CallContent,
} from '@stream-io/video-react-native-sdk';
import { MaterialIcons } from '@expo/vector-icons';
import { audioCallService } from '@/services/audioCall.service';
import { formatDuration } from '@/utils/time';
import { useInCallAudio } from '@/hooks/useInCallAudio';
import { backgroundCallNotificationService } from '@/services/backgroundCallNotification.service';
import { useAuth } from '@/core/auth';

interface AudioCallInterfaceProps {
  callId: string;
  userName: string;
  onCallEnd: () => void;
  onCallError: (error: string) => void;
}

const AudioCallInterface: React.FC<AudioCallInterfaceProps> = ({
  callId,
  userName,
  onCallEnd,
  onCallError,
}) => {
  const auth = useAuth();
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling');

  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const clientRef = useRef<StreamVideoClient | null>(null);
  const callRef = useRef<any>(null);
  const connectedSecondsRef = useRef(0);
  const connectedSinceRef = useRef<number | null>(null);
  const listenerCleanupRef = useRef<Array<() => void>>([]);

  // Use in-call audio hook for audio routing
  useInCallAudio(callStatus === 'connected', isSpeakerOn, 'audio_call');

  // This effect intentionally runs once on mount to start the call UI flow.
  useEffect(() => {
    initializeAudioCall();

    return () => {
      listenerCleanupRef.current.forEach((cleanup) => cleanup());
      listenerCleanupRef.current = [];
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      // Best-effort: clear any ongoing call notification.
      backgroundCallNotificationService.dismissCallNotification(callId).catch(() => {});
      // Cleanup audio call service
      if (callRef.current?.state.callingState !== CallingState.LEFT) {
        callRef.current?.leave();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clearDurationTimer = () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  };

  const updateDuration = () => {
    if (connectedSinceRef.current == null) {
      setCallDuration(connectedSecondsRef.current);
      return;
    }

    const liveSeconds = Math.floor((Date.now() - connectedSinceRef.current) / 1000);
    setCallDuration(connectedSecondsRef.current + liveSeconds);
  };

  const startDurationTimer = () => {
    clearDurationTimer();
    updateDuration();
    durationInterval.current = setInterval(updateDuration, 1000);
  };

  const getParticipants = (callInstance: any): any[] => {
    const rawParticipants = (callInstance?.state as any)?.participants;

    if (Array.isArray(rawParticipants)) {
      return rawParticipants.filter(Boolean);
    }

    if (rawParticipants && typeof rawParticipants === 'object') {
      return Object.values(rawParticipants).filter(Boolean);
    }

    return [];
  };

  const hasRemoteAgentConnected = (callInstance: any, localUserId: string): boolean => {
    const participants = getParticipants(callInstance);

    return participants.some((participant: any) => {
      const participantUserId = participant?.userId || participant?.user?.id;
      const isLocal = participant?.isLocalParticipant === true || participantUserId === localUserId;
      return !isLocal;
    });
  };

  const syncAgentConnectionState = (isAgentConnected: boolean) => {
    if (isAgentConnected) {
      if (connectedSinceRef.current == null) {
        connectedSinceRef.current = Date.now();
      }
      setCallStatus('connected');
      startDurationTimer();
      return;
    }

    if (connectedSinceRef.current != null) {
      const sessionSeconds = Math.floor((Date.now() - connectedSinceRef.current) / 1000);
      connectedSecondsRef.current += Math.max(sessionSeconds, 0);
      connectedSinceRef.current = null;
    }

    clearDurationTimer();
    setCallDuration(connectedSecondsRef.current);
    if (callStatus !== 'ended') {
      setCallStatus('calling');
    }
  };

  const initializeAudioCall = async () => {
    try {
      setIsConnecting(true);
      setCallStatus('calling');
      console.log('[AudioCallInterface] Initializing dedicated audio call...');

      const authUser = auth.user;
      if (!authUser) {
        throw new Error('No authenticated user found - cannot start audio call');
      }

      const actualUserId = authUser.id;
      console.log('[AudioCallInterface] Authenticated user ID:', actualUserId);

      // Check if we already have a connected client
      let streamClient = audioCallService.getClient();
      const currentUser = audioCallService.getCurrentUser();

      if (!streamClient) {
        console.log('[AudioCallInterface] Creating new audio call client...');
        streamClient = await audioCallService.initializeUser(actualUserId, userName);
      } else {
        console.log('[AudioCallInterface] Reusing existing audio call client...');
        const clientUserId = (streamClient as any).userID;
        if (!currentUser || !clientUserId) {
          console.log('[AudioCallInterface] User not connected, connecting now...');
          await audioCallService.initializeUser(actualUserId, userName);
          streamClient = audioCallService.getClient();
        } else {
          console.log('[AudioCallInterface] User already connected:', currentUser.id);
          if (currentUser.id !== actualUserId) {
            console.log('[AudioCallInterface] User ID mismatch, reconnecting...');
            await audioCallService.initializeUser(actualUserId, userName);
            streamClient = audioCallService.getClient();
          }
        }
      }

      setClient(streamClient);
      clientRef.current = streamClient;
      console.log('[AudioCallInterface] Audio call client ready');

      // Create audio call instance
      const callInstance = await audioCallService.createAudioCall(callId, true);
      console.log('[AudioCallInterface] Audio call instance created:', callId);

      const evaluateConnectionState = () => {
        const isAgentConnected = hasRemoteAgentConnected(callInstance, actualUserId);
        syncAgentConnectionState(isAgentConnected);

        if (isAgentConnected) {
          backgroundCallNotificationService.showCallNotification(callId, userName, false).catch(() => {});
        }
      };

      const registerListener = (eventName: string, handler: (event: any) => void) => {
        const subscription = callInstance.on(eventName as any, handler);
        if (typeof subscription === 'function') {
          listenerCleanupRef.current.push(subscription);
        } else if (subscription && typeof (subscription as any).unsubscribe === 'function') {
          listenerCleanupRef.current.push(() => (subscription as any).unsubscribe());
        }
      };

      // Set up call state listeners
      registerListener('call.updated', (event) => {
        console.log('[AudioCallInterface] Call state updated:', event);
        evaluateConnectionState();
      });

      // Listen for participant changes
      registerListener('call.session_participant_joined', (event) => {
        console.log('[AudioCallInterface] Participant joined:', event.participant);
        evaluateConnectionState();
      });

      registerListener('call.session_participant_left', (event) => {
        console.log('[AudioCallInterface] Participant left:', event.participant);
        evaluateConnectionState();
      });

      setCall(callInstance);
      callRef.current = callInstance;
      setIsConnecting(false);
      evaluateConnectionState();
    } catch (e: any) {
      console.error('[AudioCallInterface] Failed to initialize audio call:', e);
      setError(e.message || 'Failed to initialize audio call');
      onCallError(e.message || 'Failed to initialize audio call');
      setIsConnecting(false);
      setCallStatus('ended');
    }
  };

  const toggleMute = async () => {
    if (call) {
      try {
        const muted = await audioCallService.toggleMute();
        setIsMuted(muted);
        console.log('[AudioCallInterface] Microphone toggled:', muted ? 'muted' : 'unmuted');
      } catch (error) {
        console.error('[AudioCallInterface] Failed to toggle microphone:', error);
        Alert.alert('Error', 'Failed to toggle microphone');
      }
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    console.log('[AudioCallInterface] Speaker toggled:', !isSpeakerOn ? 'on' : 'off');
  };

  const hangupCall = async () => {
    if (call) {
      try {
        await audioCallService.endCall();
        console.log('[AudioCallInterface] Audio call ended');
        setCallStatus('ended');
        clearDurationTimer();
      } catch (error) {
        console.error('[AudioCallInterface] Error ending audio call:', error);
      }
    }
    backgroundCallNotificationService.dismissCallNotification(callId).catch(() => {});
    onCallEnd();
  };

  if (isConnecting) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Connecting to agent...</Text>
          <Text style={styles.loadingSubText}>Please wait while we connect your audio call</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error" size={60} color="#f44336" />
          <Text style={styles.errorText}>Failed to connect audio call</Text>
          <Text style={styles.errorSubText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeAudioCall}>
            <Text style={styles.retryButtonText}>Retry Connection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCallEnd}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!client || !call) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error" size={60} color="#f44336" />
          <Text style={styles.errorText}>Failed to initialize audio call</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeAudioCall}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <View style={styles.audioCallContainer}>
            {/* 
              IMPORTANT (production audio fix):
              Mount Stream's CallContent (inert/hidden) so the SDK fully wires up media
              subscriptions (including remote audio playback).
              Without mounting CallContent, one-way audio can occur (app -> dashboard works,
              dashboard -> app is silent).
            */}
            {callStatus === 'connected' && (
              <View pointerEvents="none" style={styles.hiddenCallContent}>
                <CallContent />
              </View>
            )}

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.statusIndicator}>
                <View style={[styles.statusDot, { backgroundColor: callStatus === 'connected' ? '#4CAF50' : '#FFA500' }]} />
                <Text style={styles.statusText}>
                  {callStatus === 'connected' ? 'Agent connected' :
                   callStatus === 'calling' ? 'Calling...' : 'Ended'}
                </Text>
              </View>
              <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
            </View>

            {/* Agent Info */}
            <View style={styles.agentInfo}>
              <View style={styles.avatarContainer}>
                <MaterialIcons name="headset-mic" size={80} color="#4CAF50" />
              </View>
              <Text style={styles.agentName}>Security Agent</Text>
              <Text style={styles.callTypeText}>Audio Call</Text>
              <Text style={styles.connectionText}>
                {callStatus === 'connected' ? 'Agent connected' : 'Calling...'}
              </Text>
            </View>

            {/* Audio Controls */}
            <View style={styles.controlsContainer}>
              <TouchableOpacity
                style={[
                  styles.controlButton,
                  isMuted ? styles.controlButtonMuted : styles.controlButtonActive
                ]}
                onPress={toggleMute}
              >
                <MaterialIcons
                  name={isMuted ? "mic-off" : "mic"}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.controlButton,
                  isSpeakerOn ? styles.controlButtonActive : styles.controlButtonInactive
                ]}
                onPress={toggleSpeaker}
              >
                <MaterialIcons
                  name={isSpeakerOn ? "volume-up" : "volume-down"}
                  size={28}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, styles.hangupButton]}
                onPress={hangupCall}
              >
                <MaterialIcons name="call-end" size={28} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Call Info */}
            <View style={styles.callInfo}>
              <Text style={styles.callInfoText}>Call ID: {callId}</Text>
              <Text style={styles.callInfoText}>Mode: Audio Only</Text>
            </View>
          </View>
        </StreamCall>
      </StreamVideo>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
  },
  loadingSubText: {
    color: '#ccc',
    fontSize: 14,
    marginTop: 10,
    textAlign: 'center',
  },
  audioCallContainer: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  hiddenCallContent: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    top: -10,
    left: -10,
  },
  header: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  durationText: {
    color: '#4CAF50',
    fontSize: 24,
    fontWeight: 'bold',
  },
  agentInfo: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  avatarContainer: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  agentName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  callTypeText: {
    color: '#FFA500',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  connectionText: {
    color: '#4CAF50',
    fontSize: 16,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  controlButtonActive: {
    backgroundColor: '#4CAF50',
  },
  controlButtonInactive: {
    backgroundColor: '#666',
  },
  controlButtonMuted: {
    backgroundColor: '#f44336',
  },
  hangupButton: {
    backgroundColor: '#f44336',
  },
  callInfo: {
    alignItems: 'center',
  },
  callInfoText: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 20,
  },
  errorSubText: {
    color: '#ccc',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginBottom: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#666',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AudioCallInterface;

