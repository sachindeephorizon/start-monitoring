/**
 * Chat Guard Component
 * 
 * A React component that ensures chat features only work when
 * the user is authenticated.
 * 
 * Chat does not require special permissions - only authentication.
 */

import React from 'react';
import { AuthGuard } from '@/core/auth';

interface ChatGuardProps {
  /**
   * Children to render when user is authenticated
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when not authenticated
   */
  fallback?: React.ReactNode;
}

/**
 * Chat Guard Component
 * 
 * Ensures that chat features only render when the user is authenticated.
 * Chat does not require special permissions beyond authentication.
 */
export function ChatGuard({
  children,
  fallback,
}: ChatGuardProps) {
  return (
    <AuthGuard fallback={fallback}>
      {children}
    </AuthGuard>
  );
}

