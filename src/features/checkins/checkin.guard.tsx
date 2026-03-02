/**
 * Check-In Guard Component
 * 
 * A React component that ensures check-in features only work when
 * required permissions are granted.
 * 
 * This is a simple wrapper around PermissionGuard for the check_in capability.
 */

import React from 'react';
import { PermissionGuard } from '@/core/permissions';

interface CheckInGuardProps {
  /**
   * Children to render when check-in permissions are granted
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when permissions are not granted
   */
  fallback?: React.ReactNode;

  /**
   * Show loading state while checking permissions
   * Default: true
   */
  showLoading?: boolean;
}

/**
 * Check-In Guard Component
 * 
 * Ensures that check-in features only render when required permissions
 * (notifications) are granted.
 */
export function CheckInGuard({
  children,
  fallback,
  showLoading = true,
}: CheckInGuardProps) {
  return (
    <PermissionGuard
      capability="check_in"
      fallback={fallback}
      showLoading={showLoading}
    >
      {children}
    </PermissionGuard>
  );
}

