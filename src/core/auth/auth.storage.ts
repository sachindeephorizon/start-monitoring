/**
 * Auth Storage
 *
 * Production rule:
 * - Supabase persists sessions in AsyncStorage (auto-refresh support)
 * - We persist a minimal session snapshot in SecureStore (crash / process-death safe)
 *
 * This module provides a small abstraction used by the app boot state machine.
 */

import { AuthSession } from './auth.session';

export const AuthStorage = {
  async clear(): Promise<void> {
    await AuthSession.clear();
  },

  async exists(): Promise<boolean> {
    return AuthSession.exists();
  },
};

