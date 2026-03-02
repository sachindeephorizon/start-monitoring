/**
 * Stream Video Service Wrapper
 * 
 * Provides compatibility interface for StreamVideoCallDedicated component
 * Uses the new app's streamVideoClientService under the hood
 */

import { StreamVideoClient, Call, CallingState } from '@stream-io/video-react-native-sdk';
import { streamVideoClientService } from '@/features/video/video.client';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

class StreamVideoServiceDedicated {
  private static instance: StreamVideoServiceDedicated;
  private callInstance: Call | null = null;
  private connectLock: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): StreamVideoServiceDedicated {
    if (!StreamVideoServiceDedicated.instance) {
      StreamVideoServiceDedicated.instance = new StreamVideoServiceDedicated();
    }
    return StreamVideoServiceDedicated.instance;
  }

  public getClient(): StreamVideoClient | null {
    // Return client from the new service (synchronous getter)
    // The client should already be initialized
    return streamVideoClientService.client;
  }

  public getCurrentUser() {
    return streamVideoClientService.getCurrentUser();
  }

  public async initClient(): Promise<StreamVideoClient> {
    return await streamVideoClientService.initClient();
  }

  public async initializeUser(userId: string, userName?: string, skipBackoff: boolean = false): Promise<StreamVideoClient> {
    // Use connection lock to prevent concurrent connections
    if (this.connectLock) {
      logger.log('[StreamVideoServiceDedicated] Connection in progress, waiting...');
      await this.connectLock;
      const currentUser = this.getCurrentUser();
      const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_mobile';
      if (currentUser && currentUser.id === sanitizedUserId) {
        return this.getClient()!;
      }
    }

    // Create connection lock (a single promise representing the in-flight connect)
    this.connectLock = (async () => {
      await this.initClient();
      await streamVideoClientService.connectUser(userId, userName);
    })();

    try {
      await this.connectLock;
      return this.getClient()!;
    } finally {
      this.connectLock = null;
    }
  }

  public isConnecting(): boolean {
    return this.connectLock !== null;
  }

  public async waitForConnection(): Promise<void> {
    if (this.connectLock) {
      await this.connectLock;
    }
  }

  public preCreateCall(callId: string): Call | null {
    const client = this.getClient();
    if (!client) {
      return null;
    }
    try {
      const callType = process.env.EXPO_PUBLIC_STREAM_CALL_TYPE || 'default';
      const call = client.call(callType, callId);
      return call;
    } catch (error) {
      logger.warn('[StreamVideoServiceDedicated] Failed to pre-create call:', error);
      return null;
    }
  }

  public async createVideoCall(callId: string, create: boolean = true, preCreatedCall?: Call): Promise<Call> {
    const client = this.getClient();
    if (!client) {
      throw new Error('StreamVideoClient not initialized');
    }

    const callType = process.env.EXPO_PUBLIC_STREAM_CALL_TYPE || 'default';
    const call = preCreatedCall || client.call(callType, callId);

    try {
      // iOS: Disable camera/mic before join to avoid issues
      if (Platform.OS === 'ios') {
        try { await call.camera?.disable?.(); } catch { }
        try { await call.microphone?.disable?.(); } catch { }
        await new Promise(resolve => setTimeout(resolve, 120));
        try { await call.camera?.disable?.(); } catch { }
        try { await call.microphone?.disable?.(); } catch { }
      }

      // Join the call
      await call.join({
        create,
        ring: false,
        // Stream SDK JoinCallRequest uses `video` to indicate joining with video enabled.
        // Media is controlled via device managers after join.
        video: Platform.OS === 'ios' ? false : true,
      });

      this.callInstance = call;
      return call;
    } catch (error) {
      logger.error('[StreamVideoServiceDedicated] Failed to join video call:', error);
      throw error;
    }
  }

  public async cleanupCall(): Promise<void> {
    try {
      if (this.callInstance) {
        await this.callInstance.leave().catch(() => {});
        this.callInstance = null;
      }
    } catch (error) {
      logger.warn('[StreamVideoServiceDedicated] Call cleanup error:', error);
    }
  }

  public async preFetchToken(userId: string, userName?: string): Promise<void> {
    await streamVideoClientService.preFetchToken(userId, userName);
  }
}

export const streamVideoServiceDedicated = StreamVideoServiceDedicated.getInstance();

