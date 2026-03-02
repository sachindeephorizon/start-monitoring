/**
 * Audio Call Guard Component
 * 
 * A React component that ensures audio call features only work when
 * required permissions are granted.
 * 
 * This is a wrapper around PermissionGuard for the audio_call capability.
 */

import React from 'react';
import { PermissionGuard } from '@/core/permissions';

interface AudioGuardProps {
  /**
   * Children to render when audio call permissions are granted
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
 * Audio Call Guard Component
 * 
 * Ensures that audio call features only render when required permissions
 * (microphone) are granted.
 */
export function AudioGuard({
  children,
  fallback,
  showLoading = true,
}: AudioGuardProps) {
  return (
    <PermissionGuard
      capability="audio_call"
      fallback={fallback}
      showLoading={showLoading}
    >
      {children}
    </PermissionGuard>
  );
}

