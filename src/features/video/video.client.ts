/**
 * Stream.io Video Client Service
 * 
 * Manages Stream.io video client initialization and user connection.
 * This is a simplified version adapted for the new app's architecture.
 * 
 * iOS SAFETY: Video calls are foreground-only.
 */

import { StreamVideoClient, User } from '@stream-io/video-react-native-sdk';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { streamTokenUrl } from '@/config/environment';
import { hasWebRTCNativeModule, loadStreamVideoSdk } from '@/lib/streamVideoSdkLoader';
import { Platform } from 'react-native';

class StreamVideoClientService {
  public client: StreamVideoClient | null = null; // Made public for wrapper access
  private currentUser: User | null = null;
  private cachedToken: string | null = null;
  private tokenExpiryTime: number = 0;
  private tokenInFlight: Promise<string> | null = null;

  /**
   * Initialize Stream.io video client
   */
  async initClient(): Promise<StreamVideoClient> {
    if (!hasWebRTCNativeModule) {
      throw new Error('WebRTC native module not available. Video calls are disabled in Expo Go builds.');
    }

    if (this.client) {
      return this.client;
    }

    const apiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY;
    if (!apiKey) {
      throw new Error('EXPO_PUBLIC_STREAM_API_KEY is not configured');
    }

    const sdk = loadStreamVideoSdk();
    if (!sdk) {
      throw new Error('Stream video SDK requires WebRTC native modules. Please install a development build.');
    }

    const { StreamVideoClient: StreamVideoClientCtor } = sdk;
    this.client = new StreamVideoClientCtor({
      apiKey,
      options: {
        logLevel: __DEV__ ? 'warn' : 'error',
      },
    });

    return this.client;
  }

  /**
   * Get or initialize client
   */
  async getClient(): Promise<StreamVideoClient> {
    if (this.client) {
      return this.client;
    }
    return await this.initClient();
  }

  /**
   * Connect user to Stream.io
   */
  async connectUser(userId: string, userName?: string): Promise<void> {
    const client = await this.getClient();

    // Sanitize user ID (add mobile suffix to match token generation)
    const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_mobile';

    // Check if already connected
    if (this.currentUser && this.currentUser.id === sanitizedUserId) {
      return;
    }

    // Generate token
    const token = await this.generateToken(userId, userName || userId);

    // Create user object
    const user: User = {
      id: sanitizedUserId,
      name: userName || userId,
      image: `https://robohash.org/${sanitizedUserId}`,
    };

    // Connect user
    await client.connectUser(user, token);
    this.currentUser = user;
  }

  /**
   * Generate Stream.io token
   */
  private async generateToken(userId: string, userName: string): Promise<string> {
    // Check cache
    if (this.cachedToken && Date.now() < this.tokenExpiryTime) {
      return this.cachedToken;
    }

    // Check if token fetch is in progress
    if (this.tokenInFlight) {
      return await this.tokenInFlight;
    }

    // Fetch new token
    this.tokenInFlight = (async () => {
      try {
        const session = await ensureValidSession();
        if (!session?.access_token) {
          throw new Error('No active session - cannot generate token');
        }

        const sanitizedUserId = userId.replace(/[@.]/g, '_').replace(/[^a-zA-Z0-9@_-]/g, '').toLowerCase() + '_mobile';

        const controller = new AbortController();
        const fetchTimeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(streamTokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            userId: sanitizedUserId,
            userName: userName,
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
          throw new Error('Invalid token response');
        }

        // Cache token (expires in 1 hour by default)
        this.cachedToken = tokenData.token;
        this.tokenExpiryTime = Date.now() + (tokenData.expires_in || 3600) * 1000;

        return tokenData.token;
      } finally {
        this.tokenInFlight = null;
      }
    })();

    return await this.tokenInFlight;
  }

  /**
   * Disconnect user
   */
  async disconnectUser(): Promise<void> {
    if (this.client && this.currentUser) {
      try {
        await this.client.disconnectUser();
      } catch (error) {
        console.error('[StreamVideoClient] Error disconnecting user:', error);
      }
      this.currentUser = null;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Pre-fetch token (for faster call start)
   */
  async preFetchToken(userId: string, userName?: string): Promise<void> {
    try {
      await this.generateToken(userId, userName || userId);
    } catch (error) {
      console.warn('[StreamVideoClient] Token prefetch failed (non-critical):', error);
    }
  }
}

export const streamVideoClientService = new StreamVideoClientService();

