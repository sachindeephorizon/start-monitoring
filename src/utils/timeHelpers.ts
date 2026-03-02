/**
 * Enhanced time utilities for check-in system
 * Handles time calculations and recurring check-in scheduling
 */

/**
 * Check if a date is today
 */
export const isToday = (date: Date): boolean => {
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

/**
 * Check if a date is tomorrow
 */
export const isTomorrow = (date: Date): boolean => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
};

/**
 * Format a date in a user-friendly way
 */
export const formatUserFriendlyDate = (dateString: string): string => {
  try {
    // Try to parse the date string - handle various formats
    let date: Date;
    
    // Check if it's our standard format "Day, Month DD, YYYY"
    if (dateString.includes(',')) {
      const parts = dateString.split(', ');
      if (parts.length === 3) {
        // "Friday, July 18, 2025"
        const [dayName, monthDay, year] = parts;
        const [month, day] = monthDay.split(' ');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
        const monthIndex = monthNames.indexOf(month);
        if (monthIndex !== -1) {
          date = new Date(parseInt(year), monthIndex, parseInt(day));
        } else {
          date = new Date(dateString);
        }
      } else {
        date = new Date(dateString);
      }
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
      return dateString; // Return original if parsing fails
    }

    if (isToday(date)) {
      return 'Today';
    } else if (isTomorrow(date)) {
      return 'Tomorrow';
    } else {
      // Return day name and date for this week, or full date for future
      const diffDays = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      }
    }
  } catch (error) {
    console.error('Error formatting date:', error, dateString);
    return dateString;
  }
};

/**
 * Get a human-readable relative time description
 */
export const getRelativeTimeDescription = (date: Date): string => {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    return 'Overdue';
  } else if (diffHours < 1) {
    const diffMinutes = Math.round(diffMs / (1000 * 60));
    return diffMinutes <= 1 ? 'In 1 minute' : `In ${diffMinutes} minutes`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? 'In 1 hour' : `In ${diffHours} hours`;
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays < 7) {
    return `In ${diffDays} days`;
  } else {
    const diffWeeks = Math.round(diffDays / 7);
    return diffWeeks === 1 ? 'Next week' : `In ${diffWeeks} weeks`;
  }
};

