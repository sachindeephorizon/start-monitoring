/**
 * Emergency Passkey Verification
 * 
 * Handles passkey verification before triggering emergencies.
 * This prevents accidental emergency activation.
 * 
 * iOS SAFETY: Passkeys are stored securely in Keychain (via SecureStore).
 * Verification happens server-side via RPC function for security.
 */

import { supabase, ensureValidSession } from '@/lib/supabase';

/**
 * Passkey verification result
 *
 * Distinguishes between "wrong passkey" (should trigger emergency) and
 * "auth/system error" (should NOT trigger emergency — it would also fail).
 */
export interface PasskeyVerificationResult {
  /** true if passkey matched */
  valid: boolean;
  /** If true, the verification failed due to a system/auth error — not a wrong passkey.
   *  Callers should NOT treat this as "wrong passkey" since emergency creation would also fail. */
  isSystemError?: boolean;
  /** Error message for logging */
  errorMessage?: string;
}

/**
 * Verify emergency passkey (simple boolean API — kept for backward compat)
 *
 * @param plainPasskey The 4-digit passkey entered by user
 * @returns true if passkey is correct, false otherwise
 */
export async function verifyEmergencyPasskey(
  plainPasskey: string
): Promise<boolean> {
  const result = await verifyEmergencyPasskeyDetailed(plainPasskey);
  return result.valid;
}

/**
 * Verify emergency passkey (detailed result)
 *
 * Returns structured result that distinguishes wrong passkey from auth errors.
 * This prevents triggering emergency on auth failure (which would also fail).
 *
 * @param plainPasskey The 4-digit passkey entered by user
 * @returns Detailed verification result
 */
export async function verifyEmergencyPasskeyDetailed(
  plainPasskey: string
): Promise<PasskeyVerificationResult> {
  try {
    // Input validation — prevent unnecessary RPC call
    if (!plainPasskey || plainPasskey.length !== 4 || !/^\d{4}$/.test(plainPasskey)) {
      return { valid: false };
    }

    // Get current user
    const session = await ensureValidSession();
    const user = session?.user;
    if (!user) {
      return { valid: false, isSystemError: true, errorMessage: 'Not authenticated' };
    }

    // Get passkey hash from database
    // Using RPC function for secure verification
    const { data, error } = await supabase.rpc('validate_mobile_passkey', {
      user_id: user.id,
      plain_passkey: plainPasskey,
    });

    if (error) {
      console.error('[Emergency Passkey] Error validating passkey:', error);
      // Distinguish auth/system errors from wrong passkey
      const msg = String(error.message || '').toLowerCase();
      const isAuthError = msg.includes('not exist') || msg.includes('jwt') ||
        msg.includes('not authenticated') || msg.includes('expired');
      return {
        valid: false,
        isSystemError: isAuthError || error.code === 'PGRST301',
        errorMessage: error.message,
      };
    }

    return { valid: data === true };
  } catch (error: any) {
    console.error('[Emergency Passkey] Error verifying passkey:', error);
    return { valid: false, isSystemError: true, errorMessage: error?.message };
  }
}

/**
 * Check if user has set up passkey
 * 
 * @returns true if passkey is set up, false otherwise
 */
export async function hasPasskeySetup(): Promise<boolean> {
  try {
    const session = await ensureValidSession();
    const user = session?.user;
    if (!user) {
      return false;
    }

    const { data, error } = await supabase
      .from('mobile_users')
      .select('passkey_setup_completed')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return false;
    }

    return data.passkey_setup_completed === true;
  } catch (error) {
    console.error('[Emergency Passkey] Error checking passkey setup:', error);
    return false;
  }
}

