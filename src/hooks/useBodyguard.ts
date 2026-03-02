/**
 * Bodyguard Hook
 * 
 * Hook for managing bodyguard bookings
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { bodyguardService, BookBodyguardData, BodyguardBooking } from '@/services/bodyguard.service';
import { formatFullDateLabel } from '@/utils/dateFormat';
import { useAuth } from '@/core/auth';

export interface UseBodyguardReturn {
  // Form state
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  bodyguardReason: string;
  setBodyguardReason: (reason: string) => void;
  bodyguardCount: number;
  setBodyguardCount: (count: number) => void;
  bodyguardDate: string;
  setBodyguardDate: (date: string) => void;

  // Booking management
  bookings: BodyguardBooking[];
  isLoading: boolean;
  bookBodyguard: () => Promise<boolean>;
  cancelBooking: (bookingId: string) => Promise<boolean>;
  loadBookings: () => Promise<void>;
}

export function useBodyguard(): UseBodyguardReturn {
  const { isAuthReady } = useAuth();
  // Form state
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [bodyguardReason, setBodyguardReason] = useState<string>('');
  const [bodyguardCount, setBodyguardCount] = useState<number>(1);
  const [bodyguardDate, setBodyguardDate] = useState<string>(() => formatFullDateLabel(new Date()));

  // Booking management
  const [bookings, setBookings] = useState<BodyguardBooking[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load bookings
  const loadBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const userBookings = await bodyguardService.getUserBookings();
      setBookings(userBookings);
    } catch (error) {
      console.error('[useBodyguard] Error loading bookings:', error);
      setBookings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load bookings on mount (only when auth is ready)
  useEffect(() => {
    if (!isAuthReady) return;
    loadBookings();
  }, [isAuthReady, loadBookings]);

  // Book bodyguard
  const bookBodyguard = useCallback(async (): Promise<boolean> => {
    if (isLoading) return false;

    if (!selectedCity || !bodyguardReason.trim()) {
      Alert.alert('Missing Information', 'Please enter a city and provide a reason for booking.');
      return false;
    }

    // Validate date
    if (!bodyguardDate || bodyguardDate === 'Choose date...' || bodyguardDate.includes('Invalid')) {
      Alert.alert('Invalid Date', 'Please select a valid date using the date picker.');
      return false;
    }

    setIsLoading(true);

    try {
      const booking = await bodyguardService.bookBodyguard({
        city: selectedCity,
        numberOfGuards: bodyguardCount,
        bookingDate: bodyguardDate,
        reason: bodyguardReason.trim(),
        location: selectedCity,
      });

      Alert.alert(
        'Booking Confirmed',
        `Your bodyguard booking has been confirmed!\n\nBooking ID: ${booking.id}\nCity: ${selectedCity}\nBodyguards: ${bodyguardCount}\nDate: ${bodyguardDate}\n\nWe'll be in touch with you soon.`,
        [{ text: 'OK' }]
      );

      // Reload bookings
      await loadBookings();

      // Reset form
      setBodyguardReason('');
      setBodyguardCount(1);

      return true;
    } catch (error: any) {
      console.error('[useBodyguard] Error booking bodyguard:', error);
      Alert.alert('Booking Failed', error.message || 'There was an error processing your booking. Please try again.');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [selectedCity, bodyguardReason, bodyguardCount, bodyguardDate, isLoading, loadBookings]);

  // Cancel booking
  const cancelBooking = useCallback(async (bookingId: string): Promise<boolean> => {
    try {
      await bodyguardService.cancelBooking(bookingId);
      await loadBookings();
      Alert.alert('Booking Cancelled', 'Your bodyguard booking has been cancelled.');
      return true;
    } catch (error: any) {
      console.error('[useBodyguard] Error cancelling booking:', error);
      Alert.alert('Error', error.message || 'Failed to cancel booking. Please try again.');
      return false;
    }
  }, [loadBookings]);

  return {
    // Form state
    selectedCity,
    setSelectedCity,
    bodyguardReason,
    setBodyguardReason,
    bodyguardCount,
    setBodyguardCount,
    bodyguardDate,
    setBodyguardDate,

    // Booking management
    bookings,
    isLoading,
    bookBodyguard,
    cancelBooking,
    loadBookings,
  };
}

