/**
 * Settings Hooks
 * 
 * React hooks for settings functionality.
 */

import { useState, useCallback, useEffect } from 'react';
import { SettingsService } from './settings.service';
import {
  PermissionStatusEntry,
  NotificationPreference,
  AppInfo,
  AccountDeletionResult,
} from './settings.types';

/**
 * Hook for permission statuses
 * 
 * @returns Permission statuses and refresh function
 */
export function usePermissionStatuses() {
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<PermissionStatusEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const permissionStatuses = await SettingsService.getPermissionStatuses();
      setStatuses(permissionStatuses);
    } catch (err: any) {
      console.error('[Settings Hook] Error loading permission statuses:', err);
      setError(err.message || 'Failed to load permission statuses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const openSettings = useCallback(async (): Promise<boolean> => {
    return await SettingsService.openSettings();
  }, []);

  return {
    loading,
    statuses,
    error,
    refreshStatuses: loadStatuses,
    openSettings,
  };
}

/**
 * Hook for notification preferences
 * 
 * @returns Notification preferences and update function
 */
export function useNotificationPreferences() {
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const prefs = await SettingsService.getNotificationPreferences();
      setPreferences(prefs);
    } catch (err: any) {
      console.error('[Settings Hook] Error loading notification preferences:', err);
      setError(err.message || 'Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const updatePreference = useCallback(
    async (type: string, enabled: boolean): Promise<boolean> => {
      setLoading(true);
      setError(null);

      try {
        const success = await SettingsService.updateNotificationPreference(type, enabled);
        if (success) {
          // Reload preferences to get updated state
          await loadPreferences();
        }
        return success;
      } catch (err: any) {
        console.error('[Settings Hook] Error updating notification preference:', err);
        setError(err.message || 'Failed to update preference');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loadPreferences]
  );

  return {
    loading,
    preferences,
    error,
    refreshPreferences: loadPreferences,
    updatePreference,
  };
}

/**
 * Hook for app information
 * 
 * @returns App info
 */
export function useAppInfo(): AppInfo {
  return SettingsService.getAppInfo();
}

/**
 * Hook for account operations
 * 
 * @returns Account operation functions
 */
export function useAccountOperations() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteAccount = useCallback(async (): Promise<AccountDeletionResult> => {
    setLoading(true);
    setError(null);

    try {
      const result = await SettingsService.deleteAccount();
      if (!result.success) {
        setError(result.error || 'Failed to delete account');
      }
      return result;
    } catch (err: any) {
      console.error('[Settings Hook] Error deleting account:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    deleteAccount,
  };
}

