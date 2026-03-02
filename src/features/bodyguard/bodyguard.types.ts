/**
 * Bodyguard Booking Types
 * 
 * Type definitions for bodyguard booking functionality.
 * 
 * iOS SAFETY: Bodyguard booking is pure intent + server workflow.
 * The app never "tracks" or "waits" - all coordination happens server-side.
 */

/**
 * Booking status values
 * 
 * These match the database schema and represent the lifecycle of a booking.
 */
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled';

/**
 * Service type
 */
export type ServiceType = 'bodyguard';

/**
 * Location data structure
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  address?: string;
  description?: string;
}

/**
 * Bodyguard booking payload for creating a booking
 */
export interface BodyguardBookingPayload {
  /**
   * City where service is needed
   */
  city: string;

  /**
   * Number of bodyguards required (1 or more)
   */
  number_of_guards: number;

  /**
   * Service start date/time
   */
  start_date: string; // ISO 8601 timestamp

  /**
   * Service start time (alternative field)
   */
  start_time?: string; // ISO 8601 timestamp

  /**
   * Service end date/time
   */
  end_date?: string; // ISO 8601 timestamp

  /**
   * Service end time (alternative field)
   */
  end_time?: string; // ISO 8601 timestamp

  /**
   * Service location (pickup location)
   */
  location?: LocationData;

  /**
   * Booking description (includes reason and number of guards)
   */
  description?: string;

  /**
   * Reason for bodyguard requirement
   */
  reason?: string;

  /**
   * Special requirements or instructions
   */
  special_requirements?: string;
}

/**
 * Bodyguard booking record from database
 */
export interface BodyguardBooking {
  id: string;
  mobile_user_id: string;
  service_type: ServiceType;
  city?: string;
  number_of_guards?: number;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  location?: any; // JSONB
  description?: string;
  reason?: string;
  special_requirements?: string;
  status: BookingStatus;
  assigned_agent_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Bodyguard assignment record
 */
export interface BodyguardAssignment {
  id: string;
  booking_id: string;
  guard_id: string;
  client_name: string;
  client_contact: string;
  pickup_location: any; // JSONB
  drop_location: any; // JSONB
  start_time: string;
  end_time?: string;
  special_instructions?: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

/**
 * Booking creation result
 */
export interface BookingCreationResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

