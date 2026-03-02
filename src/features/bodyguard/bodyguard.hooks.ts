/**
 * Bodyguard Booking Hooks
 * 
 * React hooks for bodyguard booking functionality.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/core/auth';
import { BodyguardService } from './bodyguard.service';
import {
  BodyguardBooking,
  BodyguardBookingPayload,
  BookingCreationResult,
  BookingStatus,
} from './bodyguard.types';

/**
 * Hook for bodyguard booking operations
 * 
 * Provides methods to create, cancel, and manage bookings.
 * 
 * @returns Booking state and methods
 */
export function useBodyguardBookings() {
  const { isAuthReady } = useAuth();
  const [loading, setLoading] = useState(false);
  const [bookings, setBookings] = useState<BodyguardBooking[]>([]);
  const [activeBooking, setActiveBooking] = useState<BodyguardBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load all bookings
   */
  const loadBookings = useCallback(async (status?: BookingStatus) => {
    setLoading(true);
    setError(null);

    try {
      const bookingList = await BodyguardService.getAll(status);
      setBookings(bookingList);

      // Also load active booking
      const active = await BodyguardService.getActiveBooking();
      setActiveBooking(active);
    } catch (err: any) {
      console.error('[Bodyguard Hook] Error loading bookings:', err);
      setError(err.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load bookings on mount (only when auth is ready)
   */
  useEffect(() => {
    if (!isAuthReady) return;
    loadBookings();
  }, [isAuthReady, loadBookings]);

  /**
   * Create a new booking
   * 
   * @param payload Booking payload
   * @returns Booking creation result
   */
  const createBooking = useCallback(
    async (payload: BodyguardBookingPayload): Promise<BookingCreationResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await BodyguardService.create(payload);

        // Refresh bookings if successful
        if (result.success) {
          await loadBookings();
        }

        return result;
      } catch (err: any) {
        console.error('[Bodyguard Hook] Error creating booking:', err);
        const errorMessage = err.message || 'Failed to create booking';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    [loadBookings]
  );

  /**
   * Cancel a booking
   * 
   * @param bookingId Booking ID to cancel
   * @returns Success status
   */
  const cancelBooking = useCallback(
    async (bookingId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const success = await BodyguardService.cancel(bookingId);

        // Refresh bookings if successful
        if (success) {
          await loadBookings();
        }

        return success;
      } catch (err: any) {
        console.error('[Bodyguard Hook] Error cancelling booking:', err);
        setError(err.message || 'Failed to cancel booking');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loadBookings]
  );

  /**
   * Get booking by ID
   * 
   * @param bookingId Booking ID
   * @returns Booking record, or null
   */
  const getBookingById = useCallback(async (bookingId: string): Promise<BodyguardBooking | null> => {
    try {
      return await BodyguardService.getById(bookingId);
    } catch (error) {
      console.error('[Bodyguard Hook] Error getting booking:', error);
      return null;
    }
  }, []);

  /**
   * Refresh bookings
   */
  const refreshBookings = useCallback(() => {
    loadBookings();
  }, [loadBookings]);

  return {
    loading,
    bookings,
    activeBooking,
    error,
    hasActiveBooking: activeBooking !== null,
    createBooking,
    cancelBooking,
    getBookingById,
    refreshBookings,
    loadBookings,
  };
}

