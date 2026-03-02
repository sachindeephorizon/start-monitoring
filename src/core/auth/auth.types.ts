/**
 * Authentication Types
 * 
 * Type definitions for authentication state and user data.
 * These types represent the auth state machine that the app uses.
 * 
 * iOS SAFETY: Auth state must be resumable, not remembered.
 * Only persisted data survives process death.
 */

/**
 * App boot state machine (authoritative)
 *
 * Core principle:
 * Auth is NOT "ready" until profile has been hydrated at least once.
 */
export type AppBootState =
  | 'booting'
  | 'authenticating'
  | 'hydrating_profile'
  | 'ready'
  | 'unauthenticated'
  | 'error';

/**
 * Authenticated user data
 * 
 * This is the minimal user data needed for app functionality.
 * Full user profile data comes from the database, not auth state.
 */
export type AuthUser = {
  id: string;
  email: string;
  phone?: string;
  name?: string;
  /**
   * Profile completion flag stored in Supabase Auth user_metadata.
   *
   * We mirror this from `mobile_users.profile_completion_completed` to avoid
   * loops when the app cannot read `mobile_users` (e.g., transient RLS/select issues).
   */
  profileCompletionCompleted?: boolean;
  /**
   * Profile email stored in Supabase Auth user_metadata.
   *
   * This is NOT the auth email (changing auth email can trigger verification flows).
   * It is used for displaying profile details when `mobile_users` is temporarily unavailable.
   */
  profileEmail?: string;
};

/**
 * Authentication state machine
 * 
 * - loading: Initial state while checking for existing session
 * - unauthenticated: No valid session, user needs to sign in
 * - authenticated: Valid session, user is logged in
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: AuthUser; session: any };

/**
 * Sign in credentials
 */
export interface SignInCredentials {
  email: string;
  password: string;
}

/**
 * Sign up credentials
 */
export interface SignUpCredentials {
  email: string;
  password: string;
  phone: string;
  name: string;
}

/**
 * Auth service methods
 */
export interface AuthServiceMethods {
  /**
   * Restore session from secure storage
   * Called on app startup to resume authentication
   */
  restore(): Promise<boolean>;

  /**
   * Sign in with email and password
   */
  signIn(credentials: SignInCredentials): Promise<{ success: boolean; error?: string }>;

  /**
   * Sign up with email, password, phone, and name
   */
  signUp(credentials: SignUpCredentials): Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;

  /**
   * Sign out and clear session
   */
  signOut(): Promise<void>;

  /**
   * Refresh the current session
   */
  refreshSession(): Promise<boolean>;

  /**
   * Get current session
   */
  getCurrentSession(): Promise<any | null>;

  /**
   * Get current authenticated user
   */
  getCurrentUser(): Promise<AuthUser | null>;
}

