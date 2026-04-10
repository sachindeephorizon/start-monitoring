/**
 * Bodyguard Hook
 * 
 * Hook for managing bodyguard bookings
 */

import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import {
  BodyguardBookingDto,
  createBodyguardBooking,
  getMyBodyguardBookings,
} from '@/api/bodyguard-booking';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';
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
  bookings: BodyguardBookingDto[];
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
  const [bookings, setBookings] = useState<BodyguardBookingDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load bookings
  const loadBookings = useCallback(async () => {
    try {
      setIsLoading(true);
      const userBookings = await getMyBodyguardBookings();
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
      const parsedDate = parseFullDateLabel(bodyguardDate);
      parsedDate.setHours(9, 0, 0, 0);

      const response = await createBodyguardBooking({
        city: selectedCity.trim(),
        date: parsedDate.toISOString(),
        reason: bodyguardReason.trim(),
        numberOfBodyguards: bodyguardCount,
      });
      const booking = response.data;

      Alert.alert(
        'Booking Confirmed',
        `Your bodyguard booking has been confirmed!\n\nBooking ID: ${booking.id}\nCity: ${booking.city}\nBodyguards: ${booking.numberOfBodyguards}\nDate: ${bodyguardDate}\n\nWe'll be in touch with you soon.`,
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
    console.warn('[useBodyguard] cancelBooking is not available for customer API.', bookingId);
    Alert.alert('Not Available', 'Booking cancellation is not available at the moment.');
    return false;
  }, []);

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

