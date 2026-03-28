/**
 * Audio Call Service (src/services/ — Stream SDK integration)
 *
 * Manages Stream Video SDK client, user init, call creation/join/end.
 * Uses the app backend call-session APIs (same backend family as video calls)
 * for token generation and call session lifecycle.
 */

import type { StreamVideoClient, User, Call } from '@stream-io/video-react-native-sdk';
import {
  callSessionTokenGenerate,
  initiateCallSession,
  updateCallSessionStatus,
  endCallSession,
  CallPriority,
  CallServiceType,
  CallStatus,
  CallType,
} from '@/api/call-sessions';
import {
  hasWebRTCNativeModule,
  loadStreamVideoSdk,
  type StreamVideoSdkModule,
} from '@/lib/streamVideoSdkLoader';
import { configureAudioSession } from '@/utils/audioSession';

export interface AudioCallSession {
  id: string;
  callId: string;
  userId: string;
  userName: string;
  agentId?: string;
  agentName?: string;
  status: 'connecting' | 'connected' | 'ended' | 'failed';
  startTime: Date;
  endTime?: Date;
  callType: 'audio';
}

class AudioCallService {
  private client: StreamVideoClient | null = null;
  private currentUser: User | null = null;
  private currentCall: Call | null = null;
  private cachedToken: string | null = null;
  private tokenExpiryTime: number = 0;
  private tokenInFlight: Promise<string> | null = null;
  private activeCallIds: Set<string> = new Set();
  private static instance: AudioCallService;

  private constructor() {}

  public static getInstance(): AudioCallService {
    if (!AudioCallService.instance) {
      AudioCallService.instance = new AudioCallService();
    }
    return AudioCallService.instance;
  }

