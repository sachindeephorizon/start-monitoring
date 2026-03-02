/**
 * Authentication Hooks
 * 
 * React hooks for authentication operations.
 * Provides easy access to auth state and methods from React components.
 */

import { useContext } from 'react';
import { AuthContext } from './auth.context';
import { AuthService } from './auth.service';
import { SignInCredentials, SignUpCredentials, AuthUser } from './auth.types';

/**
 * Hook to access authentication context
 * 
 * Provides the current auth state and methods for authentication operations.
 * 
 * @returns Auth context value with state and methods
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * Hook to check if user is authenticated
 * 
 * @returns true if user is authenticated, false otherwise
 */
export function useIsAuthenticated(): boolean {
  const auth = useAuth();
  return auth.status === 'authenticated';
}

/**
 * Hook to get current authenticated user
 * 
 * @returns Current user if authenticated, null otherwise
 */
export function useCurrentUser(): AuthUser | null {
  const auth = useAuth();
  if (auth.status === 'authenticated') {
    return auth.user;
  }
  return null;
}

/**
 * Hook to get authentication methods
 * 
 * Returns methods for sign in, sign up, and sign out operations.
 * These methods are bound to the auth service.
 */
export function useAuthMethods() {
  return {
    signIn: (credentials: SignInCredentials) => AuthService.signIn(credentials),
    signUp: (credentials: SignUpCredentials) => AuthService.signUp(credentials),
    signOut: () => AuthService.signOut(),
    refreshSession: () => AuthService.refreshSession(),
  };
}

