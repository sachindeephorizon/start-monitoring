/**
 * Audio Call Service (src/services/ — Stream SDK integration)
 *
 * Manages Stream Video SDK client, user init, call creation/join/end.
 * Used by AudioCallInterface component and HomeScreen for direct SDK calls.
 *
 * NOTE: There is a SEPARATE service at @/features/audio/audio.service
 * that handles DB-level call session CRUD (create/update session records).
 * The features/ service does NOT manage the Stream SDK — it only talks to Supabase.
 *
 * Both services are needed: this one for real-time audio, features/ for persistence.
 */

import type { StreamVideoClient, User, Call } from '@stream-io/video-react-native-sdk';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { Platform } from 'react-native';
import {
  hasWebRTCNativeModule,
  loadStreamVideoSdk,
  type StreamVideoSdkModule,
} from '@/lib/streamVideoSdkLoader';
import { configureAudioSession } from '@/utils/audioSession';
import { getCachedUser } from '@/services/sessionCache';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

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
  private cachedTokenUserId: string | null = null;
  private tokenExpiryTime: number = 0;
  private tokenInFlightByUser = new Map<string, Promise<string>>();
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

    // Sanitize user ID for Stream compatibility
    const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_audio';

    // Check if already connected as this user
    if (this.currentUser && this.currentUser.id === sanitizedUserId) {
      console.log('[AudioCallService] Already connected as user:', sanitizedUserId);
      return;
    }

    try {
      console.log('[AudioCallService] Connecting user for audio call:', sanitizedUserId);

      // Disconnect previous user if connected as different user
      if (this.currentUser && this.currentUser.id !== sanitizedUserId) {
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
      const token = await this.generateAudioToken(userId, userName || userId);

      if (!token) {
        throw new Error('Failed to generate audio token');
      }

      // Create user object
      const user: User = {
        id: sanitizedUserId,
        name: userName || userId,
        image: `https://robohash.org/${sanitizedUserId}`,
      };

      // Connect the user
      await this.client.connectUser(user, token);
      this.currentUser = user;

      console.log('[AudioCallService] User connected successfully for audio call:', sanitizedUserId);
    } catch (error) {
      console.error('[AudioCallService] Failed to connect user for audio call:', error);
      this.currentUser = null;
      throw error;
    }
  }

  private async generateAudioToken(userId: string, userName: string, forceRefresh: boolean = false): Promise<string> {
    try {
      const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_audio';

      // Check cache
      const currentSanitizedId = this.cachedTokenUserId || this.currentUser?.id || '';
      if (!forceRefresh && this.cachedToken && Date.now() < this.tokenExpiryTime && currentSanitizedId === sanitizedUserId) {
        console.log('[AudioCallService] Using cached audio token for user:', sanitizedUserId);
        return this.cachedToken;
      }

      if (!forceRefresh) {
        const existing = this.tokenInFlightByUser.get(sanitizedUserId);
        if (existing) {
          console.log('[AudioCallService] Audio token fetch already in-flight, awaiting:', sanitizedUserId);
          return await existing;
        }
      }

      const fetchPromise = (async () => {
        console.log('[AudioCallService] Generating new audio token for user:', sanitizedUserId);

        // Get Supabase session
        const session = await ensureValidSession();
        if (!session?.access_token) {
          console.error('[AudioCallService] No Supabase session');
          throw new Error('No active session - cannot generate audio token');
        }

        let originalUserId = session?.user?.id || '';
        if (!originalUserId) {
          console.error('[AudioCallService] No user in session - cannot generate audio token');
          throw new Error('No authenticated user - cannot generate audio token');
        }

        // Generate token via API
        // Use video-token endpoint as fallback if audio-token doesn't exist
        const tokenUrl = `${apiBaseUrl}/api/stream/audio-token`;
        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: originalUserId,
            userName: userName,
            sanitizedUserId: sanitizedUserId,
          }),
          signal: controller.signal,
        });
        clearTimeout(fetchTimeout);

        if (!response.ok) {
          throw new Error(`Token generation failed: ${response.statusText}`);
        }

        const raw = await response.json();
        // API returns { success, data: { token, ... } } or { token } directly
        const tokenData = raw.data || raw;
        if (!tokenData.token) {
          throw new Error('Invalid audio token response from server');
        }

        // Cache token for 1 hour
        this.cachedToken = tokenData.token;
        this.tokenExpiryTime = Date.now() + (60 * 60 * 1000);
        this.cachedTokenUserId = sanitizedUserId;

        console.log('[AudioCallService] Audio token generated successfully for user:', sanitizedUserId);
        return tokenData.token;
      })();

      if (!forceRefresh) {
        this.tokenInFlightByUser.set(sanitizedUserId, fetchPromise);
      }

      try {
        return await fetchPromise;
      } finally {
        this.tokenInFlightByUser.delete(sanitizedUserId);
      }
    } catch (error) {
      console.error('[AudioCallService] Failed to generate audio token:', error);
      this.cachedToken = null;
      this.tokenExpiryTime = 0;
      this.cachedTokenUserId = null;
      throw error;
    }
  }

  public async initializeUser(userId: string, userName?: string): Promise<StreamVideoClient> {
    if (!hasWebRTCNativeModule) {
      throw new Error('WebRTC native module not available. Audio calls are disabled in Expo Go builds.');
    }

    try {
      const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_audio';
      if (this.currentUser && this.currentUser.id === sanitizedUserId && this.client) {
        console.log('[AudioCallService] User already initialized and connected:', sanitizedUserId);
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
      console.error('[AudioCallService] Cannot join call - user not connected');
      try {
        let authUser: any = getCachedUser();
        if (!authUser) {
          const validSession = await ensureValidSession();
          authUser = validSession?.user || null;
        }
        // Removed getUser() fallback - getSession() is sufficient and avoids triggering SIGNED_OUT
        if (authUser) {
          console.log('[AudioCallService] Attempting to connect user before creating call...');
          await this.initializeUser(authUser.id, authUser.email || authUser.id);
          if (!this.currentUser) {
            throw new Error('Failed to connect user after initialization attempt');
          }
        } else {
          throw new Error('No authenticated user found');
        }
      } catch (initError) {
        console.error('[AudioCallService] Failed to initialize user:', initError);
        throw new Error('User not connected to Stream Video. Please initialize user first.');
      }
    }

    try {
      console.log('[AudioCallService] Creating audio call:', callId);

      // Create database record for agent dashboard notification
      if (create) {
        try {
          let authUser: any = getCachedUser();
          if (!authUser) {
            const validSession = await ensureValidSession();
            authUser = validSession?.user || null;
          }
          // Removed getUser() fallback - ensureValidSession() is sufficient and avoids triggering SIGNED_OUT

          if (authUser) {
            const userName = this.currentUser?.name || authUser.email || authUser.user_metadata?.name || 'User';

            let sessionId: string;
            try {
              sessionId = uuidv4();
            } catch (uuidError) {
              console.warn('[AudioCallService] UUID package failed, using fallback generator:', uuidError);
              sessionId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
              });
            }

            const sessionData = {
              id: sessionId,
              call_type: 'audio_call',
              mobile_user_id: authUser.id,
              room_code: callId,
              user_name: userName,
              status: 'initiating',
              agent_joined: false,
              priority: 'high',
              context_reason: 'User initiated audio call',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

            // Check for existing session
            const { data: existingSession } = await supabase
              .from('call_sessions')
              .select('id, status, created_at')
              .eq('room_code', callId)
              .eq('call_type', 'audio_call')
              .in('status', ['initiating', 'connecting', 'connected', 'active'])
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (!existingSession) {
              const { error: sessionError } = await supabase
                .from('call_sessions')
                .insert(sessionData)
                .select()
                .single();

              if (sessionError) {
                console.error('[AudioCallService] Failed to create call session in database:', sessionError);
              } else {
                console.log('[AudioCallService] Call session created in database successfully');
              }
            } else {
              console.log('[AudioCallService] Call session already exists, skipping duplicate insert');
            }
          }
        } catch (dbError) {
          console.error('[AudioCallService] Exception creating database record:', dbError);
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

      // Update database status to 'connected'
      if (create && this.currentUser) {
        try {
          await supabase
            .from('call_sessions')
            .update({
              status: 'connected',
              updated_at: new Date().toISOString()
            })
            .eq('room_code', callId)
            .eq('call_type', 'audio_call');
        } catch (updateErr) {
          console.warn('[AudioCallService] Error updating call session status (non-critical):', updateErr);
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

        // Update database status to 'ended'
        if (roomCode) {
          try {
            await supabase
              .from('call_sessions')
              .update({
                status: 'ended',
                ended_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              })
              .eq('room_code', roomCode)
              .eq('call_type', 'audio_call');
          } catch (dbError) {
            console.error('[AudioCallService] Exception updating database on call end:', dbError);
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

