/**
 * Permission Hooks
 * 
 * React hooks for permission management in UI components.
 * These hooks provide easy access to permission checking and requesting
 * from React components.
 * 
 * iOS SAFETY: These hooks never perform background operations.
 * They only trigger permission requests when called from user interactions.
 */

import { useState, useEffect, useCallback } from 'react';
import { PermissionStatus, AppPermission, Capability } from './permission.types';
import { CAPABILITY_REQUIREMENTS } from './permission.constants';
import { PermissionService } from './permission.service';

/**
 * Hook to check and request a single permission
 * 
 * @param permission The permission to manage
 * @returns Object with permission status and request function
 */
export function usePermission(permission: AppPermission) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Check permission status on mount and when permission changes
  useEffect(() => {
    let mounted = true;

    async function checkPermission() {
      setLoading(true);
      const currentStatus = await PermissionService.check(permission);
      if (mounted) {
        setStatus(currentStatus);
        setLoading(false);
      }
    }

    checkPermission();

    return () => {
      mounted = false;
    };
  }, [permission]);

  // Request permission function
  const request = useCallback(async () => {
    setLoading(true);
    const newStatus = await PermissionService.request(permission);
    setStatus(newStatus);
    setLoading(false);
    return newStatus;
  }, [permission]);

  return {
    status,
    loading,
    granted: status === 'granted',
    denied: status === 'denied',
    blocked: status === 'blocked',
    unavailable: status === 'unavailable',
    request,
  };
}

/**
 * Hook to manage capability-based permissions
 * 
 * This hook checks all required permissions for a capability and provides
 * a single function to request all of them.
 * 
 * @param capability The capability to manage
 * @returns Object with capability status and request function
 */
export function useCapabilityPermission(capability: Capability) {
  const requiredPermissions = CAPABILITY_REQUIREMENTS[capability];
  const [granted, setGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if all required permissions are granted
  useEffect(() => {
    let mounted = true;

    async function checkCapability() {
      setLoading(true);
      const hasAll = await PermissionService.hasAllPermissions(requiredPermissions);
      if (mounted) {
        setGranted(hasAll);
        setLoading(false);
      }
    }

    checkCapability();

    return () => {
      mounted = false;
    };
  }, [capability, requiredPermissions.join(',')]);

  /**
   * Request all required permissions for this capability
   * 
   * Requests permissions in sequence and stops at the first denial.
   * 
   * @returns true if all permissions were granted, false otherwise
   */
  const requestCapability = useCallback(async (): Promise<boolean> => {
    setLoading(true);

    // Request permissions in sequence
    for (const permission of requiredPermissions) {
      const status = await PermissionService.request(permission);
      if (status !== 'granted') {
        // If any permission is denied, stop and return false
        setGranted(false);
        setLoading(false);
        return false;
      }
    }

    // All permissions granted
    setGranted(true);
    setLoading(false);
    return true;
  }, [requiredPermissions]);

  /**
   * Re-check capability status (useful after user goes to settings)
   */
  const recheck = useCallback(async () => {
    setLoading(true);
    const hasAll = await PermissionService.hasAllPermissions(requiredPermissions);
    setGranted(hasAll);
    setLoading(false);
  }, [requiredPermissions]);

  return {
    granted,
    loading,
    canUse: granted === true,
    requestCapability,
    recheck,
    requiredPermissions,
  };
}

/**
 * Hook to check multiple permissions at once
 * 
 * Useful for components that need to know the status of multiple permissions.
 * 
 * @param permissions Array of permissions to check
 * @returns Object with permission statuses and request functions
 */
export function useMultiplePermissions(permissions: AppPermission[]) {
  const [statuses, setStatuses] = useState<Record<AppPermission, PermissionStatus>>({} as any);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkPermissions() {
      setLoading(true);
      const results = await PermissionService.checkMultiple(permissions);
      if (mounted) {
        const statusMap = results.reduce((acc, result) => {
          acc[result.permission] = result.status;
          return acc;
        }, {} as Record<AppPermission, PermissionStatus>);
        setStatuses(statusMap as any);
        setLoading(false);
      }
    }

    checkPermissions();

    return () => {
      mounted = false;
    };
  }, [permissions.join(',')]);

  const request = useCallback(async (permission: AppPermission) => {
    const status = await PermissionService.request(permission);
    setStatuses((prev) => ({ ...prev, [permission]: status }));
    return status;
  }, []);

  return {
    statuses,
    loading,
    request,
  };
}