  public getClient(): StreamVideoClient | null {
    return this.client;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public getCurrentCall(): Call | null {
    return this.currentCall;
  }

  private ensureSdkAvailable(): StreamVideoSdkModule {
    const sdk = loadStreamVideoSdk();
    if (!sdk) {
      throw new Error('Audio calling requires WebRTC native modules. Please install a development build.');
    }
    return sdk;
  }

  public async initializeClient(): Promise<StreamVideoClient> {
    if (!hasWebRTCNativeModule) {
      throw new Error('WebRTC native module not available. Audio calls are disabled in Expo Go builds.');
    }

    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY;
    if (!apiKey) {
      throw new Error('EXPO_PUBLIC_STREAM_API_KEY is not configured');
    }

    console.log('[AudioCallService] Creating dedicated audio call client...');
    const { StreamVideoClient: StreamVideoClientCtor } = this.ensureSdkAvailable();
    this.client = new StreamVideoClientCtor({
      apiKey,
      options: {
        logLevel: 'warn',
      },
    });

    console.log('[AudioCallService] Dedicated audio call client created successfully');
    return this.client;
  }

  private async connectUser(userId: string, userName?: string): Promise<void> {
    if (!this.client) throw new Error('Audio call client not initialized');

    // Check if already connected as this user
    if (this.currentUser && this.currentUser.id === userId) {
      console.log('[AudioCallService] Already connected as user:', userId);
      return;
    }

    try {
      console.log('[AudioCallService] Connecting user for audio call:', userId);

      // Disconnect previous user if connected as different user
      if (this.currentUser && this.currentUser.id !== userId) {
        console.log('[AudioCallService] Disconnecting previous user before connecting new user');
        try {
          await this.client.disconnectUser();
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (disconnectError) {
          console.warn('[AudioCallService] Disconnect error (non-critical):', disconnectError);
        }
        this.currentUser = null;
      }

      // Generate token
      const token = await this.generateAudioToken();

      if (!token) {
        throw new Error('Failed to generate audio token');
      }

      // Create user object
      const user: User = {
        id: userId,
        name: userName || userId,
        image: `https://robohash.org/${userId}`,
      };

      // Connect the user
      await this.client.connectUser(user, token);
      this.currentUser = user;

      console.log('[AudioCallService] User connected successfully for audio call:', userId);
    } catch (error) {
      console.error('[AudioCallService] Failed to connect user for audio call:', error);
      this.currentUser = null;
      throw error;
    }
  }

  private async generateAudioToken(forceRefresh: boolean = false): Promise<string> {
    try {
      // Check cache
      if (!forceRefresh && this.cachedToken && Date.now() < this.tokenExpiryTime) {
        console.log('[AudioCallService] Using cached audio token');
        return this.cachedToken;
      }

      if (!forceRefresh && this.tokenInFlight) {
        console.log('[AudioCallService] Audio token fetch already in-flight');
        return await this.tokenInFlight;
      }

      this.tokenInFlight = (async () => {
        console.log('[AudioCallService] Generating new audio token');

        const tokenResponse = await callSessionTokenGenerate();
        const token =
          typeof tokenResponse === 'string'
            ? tokenResponse
            : (tokenResponse as any)?.token ??
              (tokenResponse as any)?.streamToken ??
              (tokenResponse as any)?.accessToken;

        if (!token || typeof token !== 'string') {
          throw new Error('Invalid audio token response from backend');
        }

        // Cache token for 1 hour
        this.cachedToken = token;
        this.tokenExpiryTime = Date.now() + (60 * 60 * 1000);
        console.log('[AudioCallService] Audio token generated successfully');
        return token;
      })();

      try {
        return await this.tokenInFlight;
      } finally {
        this.tokenInFlight = null;
      }
    } catch (error) {
      console.error('[AudioCallService] Failed to generate audio token:', error);
      this.cachedToken = null;
      this.tokenExpiryTime = 0;
      throw error;
    }
  }

  public async initializeUser(userId: string, userName?: string): Promise<StreamVideoClient> {
    if (!hasWebRTCNativeModule) {
      throw new Error('WebRTC native module not available. Audio calls are disabled in Expo Go builds.');
    }

    try {
      if (this.currentUser && this.currentUser.id === userId && this.client) {
        console.log('[AudioCallService] User already initialized and connected:', userId);
        return this.client;
      }

      console.log('[AudioCallService] Initializing user for audio call:', userId);

      // Initialize client
      await this.initializeClient();

      // Connect user
      await this.connectUser(userId, userName);

      console.log('[AudioCallService] User initialization completed for audio call:', userId);
      return this.client!;
    } catch (error) {
      console.error('[AudioCallService] Failed to initialize user for audio call:', error);
      throw error;
    }
  }

  public async createAudioCall(callId: string, create: boolean = true): Promise<Call> {
    if (!this.client) {
      throw new Error('Audio call client not initialized');
    }

    // Prevent duplicate calls
    if (this.activeCallIds.has(callId)) {
      console.warn('[AudioCallService] Call already exists for:', callId);
      if (this.currentCall && (this.currentCall as any).id === callId) {
        return this.currentCall;
      }
      this.activeCallIds.delete(callId);
    }

    // Ensure user is connected
    if (!this.currentUser) {
      throw new Error('User not connected to Stream Video. Please initialize user first.');
    }

    try {
      console.log('[AudioCallService] Creating audio call:', callId);

      // Create backend call-session record (same API family used by video)
      if (create) {
        try {
          await initiateCallSession({
            callType: CallType.AUDIO,
            serviceType: CallServiceType.AUDIT_CALL,
            priority: CallPriority.HIGH,
            callId,
          });
        } catch (sessionError) {
          console.error('[AudioCallService] Failed to create audio call session:', sessionError);
          throw sessionError;
        }
      }

      // Use 'default' call type for Stream.io
      const callType = 'default';
      const call = this.client.call(callType, callId);

      // Configure audio session BEFORE joining call
      await configureAudioSession();

      // Join the call with audio-only configuration
      await call.join({
        create,
        ring: false,
        // Stream SDK JoinCallRequest uses `video` to indicate joining with video enabled.
        // Audio is managed via device managers (microphone/camera) after join.
        video: false,
      });

      // Request microphone permissions
      try {
        const { Camera } = await import('expo-camera');
        const micPermission = await Camera.requestMicrophonePermissionsAsync();
        if (micPermission.status !== 'granted') {
          throw new Error('Microphone permission denied. Please allow microphone access in your device settings.');
        }
        console.log('[AudioCallService] Microphone permission granted');
      } catch (permErr: any) {
        console.error('[AudioCallService] Microphone permission error:', permErr);
        throw new Error(permErr.message || 'Microphone permission is required for audio calls.');
      }

      // Configure for audio-only mode
      try {
        // Disable camera
        await call.camera?.disable?.();
        await new Promise(resolve => setTimeout(resolve, 200));
        await call.camera?.disable?.();

        // Enable microphone with retry logic
        let microphoneEnabled = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await call.microphone?.enable?.();
            await new Promise(resolve => setTimeout(resolve, 1000));

            const localParticipant = call.state?.localParticipant;
            if (localParticipant?.audioStream) {
              const audioTracks = localParticipant.audioStream.getAudioTracks();
              const activeTracks = audioTracks.filter((track: MediaStreamTrack) =>
                track.enabled && track.readyState === 'live'
              );

              if (activeTracks.length > 0) {
                microphoneEnabled = true;
                console.log('[AudioCallService] Microphone enabled and audio tracks published');
                break;
              }
            }

            if (!microphoneEnabled && attempt < 3) {
              await call.microphone?.disable?.();
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          } catch (micErr: any) {
            if (attempt === 3) {
              throw new Error(`Failed to enable microphone: ${micErr.message || micErr.name}`);
            }
          }
        }

        if (!microphoneEnabled) {
          throw new Error('Microphone enabled but no audio tracks found.');
        }

        console.log('[AudioCallService] Audio-only mode configured successfully');
      } catch (mediaErr: any) {
        console.error('[AudioCallService] Failed to configure audio-only mode:', mediaErr);
        throw mediaErr;
      }

      // Update backend status to ACTIVE
      if (create) {
        try {
          await updateCallSessionStatus(callId, CallStatus.ACTIVE);
        } catch (updateErr) {
          console.warn('[AudioCallService] Error updating audio call status (non-critical):', updateErr);
        }
      }

      this.currentCall = call;
      this.activeCallIds.add(callId);
      console.log('[AudioCallService] Successfully created/joined audio call:', callId);
      return call;
    } catch (error) {
      console.error('[AudioCallService] Failed to create/join audio call:', error);
      throw error;
    }
  }

  public async endCall(): Promise<void> {
    if (this.currentCall) {
      const roomCode = this.currentCall.id;
      try {
        if (roomCode) {
          this.activeCallIds.delete(roomCode);
        }

        await this.currentCall.leave();
        console.log('[AudioCallService] Audio call ended successfully');

        // Update backend status to ended
        if (roomCode) {
          try {
            await endCallSession(roomCode);
          } catch (dbError) {
            console.error('[AudioCallService] Exception updating backend on call end:', dbError);
          }
        }
      } catch (error) {
        console.error('[AudioCallService] Error ending audio call:', error);
      }
      this.currentCall = null;
    }
  }

  public async toggleMute(): Promise<boolean> {
    if (this.currentCall) {
      try {
        await this.currentCall.microphone.toggle();
        console.log('[AudioCallService] Microphone toggled');
        return true;
      } catch (error) {
        console.error('[AudioCallService] Failed to toggle microphone:', error);
        return false;
      }
    }
    return false;
  }

  public isCallActive(): boolean {
    return this.currentCall !== null;
  }
}

export const audioCallService = AudioCallService.getInstance();

