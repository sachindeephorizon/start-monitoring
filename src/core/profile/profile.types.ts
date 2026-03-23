/**
 * Profile Types
 *
 * Represents the authoritative user profile stored in `mobile_users`.
 * This is hydrated at app boot and then used throughout the UI.
 */

export type MobileUserProfile = {
  id: string;

  // Identity
  name: string | null;
  /**
   * "Profile email" stored in `mobile_users.email`.
   * This can differ from Supabase auth email (changing auth email triggers verification flows).
   */
  email: string | null;
  phone: string | null;

  // Completion + required fields
  profile_completion_completed: boolean | null;
  date_of_birth: string | null;
  home_address: string | null;
  work_address: string | null;

  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;

  // Medical (optional)
  blood_type: string | null;
  allergies: string | null;

  // Passkey / emergency
  passkey_setup_completed: boolean | null;
  emergency_passkey_hash: string | null;

  // Trial / subscription
  trial_start_date: string | null;

  // Timestamps
  created_at: string | null;
  updated_at: string | null;
};



export type UserProfile = {
   id: string;
    name?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    homeAddress?: string;
    homeAddressState?: string;
    homeAddressCity?: string;
    workAddress?: string;
    workAddressState?: string;
    workAddressCity?: string;
    bloodGroup?: string;
    allergies?: string;
    isProfileComplete: boolean;
    isPasskeySetupComplete: boolean;
    emergencyPassKeyHash?: string;
}
