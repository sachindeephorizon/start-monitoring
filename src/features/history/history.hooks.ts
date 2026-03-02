/**
 * History Hooks
 * 
 * React hooks for activity history functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import { HistoryService } from './history.service';
import { HistoryItem, HistoryItemType, HistoryFilter } from './history.types';

/**
 * Hook for fetching all history
 * 
 * Fetches all historical activity data and transforms it into UI-friendly format.
 * 
 * @param filter Optional filter to apply
 * @returns History state and methods
 */
export function useHistory(filter?: HistoryFilter) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load history data
   */
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const historyItems = await HistoryService.getAll(filter);
      setItems(historyItems);
    } catch (err: any) {
      console.error('[History Hook] Error loading history:', err);
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  /**
   * Load history on mount and when filter changes
   */
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /**
   * Refresh history
   */
  const refreshHistory = useCallback(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    loading,
    items,
    error,
    refreshHistory,
  };
}

/**
 * Hook for fetching history by type
 * 
 * Fetches historical data for a specific type.
 * 
 * @param type History item type
 * @returns History state and methods
 */
export function useHistoryByType(type: HistoryItemType) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filter: HistoryFilter = { type };
      const historyItems = await HistoryService.getAll(filter);
      setItems(historyItems);
    } catch (err: any) {
      console.error('[History Hook] Error loading history by type:', err);
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const refreshHistory = useCallback(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    loading,
    items,
    error,
    refreshHistory,
  };
}

