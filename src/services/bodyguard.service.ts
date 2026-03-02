/**
 * LEGACY Bodyguard Service (src/services/)
 *
 * Service for booking bodyguard services.
 *
 * Consumers: useBodyguard hook.
 *
 * NOTE: There is a SEPARATE service at @/features/bodyguard/bodyguard.service
 * that provides the canonical CRUD API with proper types.
 *
 * TODO: Migrate useBodyguard to use @/features/bodyguard/bodyguard.service
 * and remove this file.
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import { parseFullDateLabel } from '@/utils/dateFormat';

export interface BookBodyguardData {
  city: string;
  numberOfGuards: number;
  bookingDate: string; // Formatted date string from DatePickerModal
  reason?: string;
  location?: string;
}

export interface BodyguardBooking {
  id: string;
  mobile_user_id: string;
  service_type: string;
  status: string;
  start_time: string;
  end_time: string;
  location: any; // JSONB
  description: string;
  assigned_agent_id?: string;
  created_at: string;
  updated_at?: string;
}

class BodyguardService {
  /**
   * Book a bodyguard service
   */
  async bookBodyguard(data: BookBodyguardData): Promise<BodyguardBooking> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) throw new Error('User not authenticated');

      // Parse the booking date
      let scheduledAt: string;
      try {
        // Parse the formatted date string from DatePickerModal
        // Format: "Friday, July 18, 2025"
        const parsedDate = parseFullDateLabel(data.bookingDate);
        
        if (isNaN(parsedDate.getTime())) {
          throw new Error('Invalid date format');
        }

        // Set to start of day (9 AM default for bodyguard service)
        parsedDate.setHours(9, 0, 0, 0);
        scheduledAt = parsedDate.toISOString();
      } catch (error) {
        console.error('Invalid booking date:', data.bookingDate, error);
        throw new Error('Please select a valid date for your booking');
      }

      // Calculate end_time (default to 8 hours after start_time)
      const startTime = new Date(scheduledAt);
      const endTime = new Date(startTime.getTime() + (8 * 60 * 60 * 1000)); // 8 hours later
      
      // Format location as jsonb
      const locationData: any = {
        city: data.city || null,
        address: data.location || data.city || null,
      };
      
      // Include number_of_guards in description since the table doesn't have that column
      const descriptionText = data.reason 
        ? `Number of guards: ${data.numberOfGuards}\n\nReason: ${data.reason}`
        : `Number of guards: ${data.numberOfGuards}`;
      
      // The old app service uses start_time/end_time, but database types show start_date/end_date
      // We'll use start_time/end_time as that's what the old app service actually uses
      const insertData: any = {
        mobile_user_id: user.id,
        service_type: 'bodyguard',
        status: 'pending',
        start_time: scheduledAt,
        end_time: endTime.toISOString(),
        location: locationData,
        description: descriptionText,
      };
      
      console.log('[Bodyguard Service] Inserting booking:', insertData);
      
      const { data: booking, error } = await supabase
        .from('bodyguard_bookings')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[Bodyguard Service] Error inserting booking:', error);
        throw error;
      }
      
      console.log('[Bodyguard Service] Booking created successfully:', booking.id);

      // Log the booking in incident_logs for audit trail (optional)
      try {
        await supabase
          .from('incident_logs')
          .insert({
            user_id: user.id,
            event_type: 'bodyguard_request',
            event_details: {
              booking_id: booking.id,
              city: data.city,
              number_of_guards: data.numberOfGuards,
              booking_date: data.bookingDate
            },
            timestamp: new Date().toISOString()
          });
      } catch (logError) {
        // Non-critical - log error but don't fail the booking
        console.warn('[Bodyguard Service] Failed to log to incident_logs:', logError);
      }

      return booking;
    } catch (error: any) {
      console.error('[Bodyguard Service] Error booking bodyguard:', error);
      throw error;
    }
  }

  /**
   * Get user's bodyguard bookings
   */
  async getUserBookings(): Promise<BodyguardBooking[]> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) throw new Error('User not authenticated');

      const { data: bookings, error } = await supabase
        .from('bodyguard_bookings')
        .select('*')
        .eq('mobile_user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Bodyguard Service] Error fetching bookings:', error);
        throw error;
      }
      
      return bookings || [];
    } catch (error) {
      console.error('[Bodyguard Service] Error fetching bookings:', error);
      throw error;
    }
  }

  /**
   * Cancel a bodyguard booking
   */
  async cancelBooking(bookingId: string): Promise<BodyguardBooking> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) throw new Error('User not authenticated');

      const { data: booking, error } = await supabase
        .from('bodyguard_bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .eq('mobile_user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('[Bodyguard Service] Error cancelling booking:', error);
        throw error;
      }
      
      return booking;
    } catch (error) {
      console.error('[Bodyguard Service] Error cancelling booking:', error);
      throw error;
    }
  }
}

export const bodyguardService = new BodyguardService();

