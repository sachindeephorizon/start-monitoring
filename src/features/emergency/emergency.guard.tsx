/**
 * Emergency Guard Component
 * 
 * A React component that ensures emergency features only work when
 * required permissions are granted.
 * 
 * This is a simple wrapper around PermissionGuard for the emergency capability.
 */

import React from 'react';
import { PermissionGuard } from '@/core/permissions';

interface EmergencyGuardProps {
  /**
   * Children to render when emergency permissions are granted
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
 * Emergency Guard Component
 * 
 * Ensures that emergency features only render when required permissions
 * (location_when_in_use and notifications) are granted.
 */
export function EmergencyGuard({
  children,
  fallback,
  showLoading = true,
}: EmergencyGuardProps) {
  return (
    <PermissionGuard
      capability="emergency"
      fallback={fallback}
      showLoading={showLoading}
    >
      {children}
    </PermissionGuard>
  );
}

