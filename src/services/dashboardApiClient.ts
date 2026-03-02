/**
 * Dashboard API Client
 * 
 * Client for communicating with the DeepHorizon Dashboard API.
 * This bypasses RLS policies by using server-side API endpoints.
 */

import { apiBaseUrl } from '@/config/environment';
import { supabase } from '@/lib/supabase';
import { AuthSession } from '@/core/auth/auth.session';

export interface AssignmentRequest {
  type: 'emergency' | 'video_call' | 'chat' | 'tracking_session' | 'checkin';
  mobileUserId: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
  category?: string;
  location?: any;
  description?: string;
  sessionId?: string;
  checkinId?: string;
  emergencyId?: string;
  chatRequestId?: string;
}

export interface AssignmentResult {
  success: boolean;
  assignedAgentId: string | null;
  error?: string;
  assignmentStrategy: string;
  timestamp: string;
}

export interface EmergencyCreateRequest {
  mobileUserId: string;
  description?: string;
  location?: { lat: number; lng: number };
  priority?: 'emergency' | 'high' | 'medium' | 'low';
}

/**
 * ✅ Type-safe response interface for emergency creation
 */
export interface EmergencyCreateResponse {
  success: boolean;
  emergencyId?: string;
  error?: string;
}

/**
 * ✅ Type guard to validate emergency API response
 */
function isEmergencyCreateResponse(data: unknown): data is EmergencyCreateResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.success === 'boolean';
}

export interface VideoCallRequest {
  userId: string;
  userName?: string;
  userPhone?: string;
}

export interface ChatInitiateRequest {
  mobileUserId: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
  userLocation?: any;
  userInfo?: { name?: string; phone?: string };
  initialMessage?: string;
}

class DashboardApiClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
    if (__DEV__) console.log('🔗 Dashboard API base URL:', this.baseUrl);
  }

  /**
   * ✅ CRITICAL FIX: Get current auth token with expiration validation
   *
   * IMPORTANT: We use getSession() (not refreshSession()) because:
   * - refreshSession() triggers SIGNED_OUT events during the call
   * - This disrupts auth state and clears React component state
   * - Caller (HomeScreen) should refresh session BEFORE calling this
   * - We validate expiration and warn if token is expired
   * - If token is truly invalid, the API will reject it gracefully
   *
   * This prevents video call UI from being cleared during emergency flow.
   */
  private async _getValidToken(): Promise<string | null> {
    try {
      // Get current session with timeout protection against SDK lock contention.
      // Timeout: 3s to match ensureValidSession — the SDK auth lock can take 1-2s
      // on cold start. The previous 1s timeout caused frequent false-positive
      // "Not authenticated" errors during emergency creation.
      if (__DEV__) console.log('[DashboardApiClient] Getting auth token...');
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise<null>((resolve) => setTimeout(() => {
          console.warn('[DashboardApiClient] getSession timed out (6s)');
          resolve(null);
        }, 6000)),
      ]);
      let session = sessionResult?.data?.session ?? null;

      // SDK lock held — fall back to SecureStore token for emergency operations
      if (!session?.access_token) {
        try {
          const stored = await AuthSession.load();
          if (stored?.access_token && stored?.user?.id) {
            console.log('[DashboardApiClient] SDK lock held — using SecureStore fallback');
            return stored.access_token;
          }
        } catch (e) {
          console.warn('[DashboardApiClient] SecureStore fallback failed:', e);
        }
        console.error('[DashboardApiClient] ❌ No session available');
        return null;
      }

      // Validate session is not expired
      const expiresAt = session.expires_at || 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const secondsLeft = expiresAt - nowSec;

      if (secondsLeft <= 0) {
        console.error('[DashboardApiClient] ❌ Session expired', secondsLeft, 'seconds ago');
        console.error('[DashboardApiClient] Caller should refresh session before API calls');
        return null;
      }

      if (secondsLeft < 60) {
        console.warn('[DashboardApiClient] ⚠️ Token expires soon (', secondsLeft, 'seconds left)');
      }

      if (__DEV__) console.log('[DashboardApiClient] ✅ Token retrieved successfully (expires in', secondsLeft, 'seconds)');
      return session.access_token;
    } catch (error) {
      console.error('[DashboardApiClient] ❌ Error getting token:', error);
      return null;
    }
  }

  /**
   * ✅ CRITICAL FIX: Type-safe return type (was using 'any')
   */
  async createEmergency(request: EmergencyCreateRequest, preValidatedToken?: string): Promise<EmergencyCreateResponse> {
    try {
      console.log('[DashboardApiClient] 🚨 Creating emergency...');
      if (__DEV__) console.log('[DashboardApiClient] Request:', request);
      if (__DEV__) console.log('[DashboardApiClient] Target URL:', `${this.baseUrl}/api/emergency/create`);

      // Use pre-validated token if available (avoids redundant getSession() call
      // that contends on SDK auth lock). Fall back to fetching a fresh token.
      const accessToken = preValidatedToken || await this._getValidToken();

      if (!accessToken) {
        console.error('[DashboardApiClient] ❌ No auth token available');
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const result = await this._makeEmergencyRequest(request, accessToken);
      return result;
    } catch (error: any) {
      console.error('[DashboardApiClient] ❌ Emergency creation failed with exception');
      console.error('[DashboardApiClient] Error type:', error?.name);
      console.error('[DashboardApiClient] Error message:', error?.message);
      if (error?.name === 'AbortError') {
        console.error('[DashboardApiClient] Request was aborted (timeout)');
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * ✅ Extracted HTTP request logic for reusability
   */
  private async _makeEmergencyRequest(request: EmergencyCreateRequest, accessToken: string): Promise<EmergencyCreateResponse> {
    if (__DEV__) console.log('[DashboardApiClient] Making emergency request with token...');

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('[DashboardApiClient] ⏱️ Request timed out after 8 seconds');
      controller.abort();
    }, 8000); // 8 second timeout

    const response = await fetch(`${this.baseUrl}/api/emergency/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (__DEV__) console.log('[DashboardApiClient] Response status:', response.status);

    // Check HTTP status BEFORE parsing JSON — non-JSON error pages (502, 504) would throw SyntaxError
    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}: Failed to create emergency`;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) errorMsg = errorBody.error;
      } catch {
        // Response body was not JSON (e.g. HTML error page) — use the status-based message
      }
      console.error('[DashboardApiClient] Request failed:', errorMsg);
      throw new Error(errorMsg);
    }

    /**
     * Type-safe response validation
     * Parse and validate the response structure before using it
     */
    const rawResult: unknown = await response.json();
    if (__DEV__) console.log('[DashboardApiClient] Response body:', rawResult);

    // Validate response structure
    if (!isEmergencyCreateResponse(rawResult)) {
      console.error('[DashboardApiClient] Invalid response format:', rawResult);
      throw new Error('Invalid response format from dashboard API');
    }

    const result: EmergencyCreateResponse = rawResult;

    // The API returns { success, data: { emergency: { id: "..." }, ... } }
    // Extract the ID from the nested structure.
    if (!result.emergencyId) {
      const raw = rawResult as Record<string, any>;
      const emergencyId = raw.data?.emergency?.id || raw.emergency?.id;
      if (emergencyId) {
        result.emergencyId = emergencyId;
      }
    }

    console.log('[DashboardApiClient] ✅ Emergency created successfully');
    return result;
  }

  async requestVideoCall(request: VideoCallRequest): Promise<{ success: boolean; sessionId?: string; userId?: string; error?: string }> {
    try {
      // Get fresh auth token (prevents "not authenticated" errors)
      const accessToken = await this._getValidToken();

      if (!accessToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(`${this.baseUrl}/api/video-call-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to request video call');
      }
      return result;
    } catch (error) {
      console.error('[DashboardApiClient] Video call request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async assignAgent(request: AssignmentRequest): Promise<AssignmentResult> {
    try {
      // Get fresh auth token (prevents "not authenticated" errors)
      const accessToken = await this._getValidToken();

      if (!accessToken) {
        return {
          success: false,
          assignedAgentId: null,
          error: 'Not authenticated',
          assignmentStrategy: 'failed',
          timestamp: new Date().toISOString(),
        };
      }

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(`${this.baseUrl}/api/assignment/route`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const raw = await response.json();
      if (!response.ok) {
        throw new Error(raw?.error || (raw?.data?.error) || 'Failed to assign agent');
      }

      // API returns { success, data: { assignment } } or flat { success, assignment }
      const result = raw?.data || raw;
      if (raw?.success && result?.assignment) {
        return result.assignment as AssignmentResult;
      }

      return {
        success: false,
        assignedAgentId: null,
        error: 'Assignment failed',
        assignmentStrategy: 'failed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[DashboardApiClient] Agent assignment failed:', error);
      return {
        success: false,
        assignedAgentId: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        assignmentStrategy: 'failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async initiateChat(request: ChatInitiateRequest): Promise<{
    success: boolean;
    chatRequestId?: string;
    assignedAgentId?: string | null;
    status?: 'pending' | 'assigned' | 'active';
    message?: string;
    error?: string;
  }> {
    try {
      // Get fresh auth token (prevents "not authenticated" errors)
      const accessToken = await this._getValidToken();

      if (!accessToken) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(`${this.baseUrl}/api/chat/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Failed to initiate chat');
      }
      return result;
    } catch (error) {
      console.error('[DashboardApiClient] Chat initiation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const dashboardApiClient = new DashboardApiClient();

