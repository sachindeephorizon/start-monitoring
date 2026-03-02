/**
 * History Types
 * 
 * Type definitions for activity history functionality.
 * 
 * iOS SAFETY: History is read-only. No background execution, no permissions,
 * no lifecycle traps. Pure data presentation.
 * 
 * DESIGN PRINCIPLE:
 * > History is READ-ONLY. No business logic lives here.
 */

/**
 * History item types
 * 
 * Categories of historical events that can be displayed.
 */
export type HistoryItemType =
  | 'tracking'
  | 'checkin'
  | 'emergency'
  | 'audio_call'
  | 'video_call'
  | 'bodyguard';

/**
 * Generic history item structure
 * 
 * This is a UI-friendly representation of historical events.
 * Raw database records are transformed into this format for display.
 */
export interface HistoryItem {
  /**
   * Item ID
   */
  id: string;

  /**
   * Item type
   */
  type: HistoryItemType;

  /**
   * Display title for the item
   */
  title: string;

  /**
   * Status of the item
   */
  status: string;

  /**
   * When the item started/occurred
   */
  started_at: string;

  /**
   * When the item ended (if applicable)
   */
  ended_at?: string;

  /**
   * Additional metadata for UI display
   */
  metadata?: {
    description?: string;
    location?: any;
    duration?: number;
    [key: string]: any;
  };

  /**
   * Raw database record (optional, for detail views)
   */
  raw?: any;
}

/**
 * History filter options
 */
export interface HistoryFilter {
  /**
   * Filter by item type
   */
  type?: HistoryItemType;

  /**
   * Filter by status
   */
  status?: string;

  /**
   * Date range start
   */
  startDate?: string;

  /**
   * Date range end
   */
  endDate?: string;
}

/**
 * History section
 * 
 * Grouped history items by type.
 */
export interface HistorySection {
  type: HistoryItemType;
  title: string;
  items: HistoryItem[];
}

