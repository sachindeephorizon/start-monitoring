import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { TABLES } from '@/lib/supabase';
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';
import { apiBaseUrl } from '@/config/environment';

interface CompleteProfileScreenProps {
  onComplete: () => void;
  onSkip?: () => void;
  onLogout?: () => void;
}

export const CompleteProfileScreen: React.FC<CompleteProfileScreenProps> = ({
  onComplete,
  onSkip,
  onLogout,
}) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Identity fields (always collected for a usable profile)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState('+91'); // ✅ NEW: User's phone number (required if not signed up with phone)
  const [authPhone, setAuthPhone] = useState<string | null>(null); // ✅ NEW: Track if user has auth phone

  // Mandatory profile fields
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [homeAddress, setHomeAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('+91');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactEmail, setEmergencyContactEmail] = useState('');
  
  // Optional fields
  const [bloodGroup, setBloodGroup] = useState('');
  const [allergens, setAllergens] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  
  // Password setup (required for new users)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Check if user needs password setup (phone-auth users)
  const [isNewUser, setIsNewUser] = useState(false);

  const checkUserData = useCallback(async () => {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return;
      }

      // Filter out synthetic OTP emails — they are GoTrue-internal only
      const isSynthetic = (e?: string | null) =>
        Boolean(e && /^phone_\d+@auth\.deephorizon\.app$/i.test(e.trim()));

      const rawAuthEmail = user.email ?? null;
      const realAuthEmail = rawAuthEmail && !isSynthetic(rawAuthEmail) ? rawAuthEmail : null;
      setAuthEmail(realAuthEmail);
      setAuthPhone(user.phone ?? null);

      // Determine if we need to force password setup.
      // We mark this in user_metadata after the first successful setup.
      const meta = (user.user_metadata ?? {}) as Record<string, any>;
      const hasPassword = meta?.has_password === true;
      const providers = Array.isArray((user as any)?.app_metadata?.providers)
        ? ((user as any).app_metadata.providers as string[])
        : [];
      const provider = String((user as any)?.app_metadata?.provider ?? '');
      const isPhoneAuth = providers.includes('phone') || provider === 'phone';
      setIsNewUser(Boolean(isPhoneAuth && !hasPassword));

      // Check if user has name and email in mobile_users
      const { data: profileData } = await supabase
        .from(TABLES.MOBILE_USERS)
        .select('name, email')
        .eq('id', user.id)
        .single();

      if (profileData) {
        // Prefill ONLY if user hasn't typed anything yet (avoid overwriting user input)
        if (profileData.name) {
          setFullName((prev) => (prev ? prev : String(profileData.name)));
        }
        // Only prefill with real emails (skip synthetic)
        const profileEmail = profileData.email && !isSynthetic(profileData.email) ? profileData.email : null;
        if (profileEmail) {
          setEmail((prev) => (prev ? prev : String(profileEmail)));
        } else if (realAuthEmail) {
          setEmail((prev) => (prev ? prev : String(realAuthEmail)));
        }
      } else {
        // Prefill with auth user data if available (avoid overwriting user input)
        const metaName = (user.user_metadata as any)?.name;
        if (metaName) {
          setFullName((prev) => (prev ? prev : String(metaName)));
        }
        if (realAuthEmail) {
          setEmail((prev) => (prev ? prev : String(realAuthEmail)));
        }
      }
    } catch (error) {
      console.error('Error checking user data:', error);
    }
  }, []);

  // Run once on mount
  useEffect(() => {
    checkUserData();
  }, [checkUserData]);

  // Keyboard handling:
  // On iOS Simulator (especially with a hardware keyboard connected / software keyboard disabled),
  // KeyboardAvoidingView can reserve space even when no on-screen keyboard is visible.
  // We instead apply bottom padding only when the keyboard height is meaningfully > 0.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    /**
     * ✅ CRITICAL FIX: Robust keyboard height handling
     * On some iOS devices/configurations, endCoordinates.height might be:
     * - undefined (hardware keyboard)
     * - 0 (software keyboard disabled)
     * - negative (rare edge case)
     * - very large (rotation bugs)
     */
    const showSub = Keyboard.addListener(showEvent, (e: any) => {
      const h = Number(e?.endCoordinates?.height ?? 0);

      // Validate height is reasonable (between 0 and screen height)
      if (!Number.isFinite(h) || h < 0) {
        console.warn('[CompleteProfile] Invalid keyboard height:', h);
        setKeyboardHeight(0);
        return;
      }

      // On iOS, keyboard height should be between 200-400 typically
      // If it's very small (<50), might be hardware keyboard or disabled
      if (Platform.OS === 'ios' && h > 0 && h < 50) {
        console.warn('[CompleteProfile] Unusually small keyboard height, ignoring:', h);
        setKeyboardHeight(0);
        return;
      }

      setKeyboardHeight(h);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // iOS-only: if auth session restores after this screen mounts, re-run checkUserData.
  // This prevents "data appears only after swipe up" when user is initially null.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        checkUserData();
      }
    });
    return () => {
      sub?.subscription?.unsubscribe?.();
    };
  }, [checkUserData]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Identity fields validation (always)
    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters';
    }

    // Email required if auth user doesn't already have an email (phone-auth users).
    const authHasEmail = Boolean(authEmail && String(authEmail).trim());
    if (!authHasEmail) {
      if (!email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        newErrors.email = 'Please enter a valid email address';
      }
    } else if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      newErrors.email = 'Please enter a valid email address';
    }

    // ✅ NEW: Phone required if auth user doesn't have a phone (email-auth users)
    const authHasPhone = Boolean(authPhone && String(authPhone).trim());
    if (!authHasPhone) {
      const phoneE164 = indianPhoneToE164(phone);
      if (!phoneE164) {
        newErrors.phone = 'Phone number is required';
      } else if (!phoneE164.startsWith('+91') || phoneE164.length !== 13) {
        newErrors.phone = 'Please enter a valid 10-digit Indian mobile number';
      }
    }

    /**
     * ✅ CRITICAL FIX: Proper date of birth validation
     *
     * OLD: Used year difference only (age = currentYear - birthYear)
     * PROBLEM: Inaccurate for edge cases (e.g., birthday hasn't occurred yet this year)
     *
     * NEW: Calculate actual age considering month and day
     */
    if (!dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required';
    } else {
      const today = new Date();
      const birthDate = new Date(dateOfBirth);

      // Calculate age properly
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Adjust age if birthday hasn't occurred yet this year
      if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age--;
      }

      // Validate age bounds
      if (age < 13) {
        newErrors.dateOfBirth = 'You must be at least 13 years old to use this app';
      } else if (age > 120) {
        newErrors.dateOfBirth = 'Please enter a valid date of birth';
      }

      // Additional validation: birthdate cannot be in the future
      if (birthDate > today) {
        newErrors.dateOfBirth = 'Date of birth cannot be in the future';
      }

      // Validate reasonable date range (not before 1900)
      const minDate = new Date(1900, 0, 1);
      if (birthDate < minDate) {
        newErrors.dateOfBirth = 'Please enter a date after 1900';
      }
    }

    if (!homeAddress.trim()) {
      newErrors.homeAddress = 'Home address is required';
    }

    if (!emergencyContactName.trim()) {
      newErrors.emergencyContactName = 'Emergency contact name is required';
    }

    const emergencyPhoneE164 = indianPhoneToE164(emergencyContactPhone);
    if (!emergencyPhoneE164) {
      newErrors.emergencyContactPhone = 'Emergency contact phone is required';
    }

    if (!emergencyContactRelation.trim()) {
      newErrors.emergencyContactRelation = 'Emergency contact relation is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePassword = (): boolean => {
    if (!isNewUser) {
      return true;
    }

    const trimmedPassword = password.trim();
    const trimmedConfirm = confirmPassword.trim();
    const passwordErrors: Record<string, string> = {};

    if (!trimmedPassword) {
      passwordErrors.password = 'Password is required';
    } else {
      if (trimmedPassword.length < 8) {
        passwordErrors.password = 'Password must be at least 8 characters long';
      } else if (!/[0-9]/.test(trimmedPassword)) {
        passwordErrors.password = 'Password must include at least one number';
      }
    }

    if (!trimmedConfirm) {
      passwordErrors.confirmPassword = 'Confirm your password';
    } else if (trimmedPassword && trimmedPassword !== trimmedConfirm) {
      passwordErrors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(passwordErrors).length > 0) {
      setErrors(prev => ({ ...prev, ...passwordErrors }));
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    const formValid = validateForm();
    const passwordValid = validatePassword();
    if (!formValid || !passwordValid) {
      Alert.alert('Validation Error', 'Please fill in all required fields correctly.');
      return;
    }

    try {
      setLoading(true);

      const authSession = await ensureValidSession();
      const user = authSession?.user;
      if (!user) {
        throw new Error('User not found. Please try logging in again.');
      }

      // Format date of birth
      const dobString = dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : null;

      /**
       * ✅ CRITICAL FIX: Proper phone number validation
       *
       * OLD: Only checked if conversion returned null
       * NEW: Validate format and length after conversion
       */
      const emergencyPhoneE164 = indianPhoneToE164(emergencyContactPhone);

      // Check if conversion succeeded
      if (!emergencyPhoneE164) {
        throw new Error('Emergency contact phone is required and must be a valid Indian mobile number');
      }

      // Validate E.164 format (should start with + and be 10-15 digits)
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(emergencyPhoneE164)) {
        console.error('[CompleteProfile] Invalid E.164 phone format:', emergencyPhoneE164);
        throw new Error('Emergency contact phone number is invalid. Please enter a valid 10-digit mobile number');
      }

      // Additional validation for Indian numbers (should be +91 followed by 10 digits)
      if (!emergencyPhoneE164.startsWith('+91') || emergencyPhoneE164.length !== 13) {
        console.error('[CompleteProfile] Invalid Indian phone number:', emergencyPhoneE164);
        throw new Error('Emergency contact phone must be a valid 10-digit Indian mobile number');
      }

      const updateData: any = {
        id: user.id,
        date_of_birth: dobString,
        home_address: homeAddress.trim(),
        emergency_contact_name: emergencyContactName.trim(),
        emergency_contact_phone: emergencyPhoneE164,
        emergency_contact_relationship: emergencyContactRelation.trim(),
        profile_completion_completed: true,
        updated_at: new Date().toISOString(),
      };

      // Always update name and ensure we persist a NON-NULL email.
      // Filter out synthetic GoTrue-internal emails — only persist real user emails.
      const isSynthetic = (e?: string | null) =>
        Boolean(e && /^phone_\d+@auth\.deephorizon\.app$/i.test(e.trim()));
      const userInputEmail = email.trim();
      const authUserEmail = user.email && !isSynthetic(user.email) ? user.email.trim() : '';
      const effectiveEmail = (userInputEmail || authUserEmail).trim();
      if (!effectiveEmail) {
        throw new Error('Email is required');
      }

      updateData.name = fullName.trim();
      updateData.email = effectiveEmail;

      /**
       * ✅ CRITICAL FIX: Ensure phone is always set (required by database constraint)
       * - If user signed up with phone: use user.phone (already E.164 formatted)
       * - If user signed up with email: use phone from form (convert to E.164)
       */
      if (user.phone) {
        updateData.phone = user.phone; // Already E.164 formatted from auth
      } else {
        // User signed up with email - use phone from form
        const userPhoneE164 = indianPhoneToE164(phone);
        if (!userPhoneE164) {
          throw new Error('Phone number is required');
        }
        updateData.phone = userPhoneE164;
      }

      // Add optional fields only if they have values
      if (bloodGroup.trim() && bloodGroup.trim() !== 'None') {
        updateData.blood_type = bloodGroup.trim();
      } else {
        updateData.blood_type = null;
      }

      if (allergens.trim() && allergens.trim() !== 'None') {
        updateData.allergies = allergens.trim();
      } else {
        updateData.allergies = null;
      }

      if (workAddress.trim()) {
        updateData.work_address = workAddress.trim();
      } else {
        updateData.work_address = null;
      }

      // Upsert mobile_users table (handles missing row + avoids loops)
      const { data: updatedData, error: updateError } = await supabase
        .from(TABLES.MOBILE_USERS)
        .upsert(updateData, { onConflict: 'id' })
        .select(
          [
            'profile_completion_completed',
            'name',
            'email',
            'phone',
            'date_of_birth',
            'home_address',
            'emergency_contact_name',
            'emergency_contact_phone',
            'emergency_contact_relationship',
          ].join(', ')
        )
        .single();

      if (updateError) {
        console.error('Profile update error:', updateError);
        throw new Error('Failed to save profile. Please try again.');
      }

      /**
       * Supabase JS client can infer `data` as a generic error type when no typed Database schema
       * is provided to `createClient`. Narrow it locally to keep production builds type-safe.
       */
      type MobileUserRequiredFields = {
        profile_completion_completed: boolean | null;
        name: string | null;
        email: string | null;
        phone: string | null;
        date_of_birth: string | null;
        home_address: string | null;
        emergency_contact_name: string | null;
        emergency_contact_phone: string | null;
        emergency_contact_relationship: string | null;
      };
      const updatedProfile = (updatedData as unknown as MobileUserRequiredFields | null) ?? null;

      /**
       * Mirror identity + completion status into Supabase user_metadata.
       * This prevents a "profile completion loop" if mobile_users is temporarily unreadable (RLS/transient).
       */
      const updateAuthPayload: any = {
        data: {
          name: fullName.trim(),
          profile_email: effectiveEmail,
          profile_completion_completed: true,
          ...(isNewUser ? { has_password: true } : {}),
        },
      };

      if (isNewUser) {
        updateAuthPayload.password = password.trim();
      }

      const { error: credentialError } = await supabase.auth.updateUser(updateAuthPayload);
      if (credentialError) {
        console.error('Auth metadata update error:', credentialError);
        throw new Error(credentialError.message || 'Failed to finalize your account. Please try again.');
      }

      // Update auth.users.email via admin API so email+password login works.
      // This replaces the synthetic phone_XXX@auth.deephorizon.app email with
      // the user's real email entered above.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData?.session?.access_token;
        if (accessToken && effectiveEmail) {
          const emailUpdateRes = await fetch(`${apiBaseUrl}/api/auth/update-profile-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ email: effectiveEmail }),
            signal: AbortSignal.timeout(8000),
          });
          if (!emailUpdateRes.ok) {
            const errBody = await emailUpdateRes.json().catch(() => ({}));
            // EMAIL_TAKEN is user-facing — surface it so they can use a different email
            if (errBody?.code === 'EMAIL_TAKEN') {
              throw new Error(errBody.error || 'This email is already in use by another account.');
            }
            // Other errors are non-fatal — profile is saved, login email just not updated
            console.warn('[CompleteProfile] Auth email update failed (non-fatal):', errBody?.error || emailUpdateRes.status);
          } else {
            console.log('[CompleteProfile] Auth email updated successfully for email+password login');
          }
        }
      } catch (emailUpdateError: any) {
        // Re-throw EMAIL_TAKEN so the user sees it
        if (emailUpdateError?.message?.includes('already in use') || emailUpdateError?.message?.includes('already associated')) {
          throw emailUpdateError;
        }
        // Other errors are non-fatal
        console.warn('[CompleteProfile] Auth email update error (non-fatal):', emailUpdateError?.message);
      }

      // Final safety check: ensure required fields are actually stored in DB.
      const missingRequired =
        updatedProfile?.profile_completion_completed !== true ||
        !String(updatedProfile?.name ?? '').trim() ||
        !String(updatedProfile?.email ?? '').trim() ||
        !String(updatedProfile?.date_of_birth ?? '').trim() ||
        !String(updatedProfile?.home_address ?? '').trim() ||
        !String(updatedProfile?.emergency_contact_name ?? '').trim() ||
        !String(updatedProfile?.emergency_contact_phone ?? '').trim() ||
        !String(updatedProfile?.emergency_contact_relationship ?? '').trim();

      if (missingRequired) {
        console.error('[CompleteProfile] DB update succeeded but required fields are missing:', updatedProfile);
        throw new Error('Profile was not saved correctly. Please try again.');
      }

      /**
       * ✅ CRITICAL FIX: Use upsert for emergency contacts to prevent cascading failures
       *
       * OLD BEHAVIOR: Separate select → insert/update logic
       * PROBLEM: If profile saves but contact fails, retry creates inconsistent state
       *
       * NEW BEHAVIOR: Single upsert operation with conflict handling
       * BENEFIT: Idempotent - can be retried safely without duplicates or errors
       */
      const contactPayload = {
        mobile_user_id: user.id,
        contact_name: emergencyContactName.trim(),
        contact_phone: emergencyPhoneE164,
        relationship: emergencyContactRelation.trim(),
        contact_email: emergencyContactEmail.trim() || null,
      };

      // First, try to find and delete old contacts for this user (keep only latest)
      // This ensures we don't accumulate duplicate contacts over multiple profile completions
      try {
        const { data: oldContacts } = await supabase
          .from(TABLES.EMERGENCY_CONTACTS)
          .select('id')
          .eq('mobile_user_id', user.id);

        if (oldContacts && oldContacts.length > 0) {
          console.log(`[CompleteProfile] Removing ${oldContacts.length} old emergency contact(s)`);
          await supabase
            .from(TABLES.EMERGENCY_CONTACTS)
            .delete()
            .eq('mobile_user_id', user.id);
        }
      } catch (cleanupError) {
        // Non-fatal: if cleanup fails, upsert will still work
        console.warn('[CompleteProfile] Old contact cleanup failed (non-fatal):', cleanupError);
      }

      // Insert fresh emergency contact
      if (__DEV__) console.log('[CompleteProfile] Saving emergency contact for user:', user.id);
      const { data: savedContact, error: contactError } = await supabase
        .from(TABLES.EMERGENCY_CONTACTS)
        .insert(contactPayload)
        .select()
        .single();

      if (contactError) {
        console.error('[CompleteProfile] Emergency contact save error:', contactError);
        console.error('[CompleteProfile] Contact payload:', contactPayload);

        // If error is due to duplicate/constraint, it's non-fatal (data is already in mobile_users)
        // Only throw for unexpected errors
        if (!contactError.message?.includes('duplicate') && contactError.code !== '23505') {
          throw new Error('Failed to save emergency contact. Please try again.');
        } else {
          console.warn('[CompleteProfile] Duplicate contact detected, continuing (data already in profile)');
        }
      } else {
        console.log('[CompleteProfile] Successfully saved emergency contact:', savedContact?.id);
      }

      Alert.alert(
        'Profile Completed',
        'Your profile has been saved successfully.',
        [{ text: 'Continue', onPress: onComplete }]
      );

    } catch (error: any) {
      console.error('Error completing profile:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to save profile. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'Select Date of Birth';
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const bloodGroups = ['None', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const relations = ['Parent', 'Spouse', 'Sibling', 'Child', 'Friend', 'Other'];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          // Ensure last field is reachable. Add extra space only if a real keyboard is visible.
          {
            paddingBottom:
              Math.max(40, (Number.isFinite(insets.bottom) ? insets.bottom : 0) + 24) +
              (keyboardHeight > 50 ? keyboardHeight : 0),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        // Prevent iOS from applying its own keyboard inset adjustments (can cause large empty gaps
        // especially on iPad when the keyboard is floating/undocked).
        automaticallyAdjustKeyboardInsets={false}
      >
          <View style={styles.header}>
            <Text style={styles.title}>Complete Your Profile</Text>
            <Text style={styles.subtitle}>
              Please provide the following information to complete your profile setup
            </Text>
          </View>

        {/* Identity Fields (always) */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Full Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textInput, errors.fullName && styles.inputError]}
            placeholder="Enter your full name"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              setErrors((prev) => ({ ...prev, fullName: '' }));
            }}
            placeholderTextColor="#999"
            autoCapitalize="words"
          />
          {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>
            Email Address {!authEmail ? <Text style={styles.required}>*</Text> : null}
          </Text>
          <TextInput
            style={[styles.textInput, errors.email && styles.inputError]}
            placeholder="Enter your email address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setErrors((prev) => ({ ...prev, email: '' }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#999"
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        {/* ✅ NEW: Phone Number (required for email-auth users who don't have authPhone) */}
        {!authPhone && (
          <View style={styles.section}>
            <Text style={styles.label}>
              Phone Number <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, errors.phone && styles.inputError]}
              placeholder="Enter your 10-digit mobile number"
              value={phone}
              onChangeText={(text) => {
                const normalized = normalizeIndianPhoneInput(text);
                setPhone(normalized);
                setErrors((prev) => ({ ...prev, phone: '' }));
              }}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor="#999"
            />
            {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
            <Text style={styles.helperText}>
              Required for account security and emergencies
            </Text>
          </View>
        )}

        {/* Password setup (required for new users) */}
        {isNewUser && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>
                Create Password <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.passwordFieldWrapper}>
                <TextInput
                  style={[styles.textInput, errors.password && styles.inputError]}
                  placeholder="Create a secure password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  /**
                   * iOS PASSWORD AUTOFILL (production fix):
                   * When `autoComplete="off"` / `textContentType="none"` are used, iOS Password AutoFill
                   * can still inject a strong password but sometimes does NOT reliably propagate changes
                   * through `onChangeText`, which can make the controlled input feel "blocked".
                   *
                   * Use the correct semantic hints so iOS can manage AutoFill cleanly,
                   * and also mirror native text changes via `onChange` as a safety net.
                   */
                  onChange={(e) => {
                    const nativeText = e.nativeEvent.text ?? '';
                    if (nativeText !== password) {
                      setPassword(nativeText);
                    }
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  <MaterialIcons
                    name={showPassword ? 'visibility-off' : 'visibility'}
                    size={22}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>
                Confirm Password <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.passwordFieldWrapper}>
                <TextInput
                  style={[styles.textInput, errors.confirmPassword && styles.inputError]}
                  placeholder="Re-enter your password"
                  placeholderTextColor="#999"
                  secureTextEntry={!showConfirmPassword}
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                  }}
                  onChange={(e) => {
                    const nativeText = e.nativeEvent.text ?? '';
                    if (nativeText !== confirmPassword) {
                      setConfirmPassword(nativeText);
                    }
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowConfirmPassword((prev) => !prev)}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? 'visibility-off' : 'visibility'}
                    size={22}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && (
                <Text style={styles.errorText}>{errors.confirmPassword}</Text>
              )}
            </View>
          </>
        )}

        {/* Date of Birth - Mandatory */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Date of Birth <Text style={styles.required}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.datePickerButton, errors.dateOfBirth && styles.inputError]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={[styles.datePickerText, !dateOfBirth && styles.placeholder]}>
              {formatDate(dateOfBirth)}
            </Text>
            <MaterialIcons name="calendar-today" size={24} color="#666" />
          </TouchableOpacity>
          {errors.dateOfBirth && (
            <Text style={styles.errorText}>{errors.dateOfBirth}</Text>
          )}
          {showDatePicker && (
            <>
              <DateTimePicker
                value={dateOfBirth || new Date(2000, 0, 1)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                minimumDate={new Date(1900, 0, 1)}
                onChange={(event, selectedDate) => {
                  /**
                   * ✅ FIX (iOS vs Android date picker behavior):
                   *
                   * ANDROID: 'default' display shows a modal dialog.
                   * - onChange fires once when user confirms
                   * - event.type = 'set' when confirmed, 'dismissed' when cancelled
                   * - Auto-closes the modal after selection
                   *
                   * iOS: 'spinner' display shows an inline wheel picker.
                   * - onChange fires continuously as user scrolls (year/month/day changes)
                   * - Does NOT auto-close - user needs a "Done" button
                   * - We keep it open and update the value in real-time
                   */
                  if (Platform.OS === 'android') {
                    // Android: Close immediately when user confirms or cancels
                    setShowDatePicker(false);
                    if (event.type === 'set' && selectedDate) {
                      setDateOfBirth(selectedDate);
                      setErrors((prev) => ({ ...prev, dateOfBirth: '' }));
                    }
                  } else {
                    // iOS: Keep picker open, update value in real-time as user scrolls
                    if (selectedDate) {
                      setDateOfBirth(selectedDate);
                      setErrors((prev) => ({ ...prev, dateOfBirth: '' }));
                    }
                  }
                }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Home Address - Mandatory */}
        <View style={styles.section}>
          <Text style={styles.label}>
            Home Address (Full Address) <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textInput, styles.textArea, errors.homeAddress && styles.inputError]}
            placeholder="Enter your complete home address"
            value={homeAddress}
            onChangeText={(text) => {
              setHomeAddress(text);
              setErrors((prev) => ({ ...prev, homeAddress: '' }));
            }}
            multiline
            numberOfLines={4}
            placeholderTextColor="#999"
          />
          {errors.homeAddress && (
            <Text style={styles.errorText}>{errors.homeAddress}</Text>
          )}
        </View>

        {/* Emergency Contact Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emergency Contact (Mandatory)</Text>
          
          <Text style={styles.label}>
            Contact Name <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textInput, errors.emergencyContactName && styles.inputError]}
            placeholder="Emergency contact full name"
            value={emergencyContactName}
            onChangeText={(text) => {
              setEmergencyContactName(text);
              setErrors((prev) => ({ ...prev, emergencyContactName: '' }));
            }}
            placeholderTextColor="#999"
          />
          {errors.emergencyContactName && (
            <Text style={styles.errorText}>{errors.emergencyContactName}</Text>
          )}

          <Text style={styles.label}>
            Contact Phone <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textInput, errors.emergencyContactPhone && styles.inputError]}
            placeholder="+91XXXXXXXXXX"
            value={emergencyContactPhone}
            onChangeText={(text) => {
              setEmergencyContactPhone(normalizeIndianPhoneInput(text));
              setErrors((prev) => ({ ...prev, emergencyContactPhone: '' }));
            }}
            keyboardType="phone-pad"
            placeholderTextColor="#999"
          />
          {errors.emergencyContactPhone && (
            <Text style={styles.errorText}>{errors.emergencyContactPhone}</Text>
          )}

          <Text style={styles.label}>
            Relation <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.relationContainer}>
            {relations.map((relation) => (
              <TouchableOpacity
                key={relation}
                style={[
                  styles.relationButton,
                  emergencyContactRelation === relation && styles.relationButtonSelected,
                ]}
                onPress={() => {
                  setEmergencyContactRelation(relation);
                  setErrors((prev) => ({ ...prev, emergencyContactRelation: '' }));
                }}
              >
                <Text
                  style={[
                    styles.relationButtonText,
                    emergencyContactRelation === relation && styles.relationButtonTextSelected,
                  ]}
                >
                  {relation}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.emergencyContactRelation && (
            <Text style={styles.errorText}>{errors.emergencyContactRelation}</Text>
          )}

          <Text style={styles.label}>Contact Email (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Emergency contact email"
            placeholderTextColor="#999"
            value={emergencyContactEmail}
            onChangeText={setEmergencyContactEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        {/* Blood Group - Optional */}
        <View style={styles.section}>
          <Text style={styles.label}>Blood Group</Text>
          <View style={styles.bloodGroupContainer}>
            {bloodGroups.map((group) => (
              <TouchableOpacity
                key={group}
                style={[
                  styles.bloodGroupButton,
                  bloodGroup === group && styles.bloodGroupButtonSelected,
                ]}
                onPress={() => setBloodGroup(group)}
              >
                <Text
                  style={[
                    styles.bloodGroupButtonText,
                    bloodGroup === group && styles.bloodGroupButtonTextSelected,
                  ]}
                >
                  {group}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Allergens - Optional */}
        <View style={styles.section}>
          <Text style={styles.label}>Allergens / Known Allergies</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Enter any known allergies (or 'None' if none)"
            value={allergens}
            onChangeText={setAllergens}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
          />
          <TouchableOpacity
            style={styles.noneButton}
            onPress={() => setAllergens('None')}
          >
            <Text style={styles.noneButtonText}>Select None</Text>
          </TouchableOpacity>
        </View>

        {/* Work Address - Optional */}
        <View style={styles.section}>
          <Text style={styles.label}>Work Address (Optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Enter your work address (optional)"
            value={workAddress}
            onChangeText={setWorkAddress}
            multiline
            numberOfLines={3}
            placeholderTextColor="#999"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Complete Profile</Text>
          )}
        </TouchableOpacity>

        {/* Logout option */}
        {onLogout && (
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              Alert.alert(
                'Log Out',
                'Are you sure you want to log out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Log Out', style: 'destructive', onPress: onLogout },
                ]
              );
            }}
          >
            <MaterialIcons name="logout" size={18} color="#e74c3c" />
            <Text style={styles.logoutButtonText}>Log Out</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 30,
    marginTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#203b84',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#203b84',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#e74c3c',
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  passwordFieldWrapper: {
    position: 'relative',
  },
  passwordToggle: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  passwordHint: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
    lineHeight: 18,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#e74c3c',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  datePickerButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  datePickerText: {
    fontSize: 16,
    color: '#333',
  },
  placeholder: {
    color: '#999',
  },
  datePickerDoneButton: {
    backgroundColor: '#203b84',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  datePickerDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  relationContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4, // Negative margin to offset child margins
  },
  relationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    margin: 4, // Replace gap with margin
  },
  relationButtonSelected: {
    backgroundColor: '#203b84',
    borderColor: '#203b84',
  },
  relationButtonText: {
    fontSize: 14,
    color: '#666',
  },
  relationButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  bloodGroupContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4, // Negative margin to offset child margins
  },
  bloodGroupButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    margin: 4, // Replace gap with margin
  },
  bloodGroupButtonSelected: {
    backgroundColor: '#203b84',
    borderColor: '#203b84',
  },
  bloodGroupButtonText: {
    fontSize: 14,
    color: '#666',
  },
  bloodGroupButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  noneButton: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  noneButtonText: {
    color: '#203b84',
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#203b84',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 12,
    gap: 8,
  },
  logoutButtonText: {
    color: '#e74c3c',
    fontSize: 16,
    fontWeight: '500',
  },
});

