/**
 * Simple Call Service
 * 
 * Basic call management with database integration.
 * Adapted from old app for new app architecture.
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import { VideoCallService } from '@/features/video/video.service';

export interface SimpleCallSession {
  id: string;
  callType: 'video' | 'audio';
  roomCode: string;
  userName: string;
  status: 'active' | 'ended';
  createdAt: string;
}

export interface SimpleCallConfig {
  callType: 'video' | 'audio';
  userName: string;
  reason: string;
  emergencyId?: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
}

class SimpleCallService {
  private activeSessions: Map<string, SimpleCallSession> = new Map();

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Create a simple call session with user-specific room
   */
  async createCallSession(
    config: SimpleCallConfig,
    options?: { sessionId?: string; roomCode?: string; userId?: string }
  ): Promise<SimpleCallSession> {
    const sessionId = options?.sessionId || this.generateUUID();

    // Get current user (with session validation)
    const authSession = await ensureValidSession();
    const user = authSession?.user;
    if (!user) {
      throw new Error('No authenticated user');
    }

    const userId = options?.userId || user.id;

    // Get user profile for name
    const { data: userProfile } = await supabase
      .from('mobile_users')
      .select('name')
      .eq('id', userId)
      .single();

    const userName = config.userName || userProfile?.name || user.email || 'User';

    // Create call session using VideoCallService
    const result = await VideoCallService.createCallSession(
      undefined, // agentId
      config.reason,
      config.priority || 'medium'
    );

    if (!result.success || !result.callSessionId) {
      throw new Error(result.error || 'Failed to create call session');
    }

    // Get call session to get room code
    const session = await VideoCallService.getCallSession(result.callSessionId);
    if (!session) {
      throw new Error('Failed to retrieve call session');
    }

    const simpleSession: SimpleCallSession = {
      id: result.callSessionId,
      callType: config.callType,
      roomCode: session.room_code,
      userName: userName,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this.activeSessions.set(simpleSession.id, simpleSession);
    return simpleSession;
  }

  /**
   * Start a call - update database to notify dashboard
   */
  async startCall(session: SimpleCallSession): Promise<boolean> {
    try {
      // Small delay to ensure database insert has propagated
      await new Promise(resolve => setTimeout(resolve, 300));

      // Update the call session status to 'active' to notify dashboard
      await VideoCallService.updateCallStatus(session.id, 'active');

      return true;
    } catch (error) {
      console.error('[SimpleCall] Error starting call:', error);
      return false;
    }
  }

  /**
   * End a call
   */
  async endCall(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      this.activeSessions.delete(sessionId);

      // Update database entry
      try {
        await VideoCallService.updateCallStatus(sessionId, 'ended');
      } catch (error) {
        console.error('[SimpleCall] Database error:', error);
      }

      console.log('[SimpleCall] Call ended:', sessionId);
    }
  }

  /**
   * Get active session
   */
  getActiveSession(sessionId: string): SimpleCallSession | null {
    return this.activeSessions.get(sessionId) || null;
  }
}

export const simpleCallService = new SimpleCallService();

