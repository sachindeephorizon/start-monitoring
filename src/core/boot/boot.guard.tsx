/**
 * BootGuard
 *
 * A thin wrapper layer intended to sit between `App.tsx` and navigation.
 * The authoritative boot state machine lives in `AuthProvider` and is exposed via `useAuth()`.
 *
 * We keep this component as an explicit architecture boundary so boot-time concerns
 * (splash rendering, future preloads, crash recovery) do not leak into screens.
 */

import React from 'react';

type BootGuardProps = {
  children: React.ReactNode;
};

export function BootGuard({ children }: BootGuardProps) {
  return <>{children}</>;
}

