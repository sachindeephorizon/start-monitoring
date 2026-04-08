/**
 * Stream.io Video Client Service
 * 
 * Manages Stream.io video client initialization and user connection.
 * This is a simplified version adapted for the new app's architecture.
 * 
 * iOS SAFETY: Video calls are foreground-only.
 */

import { StreamVideoClient, User } from '@stream-io/video-react-native-sdk';
import { hasWebRTCNativeModule, loadStreamVideoSdk } from '@/lib/streamVideoSdkLoader';
import { callSessionTokenGenerate } from '@/api/call-sessions';

class StreamVideoClientService {
  public client: StreamVideoClient | null = null; // Made public for wrapper access
  private currentUser: User | null = null;
  private cachedToken: string | null = null;
  private tokenExpiryTime: number = 0;
  private tokenInFlight: Promise<string> | null = null;
  private nextTokenOverride: string | null = null;

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

    // IMPORTANT: Must match backend token payload user_id exactly.
    const streamUserId = userId;

    // Check if already connected
    if (this.currentUser && this.currentUser.id === streamUserId) {
      console.log('[StreamVideoClient] Already connected as:', streamUserId);
      return;
    }

    // If a different user is connected, disconnect first
    if (this.currentUser) {
      try {
        await client.disconnectUser();
      } catch {
        // best-effort
      }
      this.currentUser = null;
    }

    try {
      // Generate token
      const token = await this.generateToken();

      // Create user object
      const user: User = {
        id: streamUserId,
        name: userName || userId,
        image: `https://robohash.org/${streamUserId}`,
      };

      console.log('[StreamVideoClient] Calling connectUser for:', streamUserId);
      await client.connectUser(user, token);
      this.currentUser = user;
      console.log('[StreamVideoClient] connectUser completed successfully');
    } catch (error: any) {
      console.error('[StreamVideoClient] connectUser failed:', error?.message ?? error);
      // Clear cached token so the next attempt fetches a fresh one
      this.cachedToken = null;
      this.tokenExpiryTime = 0;
      this.currentUser = null;
      throw error;
    }
  }

  /**
   * Sets a one-shot token override consumed by the next token generation call.
   * Used by emergency flow where backend returns a dedicated call token.
   */
  setNextTokenOverride(token: string): void {
    this.nextTokenOverride = token;
    // Keep cache in sync so immediate retries use the same token without another network call.
    this.cachedToken = token;
    this.tokenExpiryTime = Date.now() + 10 * 60 * 1000;
  }

  /**
   * Generate Stream.io token
   */
  private async generateToken(): Promise<string> {
    if (this.nextTokenOverride) {
      const override = this.nextTokenOverride;
      this.nextTokenOverride = null;
      return override;
    }

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
        const tokenResponse = await callSessionTokenGenerate();

        const token =
          typeof tokenResponse === 'string'
            ? tokenResponse
            : (tokenResponse as any)?.token ??
              (tokenResponse as any)?.streamToken ??
              (tokenResponse as any)?.accessToken;

        if (!token || typeof token !== 'string') {
          throw new Error('Token response missing token string');
        }

        // Cache token for a short period to avoid duplicate token requests.
        this.cachedToken = token;
        this.tokenExpiryTime = Date.now() + 55 * 60 * 1000;

        console.log('[StreamVideoClient] Token generated successfully');
        return token;
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
      await this.generateToken();
    } catch (error) {
      console.warn('[StreamVideoClient] Token prefetch failed (non-critical):', error);
    }
  }
}

export const streamVideoClientService = new StreamVideoClientService();

