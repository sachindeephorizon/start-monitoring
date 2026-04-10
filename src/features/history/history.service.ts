/**
 * History Service
 * 
 * Read-only queries for activity history. This service fetches historical
 * data from various tables but never mutates anything.
 * 
 * iOS SAFETY: History is read-only. No background logic, no real-time
 * required (optional foreground realtime only). Pure data presentation.
 * 
 * DESIGN PRINCIPLE:
 * > History is READ-ONLY. No business logic lives here.
 * > The server already decided everything.
 */

import { getUserHistory } from '@/api/user';
import { HistoryItem, HistoryItemType, HistoryFilter } from './history.types';

// Re-export types for convenience
export type { HistoryItem, HistoryItemType, HistoryFilter };

/**
 * History Service
 * 
 * Provides read-only methods for fetching historical activity data.
 */
export const HistoryService = {
  _normalizeStatus(status?: string): string {
    const raw = (status || '').toUpperCase();
    switch (raw) {
      case 'ACTIVE':
      case 'IN_PROGRESS':
      case 'ONGOING':
        return 'active';
      case 'RESOLVED':
      case 'COMPLETED':
      case 'ENDED':
      case 'SUCCESS':
        return 'completed';
      case 'CANCELLED':
      case 'CANCELED':
        return 'cancelled';
      case 'ESCALATED':
        return 'escalated';
      default:
        return (status || 'unknown').toLowerCase();
    }
  },

  _normalizeCallType(callType?: string): HistoryItemType {
    const value = (callType || '').toLowerCase();
    return value === 'audio' || value === 'audio_call' ? 'audio_call' : 'video_call';
  },

  /**
   * Get all emergencies for current user
   * 
   * @returns Array of emergency records
   */
  async getEmergencies(_userId?: string): Promise<any[]> {
    try {
      const buckets = await getUserHistory();
      return buckets?.emergencies ?? [];
    } catch (error) {
      console.error('[History Service] Error getting emergencies:', error);
      return [];
    }
  },

  async getCheckIns(_userId?: string): Promise<any[]> {
    try {
      const buckets = await getUserHistory();
      return buckets?.checkins ?? [];
    } catch (error) {
      console.error('[History Service] Error getting check-ins:', error);
      return [];
    }
  },

  async getTrackingSessions(_userId?: string): Promise<any[]> {
    try {
      const buckets = await getUserHistory();
      return buckets?.trackingSessions ?? [];
    } catch (error) {
      console.error('[History Service] Error getting tracking sessions:', error);
      return [];
    }
  },

  async getCalls(_userId?: string): Promise<any[]> {
    try {
      const buckets = await getUserHistory();
      return buckets?.calls ?? [];
    } catch (error) {
      console.error('[History Service] Error getting calls:', error);
      return [];
    }
  },

  async getBodyguardBookings(_userId?: string): Promise<any[]> {
    try {
      const buckets = await getUserHistory();
      return buckets?.bodyguardBookings ?? [];
    } catch (error) {
      console.error('[History Service] Error getting bodyguard bookings:', error);
      return [];
    }
  },

  /**
   * Fetch all history buckets from backend.
   * Endpoint: GET /v1/users/history (resolved via API config versioning)
   */
  async _getAllFromBackend(): Promise<{
    emergencies: any[];
    checkins: any[];
    trackingSessions: any[];
    calls: any[];
    bodyguardBookings: any[];
  }> {
    try {
      const data = await getUserHistory();
      return {
        emergencies: data?.emergencies ?? [],
        checkins: data?.checkins ?? [],
        trackingSessions: data?.trackingSessions ?? [],
        calls: data?.calls ?? [],
        bodyguardBookings: data?.bodyguardBookings ?? [],
      };
    } catch (error) {
      throw error;
    }
  },

  /**
   * Transform raw table data into HistoryItem format.
   */
  _transformToHistoryItems(
    emergencies: any[],
    checkins: any[],
    trackingSessions: any[],
    calls: any[],
    bodyguardBookings: any[],
    filter?: HistoryFilter
  ): HistoryItem[] {
    const items: HistoryItem[] = [];

    emergencies.forEach((item) => {
      items.push({
        id: item.id,
        type: 'emergency',
        title: 'Emergency Alert',
        status: this._normalizeStatus(item.status),
        started_at: item.triggeredAt || item.createdAt,
        ended_at: item.resolvedAt || item.cancelledAt,
        metadata: {
          description: item.resolutionNote,
          callSession: item.callSession,
        },
        raw: item,
      });
    });

    checkins.forEach((item) => {
      items.push({
        id: item.id,
        type: 'checkin',
        title: 'Check-In',
        status: this._normalizeStatus(item.status),
        started_at: item.startAt || item.createdAt,
        ended_at: item.endAt || item.lastRunAt,
        metadata: {
          remarks: item.remarks,
          frequency: item.frequency,
          intervalMinutes: item.intervalMinutes,
          escalationEnabled: item.escalationEnabled,
        },
        raw: item,
      });
    });

    trackingSessions.forEach((item) => {
      items.push({
        id: item.id,
        type: 'tracking',
        title: 'Tracking Session',
        status: this._normalizeStatus(item.status),
        started_at: item.startAt || item.createdAt,
        ended_at: item.endAt || item.lastRunAt,
        metadata: {
          frequency: item.frequency,
          intervalMinutes: item.intervalMinutes,
          escalationEnabled: item.escalationEnabled,
        },
        raw: item,
      });
    });

    calls.forEach((item) => {
      const callType = this._normalizeCallType(item.callType);
      const duration = item.startedAt && item.endedAt
        ? new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()
        : undefined;

      items.push({
        id: item.id,
        type: callType as HistoryItemType,
        title: `${callType === 'audio_call' ? 'Audio' : 'Video'} Call`,
        status: this._normalizeStatus(item.status),
        started_at: item.startedAt || item.createdAt,
        ended_at: item.endedAt,
        metadata: {
          callType: item.callType,
          duration: duration ? Math.floor(duration / 1000) : undefined,
          priority: item.priority,
          serviceType: item.serviceType,
          isEscalated: item.isEscalated,
          escalationReason: item.escalationReason,
          agent: item.agent,
          callId: item.callId,
        },
        raw: item,
      });
    });

    bodyguardBookings.forEach((item) => {
      items.push({
        id: item.id,
        type: 'bodyguard',
        title: 'Bodyguard Booking',
        status: this._normalizeStatus(item.status),
        started_at: item.bookingDate || item.createdAt,
        ended_at: undefined,
        metadata: {
          reason: item.reason,
          city: item.city,
          numberOfBodyguards: item.numberOfBodyguards,
          agentRemarks: item.agentRemarks,
          updatedByAgent: item.updatedByAgent,
        },
        raw: item,
      });
    });

    // Apply filters
    let filteredItems = items;

    if (filter?.type) {
      filteredItems = filteredItems.filter((item) => item.type === filter.type);
    }
    if (filter?.status) {
      filteredItems = filteredItems.filter((item) => item.status === filter.status);
    }
    if (filter?.startDate) {
      filteredItems = filteredItems.filter((item) => item.started_at >= filter.startDate!);
    }
    if (filter?.endDate) {
      filteredItems = filteredItems.filter((item) => item.started_at <= filter.endDate!);
    }

    // Sort by started_at (most recent first)
    filteredItems.sort((a, b) => {
      const dateA = new Date(a.started_at).getTime();
      const dateB = new Date(b.started_at).getTime();
      return dateB - dateA;
    });

    return filteredItems;
  },

  /**
   * Get all history items
   *
   * Fetches all history buckets from backend and transforms into UI-friendly format.
   *
   * @param filter Optional filter to apply
   * @returns Array of history items
   */
  async getAll(filter?: HistoryFilter): Promise<HistoryItem[]> {
    try {
      const {
        emergencies,
        checkins,
        trackingSessions,
        calls,
        bodyguardBookings,
      } = await this._getAllFromBackend();

      return this._transformToHistoryItems(
        emergencies, checkins, trackingSessions, calls, bodyguardBookings, filter
      );
    } catch (error) {
      console.error('[History Service] Error getting all history:', error);
      return [];
    }
  },

  /**
   * Get user history (alias for getAll for compatibility)
   * 
   * @param filter Optional filter to apply
   * @returns Array of history items
   */
  async getUserHistory(filter?: HistoryFilter): Promise<HistoryItem[]> {
    return this.getAll(filter);
  },
};

