/**
 * Tracking Guard Component
 * 
 * A React component that ensures location tracking features only
 * work when the required permissions are granted.
 * 
 * This is a simple wrapper around PermissionGuard for the tracking capability.
 */

import React from 'react';
import { PermissionGuard } from '@/core/permissions';

interface TrackingGuardProps {
  /**
   * Children to render when tracking permissions are granted
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
 * Tracking Guard Component
 * 
 * Ensures that tracking features only render when required permissions
 * (location_always and notifications) are granted.
 */
export function TrackingGuard({
  children,
  fallback,
  showLoading = true,
}: TrackingGuardProps) {
  return (
    <PermissionGuard
      capability="tracking"
      fallback={fallback}
      showLoading={showLoading}
    >
      {children}
    </PermissionGuard>
  );
}

