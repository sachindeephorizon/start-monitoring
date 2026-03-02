/**
 * History Sections
 * 
 * Helper functions for grouping and organizing history items.
 */

import { HistoryItem, HistoryItemType, HistorySection } from './history.types';

/**
 * Group history items by type
 * 
 * Organizes history items into sections by type for UI display.
 * 
 * @param items History items to group
 * @returns Grouped history sections
 */
export function groupHistoryByType(items: HistoryItem[]): HistorySection[] {
  const sections: Record<HistoryItemType, HistoryItem[]> = {
    tracking: [],
    checkin: [],
    emergency: [],
    audio_call: [],
    video_call: [],
    bodyguard: [],
  };

  // Group items by type
  items.forEach((item) => {
    sections[item.type].push(item);
  });

  // Convert to section array with titles
  const sectionTitles: Record<HistoryItemType, string> = {
    tracking: 'Tracking Sessions',
    checkin: 'Check-Ins',
    emergency: 'Emergency Alerts',
    audio_call: 'Audio Calls',
    video_call: 'Video Calls',
    bodyguard: 'Bodyguard Bookings',
  };

  return Object.entries(sections)
    .filter(([_, items]) => items.length > 0)
    .map(([type, items]) => ({
      type: type as HistoryItemType,
      title: sectionTitles[type as HistoryItemType],
      items,
    }));
}

/**
 * Group history items by date
 * 
 * Organizes history items by date for chronological display.
 * 
 * @param items History items to group
 * @returns Items grouped by date (key: date string, value: items array)
 */
export function groupHistoryByDate(items: HistoryItem[]): Record<string, HistoryItem[]> {
  const grouped: Record<string, HistoryItem[]> = {};

  items.forEach((item) => {
    const date = new Date(item.started_at);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }

    grouped[dateKey].push(item);
  });

  // Sort items within each date group (most recent first)
  Object.keys(grouped).forEach((dateKey) => {
    grouped[dateKey].sort((a, b) => {
      const dateA = new Date(a.started_at).getTime();
      const dateB = new Date(b.started_at).getTime();
      return dateB - dateA;
    });
  });

  return grouped;
}

/**
 * Format date for display
 * 
 * @param dateString ISO date string
 * @returns Formatted date string
 */
export function formatHistoryDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (itemDate.getTime() === today.getTime()) {
    return 'Today';
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (itemDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // Format as "Jan 15, 2025"
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

