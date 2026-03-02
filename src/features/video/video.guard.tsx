/**
 * Video Call Guard Component
 * 
 * A React component that ensures video call features only work when
 * required permissions are granted.
 * 
 * This is a wrapper around PermissionGuard for the video_call capability.
 */

import React from 'react';
import { PermissionGuard } from '@/core/permissions';

interface VideoGuardProps {
  /**
   * Children to render when video call permissions are granted
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
 * Video Call Guard Component
 * 
 * Ensures that video call features only render when required permissions
 * (camera and microphone) are granted.
 */
export function VideoGuard({
  children,
  fallback,
  showLoading = true,
}: VideoGuardProps) {
  return (
    <PermissionGuard
      capability="video_call"
      fallback={fallback}
      showLoading={showLoading}
    >
      {children}
    </PermissionGuard>
  );
}

