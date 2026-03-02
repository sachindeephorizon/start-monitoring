/**
 * Recurring check-in utilities
 * Handles creation of next recurring check-in instances
 */

import { CheckInFrequency } from '@/types/checkin';

export interface ScheduledCheckIn {
  id: string;
  date: string;
  time: string;
  frequency: CheckInFrequency;
  notes: string;
}

/**
 * Calculate the next occurrence for a recurring check-in
 */
export const calculateNextRecurrence = (
  scheduledAt: Date,
  frequency: CheckInFrequency
): Date | null => {
  if (frequency === 'One-time') {
    return null; // No recurrence for one-time check-ins
  }

  const nextDate = new Date(scheduledAt);
  
  if (frequency === 'Daily') {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === 'Weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  }

  return nextDate;
};

/**
 * Generate multiple future instances for recurring check-ins (for preview)
 */
export const generateFutureInstances = (
  scheduledAt: Date,
  frequency: CheckInFrequency,
  count: number = 3
): Date[] => {
  if (frequency === 'One-time') {
    return [];
  }

  const instances: Date[] = [];
  let currentDate = new Date(scheduledAt);

  for (let i = 0; i < count; i++) {
    const nextDate = calculateNextRecurrence(currentDate, frequency);
    if (nextDate) {
      instances.push(nextDate);
      currentDate = nextDate;
    }
  }

  return instances;
};

