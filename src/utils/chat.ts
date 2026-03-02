/**
 * Chat utility functions
 * Pure functions for chat message handling and formatting
 */

/**
 * Formats a date object to a chat timestamp string
 * @param date - Date object to format
 * @returns Formatted time string like "3:45 PM"
 */
export const formatChatTime = (date: Date): string => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
};

