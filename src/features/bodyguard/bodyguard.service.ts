/**
 * Bodyguard Booking Service
 * 
 * Core bodyguard booking operations. This service handles CRUD operations only.
 * All booking coordination, assignment, and status management happens server-side.
 * 
 * iOS SAFETY:
 * - Booking creation is pure intent (server coordinates everything)
 * - No background logic or timers
 * - Status updates come from server via real-time or refresh
 * - Push notifications inform users of status changes
 * 
 * DESIGN PRINCIPLE:
 * > Bodyguard booking is pure intent + server workflow.
 * > The app never "tracks" or "waits".
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import {
  BodyguardBookingPayload,
  BodyguardBooking,
  BookingCreationResult,
  BookingStatus,
} from './bodyguard.types';

/**
 * Bodyguard Booking Service
 * 
 * Provides methods for bodyguard booking operations.
 * All coordination and workflow logic runs server-side.
 */
export const BodyguardService = {
  /**
   * Create a new bodyguard booking
   * 
   * Creates a booking request in the database.
   * The server will:
   * - Notify agents via push notifications
   * - Handle assignment workflow
   * - Update booking status
   * - Notify user of status changes
   * 
   * @param payload Booking payload
   * @returns Booking creation result
   */
  async create(payload: BodyguardBookingPayload): Promise<BookingCreationResult> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      // Prepare booking data
      const bookingData: any = {
        mobile_user_id: user.id,
        service_type: 'bodyguard',
        city: payload.city,
        number_of_guards: payload.number_of_guards,
        status: 'pending',
        description: payload.description || payload.reason || null,
        reason: payload.reason || null,
        special_requirements: payload.special_requirements || null,
      };

      // Add start/end times
      if (payload.start_date) {
        bookingData.start_date = payload.start_date;
      }
      if (payload.start_time) {
        bookingData.start_time = payload.start_time;
      }
      if (payload.end_date) {
        bookingData.end_date = payload.end_date;
      }
      if (payload.end_time) {
        bookingData.end_time = payload.end_time;
      }

      // Add location if provided
      if (payload.location) {
        bookingData.location = payload.location;
      }

      const { data, error } = await supabase
        .from('bodyguard_bookings')
        .insert(bookingData)
        .select('id')
        .single();

      if (error) {
        console.error('[Bodyguard Service] Failed to create booking:', error);
        return {
          success: false,
          error: error.message || 'Failed to create booking',
        };
      }

      if (!data?.id) {
        return {
          success: false,
          error: 'Booking created but no ID returned',
        };
      }

      console.log('[Bodyguard Service] Booking created successfully:', data.id);

      return {
        success: true,
        bookingId: data.id,
      };
    } catch (error: any) {
      console.error('[Bodyguard Service] Error creating booking:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Cancel a booking
   * 
   * Cancels a booking. Only pending or confirmed bookings can be cancelled.
   * 
   * @param bookingId Booking ID to cancel
   * @returns Success status
   */
  async cancel(bookingId: string): Promise<boolean> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return false;
      }

      // Get current booking to check status
      const { data: booking } = await supabase
        .from('bodyguard_bookings')
        .select('status')
        .eq('id', bookingId)
        .eq('mobile_user_id', user.id)
        .single();

      if (!booking) {
        return false;
      }

      // Only allow cancellation of pending or confirmed bookings
      if (booking.status !== 'pending' && booking.status !== 'confirmed') {
        console.warn('[Bodyguard Service] Cannot cancel booking with status:', booking.status);
        return false;
      }

      const { error } = await supabase
        .from('bodyguard_bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('mobile_user_id', user.id);

      if (error) {
        console.error('[Bodyguard Service] Failed to cancel booking:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Bodyguard Service] Error cancelling booking:', error);
      return false;
    }
  },

  /**
   * Get booking by ID
   * 
   * @param bookingId Booking ID
   * @returns Booking record, or null if not found
   */
  async getById(bookingId: string): Promise<BodyguardBooking | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('bodyguard_bookings')
        .select('*')
        .eq('id', bookingId)
        .eq('mobile_user_id', user.id)
        .single();

      if (error || !data) {
        return null;
      }

      return data as BodyguardBooking;
    } catch (error) {
      console.error('[Bodyguard Service] Error getting booking:', error);
      return null;
    }
  },

  /**
   * Get all bookings for current user
   * 
   * @param status Optional status filter
   * @returns Array of bookings
   */
  async getAll(status?: BookingStatus): Promise<BodyguardBooking[]> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return [];
      }

      let query = supabase
        .from('bodyguard_bookings')
        .select('*')
        .eq('mobile_user_id', user.id)
        .order('start_date', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error || !data) {
        return [];
      }

      return data as BodyguardBooking[];
    } catch (error) {
      console.error('[Bodyguard Service] Error getting bookings:', error);
      return [];
    }
  },

  /**
   * Get active booking (pending, confirmed, or active)
   * 
   * @returns Active booking, or null if none exists
   */
  async getActiveBooking(): Promise<BodyguardBooking | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('bodyguard_bookings')
        .select('*')
        .eq('mobile_user_id', user.id)
        .in('status', ['pending', 'confirmed', 'active'])
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data as BodyguardBooking;
    } catch (error) {
      console.error('[Bodyguard Service] Error getting active booking:', error);
      return null;
    }
  },
};

