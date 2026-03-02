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

import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { HistoryItem, HistoryItemType, HistoryFilter } from './history.types';

// Re-export types for convenience
export type { HistoryItem, HistoryItemType, HistoryFilter };

/**
 * History Service
 * 
 * Provides read-only methods for fetching historical activity data.
 */
export const HistoryService = {
  /**
   * Get all emergencies for current user
   * 
   * @returns Array of emergency records
   */
  async getEmergencies(userId?: string): Promise<any[]> {
    try {
      const uid = userId || (await ensureValidSession())?.user?.id;
      if (!uid) return [];

      const { data, error } = await supabase
        .from('emergencies')
        .select('id, status, triggered_at, created_at, resolved_at, description, location, priority')
        .eq('mobile_user_id', uid)
        .order('triggered_at', { ascending: false });

      return (!error && data) ? data : [];
    } catch (error) {
      console.error('[History Service] Error getting emergencies:', error);
      return [];
    }
  },

  async getCheckIns(userId?: string): Promise<any[]> {
    try {
      const uid = userId || (await ensureValidSession())?.user?.id;
      if (!uid) return [];

      const { data, error } = await supabase
        .from('checkins')
        .select('id, status, scheduled_at, created_at, checked_in_at, notes, location_at_checkin')
        .eq('mobile_user_id', uid)
        .order('scheduled_at', { ascending: false });

      return (!error && data) ? data : [];
    } catch (error) {
      console.error('[History Service] Error getting check-ins:', error);
      return [];
    }
  },

  async getTrackingSessions(userId?: string): Promise<any[]> {
    try {
      const uid = userId || (await ensureValidSession())?.user?.id;
      if (!uid) return [];

      const { data, error } = await supabase
        .from('tracking_sessions')
        .select('id, status, start_time, created_at, completed_at, end_time, session_name, last_known_location, initial_location')
        .eq('mobile_user_id', uid)
        .order('start_time', { ascending: false });

      return (!error && data) ? data : [];
    } catch (error) {
      console.error('[History Service] Error getting tracking sessions:', error);
      return [];
    }
  },

  async getCalls(userId?: string): Promise<any[]> {
    try {
      const uid = userId || (await ensureValidSession())?.user?.id;
      if (!uid) return [];

      const { data, error } = await supabase
        .from('call_sessions')
        .select('id, status, call_type, started_at, created_at, ended_at, priority, room_code')
        .eq('mobile_user_id', uid)
        .order('created_at', { ascending: false });

      return (!error && data) ? data : [];
    } catch (error) {
      console.error('[History Service] Error getting calls:', error);
      return [];
    }
  },

  async getBodyguardBookings(userId?: string): Promise<any[]> {
    try {
      const uid = userId || (await ensureValidSession())?.user?.id;
      if (!uid) return [];

      const { data, error } = await supabase
        .from('bodyguard_bookings')
        .select('id, status, start_time, end_time, created_at, location, description, service_type')
        .eq('mobile_user_id', uid)
        .order('created_at', { ascending: false });

      return (!error && data) ? data : [];
    } catch (error) {
      console.error('[History Service] Error getting bodyguard bookings:', error);
      return [];
    }
  },

  /**
   * Fetch all history data via dashboard proxy.
   * Throws on failure so caller can fall back to direct Supabase.
   */
  async _getAllViaProxy(accessToken: string): Promise<{
    emergencies: any[];
    checkins: any[];
    trackingSessions: any[];
    calls: any[];
    bodyguardBookings: any[];
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${apiBaseUrl}/api/mobile/history`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Proxy error: ${res.status}`);
      }

      const json = await res.json();
      const data = json?.data || json;
      return {
        emergencies: data?.emergencies ?? [],
        checkins: data?.checkins ?? [],
        trackingSessions: data?.trackingSessions ?? [],
        calls: data?.calls ?? [],
        bodyguardBookings: data?.bodyguardBookings ?? [],
      };
    } catch (e: any) {
      clearTimeout(timeoutId);
      throw e;
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
        status: item.status || 'unknown',
        started_at: item.triggered_at || item.created_at,
        ended_at: item.resolved_at,
        metadata: {
          description: item.description,
          location: item.location,
          priority: item.priority,
        },
        raw: item,
      });
    });

    checkins.forEach((item) => {
      items.push({
        id: item.id,
        type: 'checkin',
        title: 'Check-In',
        status: item.status || 'unknown',
        started_at: item.scheduled_at || item.created_at,
        ended_at: item.checked_in_at,
        metadata: {
          notes: item.notes,
          location: item.location_at_checkin,
        },
        raw: item,
      });
    });

    trackingSessions.forEach((item) => {
      items.push({
        id: item.id,
        type: 'tracking',
        title: item.session_name || 'Tracking Session',
        status: item.status || 'unknown',
        started_at: item.start_time || item.created_at,
        ended_at: item.completed_at || item.end_time,
        metadata: {
          description: item.session_name,
          location: item.last_known_location || item.initial_location,
        },
        raw: item,
      });
    });

    calls.forEach((item) => {
      const callType = item.call_type === 'audio_call' ? 'audio_call' : 'video_call';
      const duration = item.started_at && item.ended_at
        ? new Date(item.ended_at).getTime() - new Date(item.started_at).getTime()
        : undefined;

      items.push({
        id: item.id,
        type: callType as HistoryItemType,
        title: `${item.call_type === 'audio_call' ? 'Audio' : 'Video'} Call`,
        status: item.status || 'unknown',
        started_at: item.started_at || item.created_at,
        ended_at: item.ended_at,
        metadata: {
          call_type: item.call_type,
          duration: duration ? Math.floor(duration / 1000) : undefined,
          priority: item.priority,
          room_code: item.room_code,
        },
        raw: item,
      });
    });

    bodyguardBookings.forEach((item) => {
      items.push({
        id: item.id,
        type: 'bodyguard',
        title: 'Bodyguard Booking',
        status: item.status || 'unknown',
        started_at: item.start_time || item.created_at,
        ended_at: item.end_time,
        metadata: {
          description: item.description,
          service_type: item.service_type,
          location: item.location,
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
   * Fetches all historical data and transforms it into UI-friendly format.
   * Proxy-first: uses dashboard API (always reachable via Vercel), falls back to direct Supabase.
   *
   * @param filter Optional filter to apply
   * @returns Array of history items
   */
  async getAll(filter?: HistoryFilter): Promise<HistoryItem[]> {
    try {
      // Single ensureValidSession call — avoids 5 parallel calls all contending on the SDK lock
      const session = await ensureValidSession();
      const userId = session?.user?.id;
      if (!userId) return [];

      const accessToken = (session as any)?.access_token;

      let emergencies: any[] = [];
      let checkins: any[] = [];
      let trackingSessions: any[] = [];
      let calls: any[] = [];
      let bodyguardBookings: any[] = [];
      let dataFetched = false;

      // Proxy-first: dashboard API is always reachable via Vercel
      if (accessToken) {
        try {
          const proxyData = await this._getAllViaProxy(accessToken);
          emergencies = proxyData.emergencies;
          checkins = proxyData.checkins;
          trackingSessions = proxyData.trackingSessions;
          calls = proxyData.calls;
          bodyguardBookings = proxyData.bodyguardBookings;
          dataFetched = true;
          console.log('[History Service] Data fetched via dashboard proxy');
        } catch (proxyErr: any) {
          console.warn('[History Service] Proxy failed, falling back to direct Supabase:', proxyErr?.message);
        }
      }

      // Fallback: try direct Supabase
      if (!dataFetched) {
        try {
          const [emergenciesRes, checkinsRes, trackingRes, callsRes, bookingsRes] = await Promise.all([
            supabase.from('emergencies').select('id, status, triggered_at, created_at, resolved_at, description, location, priority').eq('mobile_user_id', userId).order('triggered_at', { ascending: false }),
            supabase.from('checkins').select('id, status, scheduled_at, created_at, checked_in_at, notes, location_at_checkin').eq('mobile_user_id', userId).order('scheduled_at', { ascending: false }),
            supabase.from('tracking_sessions').select('id, status, start_time, created_at, completed_at, end_time, session_name, last_known_location, initial_location').eq('mobile_user_id', userId).order('start_time', { ascending: false }),
            supabase.from('call_sessions').select('id, status, call_type, started_at, created_at, ended_at, priority, room_code').eq('mobile_user_id', userId).order('created_at', { ascending: false }),
            supabase.from('bodyguard_bookings').select('id, status, start_time, end_time, created_at, location, description, service_type').eq('mobile_user_id', userId).order('created_at', { ascending: false }),
          ]);

          emergencies = emergenciesRes.data || [];
          checkins = checkinsRes.data || [];
          trackingSessions = trackingRes.data || [];
          calls = callsRes.data || [];
          bodyguardBookings = bookingsRes.data || [];
        } catch (directErr: any) {
          console.error('[History Service] Direct Supabase fetch also failed:', directErr?.message);
        }
      }

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

