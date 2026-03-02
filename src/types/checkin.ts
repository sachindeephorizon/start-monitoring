/**
 * Check-in system type definitions
 * Contains interfaces and types for scheduled check-ins and time management
 */

export interface CheckInTime {
  hours: number;
  minutes: number;
  period: 'AM' | 'PM';
}

export interface ScheduledCheckIn {
  id: string;
  date: string;
  time: string;
  frequency: 'One-time' | 'Daily' | 'Weekly';
  notes: string;
}

/**
 * Check-in status types for ongoing check-in processes
 */
export type CheckInStatus = 'calling' | 'connected' | 'completed' | null;

/**
 * Check-in frequency options
 */
export type CheckInFrequency = 'One-time' | 'Daily' | 'Weekly';

