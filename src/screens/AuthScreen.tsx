/**
 * Full Authentication Screen with 2Factor OTP and Email/Password
 * Copied from old app with all functionality
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase, supabaseUrl, supabaseAnonKey, TABLES, beginSdkSync, completeSdkSync } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { AuthService } from '@/core/auth/auth.service';
import { useAuth } from '@/core/auth';
import { ProfileStorage } from '@/core/profile/profile.storage';
import OptimizedImage from '@/components/optimized/OptimizedImage';
import PoliciesScreen from './PoliciesScreen';
import { loginSendOtp, verifyOtp } from '@/api/auth';
import { handleApiError } from '@/api/errorHanlder';
import { setApiSession } from '@/session/session';

interface AuthScreenProps {
  onShowOnboarding?: () => void;
  onNavigateToPlans?: () => void;
  onSignupSuccess?: (fromPlanSelection: boolean) => void;
  subscriptionRequired?: boolean;
  defaultToSignUp?: boolean;
  defaultAuthMode?: 'phone' | 'email';
  comingFromPlanSelection?: boolean;
  navigation?: any;
}

export function AuthScreen({ 
  onShowOnboarding, 
  onNavigateToPlans, 
  onSignupSuccess, 
  subscriptionRequired = false, 
  defaultToSignUp = false,
  defaultAuthMode,
  comingFromPlanSelection = false, 
  navigation 
}: AuthScreenProps) {
  const auth = useAuth();
  const mountedRef = useRef(true);
  const otpVerifyInFlightRef = useRef(false);
  const otpTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91'); // Default to India
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [safetyCompanionAcknowledged, setSafetyCompanionAcknowledged] = useState(false);
  const [authMode, setAuthMode] = useState<'phone' | 'email'>(
    defaultAuthMode || (defaultToSignUp ? 'email' : 'phone')
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);
  const redirectUrl = (Constants?.expoConfig?.extra as any)?.redirectUrl || 'deephorizon://auth';

  // Cleanup on unmount: clear OTP timer interval and mark unmounted
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (otpTimerRef.current) {
        clearInterval(otpTimerRef.current);
        otpTimerRef.current = null;
      }
    };
  }, []);

  // Send OTP function using 2Factor API
  // const handleSendOTP = async () => {
  //   if (!phone || phone.trim().length === 0) {
  //     Alert.alert('Error', 'Please enter your phone number');
  //     return;
  //   }

  //   if (phone.trim().length !== 10) {
  //     Alert.alert('Error', 'Phone number must be exactly 10 digits');
  //     return;
  //   }

  //   if (!/^\d{10}$/.test(phone.trim())) {
  //     Alert.alert('Error', 'Phone number must contain only digits');
  //     return;
  //   }

  //   setLoading(true);
  //   try {
  //     const fullPhoneNumber = countryCode + phone;
  //     if (__DEV__) console.log('Sending OTP via 2Factor API to:', fullPhoneNumber);
  //     if (__DEV__) console.log('API Base URL:', apiBaseUrl);
      
  //     // Call backend API to send OTP via 2Factor
  //     // CRITICAL: iOS fetch() has no default timeout — add AbortController to prevent hang
  //     let response: Response;
  //     let data: any;
  //     const sendController = new AbortController();
  //     const sendTimer = setTimeout(() => sendController.abort(), 15000);

  //     try {
  //       response = await fetch(`${apiBaseUrl}/api/auth/send-otp`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({ phone: fullPhoneNumber }),
  //         signal: sendController.signal,
  //       });
        
  //       // Check if response is ok before trying to parse JSON
  //       if (!response.ok) {
  //         const errorText = await response.text();
  //         console.error('OTP API error response:', response.status, errorText);
  //         try {
  //           data = JSON.parse(errorText);
  //         } catch {
  //           throw new Error(`Server error: ${response.status} - ${errorText}`);
  //         }
  //         throw new Error(data.error || data.message || `Failed to send OTP: ${response.status}`);
  //       }
        
  //       data = await response.json();
  //       if (__DEV__) console.log('OTP API response:', data);
  //     } catch (fetchError: any) {
  //       // Network errors (connection failed, timeout, etc.)
  //       if (fetchError?.name === 'AbortError') {
  //         throw new Error('Request timed out. Please check your internet connection and try again.');
  //       }
  //       if (fetchError.message?.includes('Network request failed') ||
  //           fetchError.message?.includes('Failed to fetch') ||
  //           fetchError.name === 'TypeError') {
  //         console.error('Network error - check API URL and connectivity:', fetchError);
  //         throw new Error('Network error: Please check your internet connection and try again. If the problem persists, the server may be unavailable.');
  //       }
  //       throw fetchError;
  //     } finally {
  //       clearTimeout(sendTimer);
  //     }

  //     // API returns { success, data: { status, sessionId, ... } }
  //     const responseData = data.data || data;

  //     if (!data.success && responseData.status !== 'OTP_SENT') {
  //       throw new Error(responseData.error || 'Failed to send OTP');
  //     }

  //     // Store session ID for OTP verification
  //     setOtpSessionId(responseData.sessionId || responseData.details);
  //     setOtpSent(true);
  //     setOtpTimer(60); // 60 second timer
      
  //     // Start countdown timer — store in ref for unmount cleanup
  //     if (otpTimerRef.current) clearInterval(otpTimerRef.current);
  //     otpTimerRef.current = setInterval(() => {
  //       setOtpTimer((prev) => {
  //         if (prev <= 1) {
  //           if (otpTimerRef.current) {
  //             clearInterval(otpTimerRef.current);
  //             otpTimerRef.current = null;
  //           }
  //           return 0;
  //         }
  //         return prev - 1;
  //       });
  //     }, 1000);

  //     Alert.alert('OTP Sent!', `We've sent a verification code to ${fullPhoneNumber}`);
  //   } catch (error: any) {
  //     console.error('OTP send error:', error);
  //     let errorMessage = 'Failed to send OTP. Please try again.';
      
  //     if (error.message?.includes('rate limit')) {
  //       errorMessage = 'Too many requests. Please wait a moment and try again.';
  //     } else if (error.message) {
  //       errorMessage = error.message;
  //     }
      
  //     Alert.alert('Error', errorMessage);
  //   } finally {
  //     if (mountedRef.current) setLoading(false);
  //   }
  // };

  const handleSendOTP = async () => {
    if (!phone || phone.trim().length === 0) {
      Alert.alert('Error', 'Please enter your phone number');
      return;
    }

    if (phone.trim().length !== 10) {
      Alert.alert('Error', 'Phone number must be exactly 10 digits');
      return;
    }

    if (!/^\d{10}$/.test(phone.trim())) {
      Alert.alert('Error', 'Phone number must contain only digits');
      return;
    }

    setLoading(true);
    try {
      const fullPhoneNumber = countryCode + phone;
      if (__DEV__) console.log('Sending OTP via 2Factor API to:', fullPhoneNumber);
      
      // Call backend API to send OTP via 2Factor
      // CRITICAL: iOS fetch() has no default timeout — add AbortController to prevent hang
      let data: any;
      const sendController = new AbortController();
      const sendTimer = setTimeout(() => sendController.abort(), 15000);

      const response = await loginSendOtp(fullPhoneNumber);
         
      if (__DEV__) console.log('OTP API response:', response.message);

      setOtpSent(true);
      setOtpTimer(60); // 60 second timer
      
      // Start countdown timer — store in ref for unmount cleanup
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      otpTimerRef.current = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            if (otpTimerRef.current) {
              clearInterval(otpTimerRef.current);
              otpTimerRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      Alert.alert('OTP Sent!', `We've sent a verification code to ${fullPhoneNumber}`);
      clearTimeout(sendTimer);
    } catch (error: any) {
      handleApiError(error, { showAlert: true });
      setLoading(false);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    
  };

  // Verify OTP function using 2Factor API
  // const handleVerifyOTP = async () => {
  //   if (otpVerifyInFlightRef.current) {
  //     return;
  //   }

  //   if (!otpCode || otpCode.trim().length === 0) {
  //     Alert.alert('Error', 'Please enter the OTP code');
  //     return;
  //   }

  //   if (otpCode.trim().length !== 6) {
  //     Alert.alert('Error', 'OTP must be 6 digits');
  //     return;
  //   }

  //   if (!otpSessionId) {
  //     Alert.alert('Error', 'Session expired. Please request a new OTP.');
  //     return;
  //   }

  //   setLoading(true);
  //   otpVerifyInFlightRef.current = true;
  //   try {
  //     const fullPhoneNumber = countryCode + phone;
  //     if (__DEV__) console.log('Verifying OTP via 2Factor API for:', fullPhoneNumber);
      
  //     // Call backend API to verify OTP via 2Factor
  //     // CRITICAL: iOS fetch() has no default timeout — add AbortController to prevent hang
  //     const verifyController = new AbortController();
  //     const verifyTimer = setTimeout(() => verifyController.abort(), 15000);

  //     let verifyResponse: Response;
  //     try {
  //       verifyResponse = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({
  //           phone: fullPhoneNumber,
  //           otp: otpCode.trim(),
  //           sessionId: otpSessionId,
  //         }),
  //         signal: verifyController.signal,
  //       });
  //     } finally {
  //       clearTimeout(verifyTimer);
  //     }

  //     const verifyRaw = await verifyResponse.json();
  //     // API returns { success, data: { status, user, ... } }
  //     const verifyData = verifyRaw.data || verifyRaw;

  //     if (!verifyResponse.ok || (!verifyRaw.success && verifyData.status !== 'VERIFIED')) {
  //       throw new Error(verifyData.error || 'OTP verification failed');
  //     }

  //     if (!verifyData.user?.id) {
  //       throw new Error('Server returned invalid user data. Please try again.');
  //     }

  //     // ticketId binds session creation to this OTP verification (one-time use, 120s TTL)
  //     const ticketId = verifyData.ticketId;
  //     if (!ticketId) {
  //       throw new Error('Server returned invalid verification data. Please try again.');
  //     }

  //     if (__DEV__) console.log('[OTP Step 1/5] OTP verified, user:', verifyData.user.id, 'ticket:', ticketId);

  //     // Now create a real Supabase session via ticket exchange
  //     // CRITICAL: iOS fetch() has no default timeout — add AbortController to prevent hang
  //     const sessionController = new AbortController();
  //     const sessionTimer = setTimeout(() => sessionController.abort(), 15000);

  //     let sessionResponse: Response;
  //     try {
  //       sessionResponse = await fetch(`${apiBaseUrl}/api/auth/create-session`, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //         },
  //         body: JSON.stringify({ ticketId }),
  //         signal: sessionController.signal,
  //       });
  //     } finally {
  //       clearTimeout(sessionTimer);
  //     }

  //     const sessionRaw = await sessionResponse.json();
  //     // API returns { success, data: { status, session, ... } }
  //     const sessionData = sessionRaw.data || sessionRaw;

  //     if (!sessionResponse.ok || (!sessionRaw.success && sessionData.status !== 'SUCCESS')) {
  //       throw new Error(sessionData.error || 'Failed to create session');
  //     }

  //     if (!sessionData.session?.access_token || !sessionData.session?.refresh_token) {
  //       throw new Error('Server returned invalid session tokens. Please try again.');
  //     }

  //     // ── Dev-only TTL diagnostic ──
  //     // Log the actual token lifetime returned by /api/auth/create-session
  //     // to verify backend session TTL matches Supabase Dashboard config.
  //     // Expected: ~604800s (7 days). If ~3600s, backend is issuing 1-hour tokens.
  //     if (__DEV__) {
  //       try {
  //         const parts = sessionData.session.access_token.split('.');
  //         if (parts.length === 3) {
  //           const payload = JSON.parse(atob(parts[1]));
  //           const nowSec = Math.floor(Date.now() / 1000);
  //           const ttl = typeof payload.exp === 'number' ? payload.exp - nowSec : 'N/A';
  //           console.log(`[AuthScreen] create-session TTL: exp=${payload.exp}, now=${nowSec}, remaining=${ttl}s`);
  //         }
  //       } catch {}
  //     }

  //     // ── PRE-CACHE: profile from create-session for instant hydration ────
  //     // The dashboard API returns the mobile_users profile alongside session tokens.
  //     // Caching it HERE means hydrateProfile() (called by completeLogin) finds it
  //     // instantly in ProfileStorage — zero additional Supabase calls, zero timeouts.
  //     const serverProfile = sessionData.profile ?? null;
  //     if (serverProfile && serverProfile.id) {
  //       try {
  //         await ProfileStorage.set(serverProfile.id, serverProfile);
  //         if (__DEV__) console.log('[OTP] Pre-cached profile from create-session response');
  //       } catch (cacheErr: any) {
  //         console.warn('[OTP] Failed to pre-cache profile (non-fatal):', cacheErr?.message);
  //       }
  //     }

  //     // ── EFFICIENT POST-OTP FLOW ──────────────────────────────────────────
  //     // Key insight: supabase.from() internally calls getSession() which acquires
  //     // the SDK's auth lock. If setSession() holds that lock (common on iOS),
  //     // ALL subsequent SDK calls hang — no timeout/abort can fix it.
  //     //
  //     // Solution: fire setSession() in background, use raw REST API (fetch) for
  //     // DB operations. Zero lock contention, zero hangs.
  //     // ─────────────────────────────────────────────────────────────────────

  //     const loginUserId = verifyData.user.id;
  //     const accessToken = sessionData.session.access_token;
  //     const refreshToken = sessionData.session.refresh_token;
  //     const restUrl = `${supabaseUrl}/rest/v1`;
  //     const restHeaders = {
  //       'apikey': supabaseAnonKey,
  //       'Authorization': `Bearer ${accessToken}`,
  //       'Content-Type': 'application/json',
  //     };

  //     const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 10_000) => {
  //       const controller = new AbortController();
  //       const timer = setTimeout(() => controller.abort(), timeoutMs);
  //       try {
  //         return await fetch(url, { ...options, signal: controller.signal });
  //       } finally {
  //         clearTimeout(timer);
  //       }
  //     };

  //     // Step 2: Fire setSession in background — don't await, don't block
  //     // It will eventually complete and fire SIGNED_IN, updating React state.
  //     // completeLogin sets user/session from tokens immediately (no waiting).
  //     // beginSdkSync() signals services to wait until setSession completes
  //     // so ensureValidSession() doesn't race against the SDK lock.
  //     console.log('[OTP Step 2/4] Setting Supabase session (background)...');
  //     beginSdkSync();
  //     void (async () => {
  //       let synced = false;
  //       try {
  //         const result = await Promise.race([
  //           supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }),
  //           new Promise<null>((resolve) => setTimeout(() => {
  //             console.warn('[OTP] setSession timed out (10s)');
  //             resolve(null);
  //           }, 10_000)),
  //         ]);
  //         if (!result) {
  //           console.warn('[OTP] setSession hung — SDK may not have session yet');
  //         } else if (result.error) {
  //           console.error('[OTP] setSession error:', result.error.message);
  //         } else {
  //           console.log('[OTP] setSession completed in background');
  //           synced = true;
  //         }
  //       } catch (err) {
  //         console.error('[OTP] setSession threw:', err);
  //       } finally {
  //         completeSdkSync(synced);
  //       }
  //     })();

  //     // Step 3: Trigger hydration FIRST so login never blocks on REST profile writes.
  //     console.log('[OTP Step 3/4] Calling completeLogin...');
  //     await Promise.race([
  //       auth.completeLogin(loginUserId, { access_token: accessToken, refresh_token: refreshToken }),
  //       new Promise<never>((_, reject) =>
  //         setTimeout(() => reject(new Error('Login finalization timed out. Please try again.')), 20_000)
  //       ),
  //     ]);

  //     // Step 4: Best-effort profile/cache sync in background (non-blocking).
  //     // Tries direct Supabase REST first (fast when reachable), falls back to
  //     // dashboard API proxy when Supabase is unreachable from the device.
  //     console.log('[OTP Step 4/4] Scheduling profile sync in background...');
  //     void (async () => {
  //       let directSucceeded = false;
  //       let existingProfile: any = null;

  //       // ── Attempt 1: Direct Supabase REST (fast path when reachable) ──
  //       try {
  //         const selectRes = await fetchWithTimeout(
  //           `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${loginUserId}&select=id,trial_start_date,created_at`,
  //           { headers: restHeaders },
  //           8_000
  //         );
  //         const rows = selectRes.ok ? await selectRes.json() : [];
  //         existingProfile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

  //         if (existingProfile) {
  //           const updateData: any = {
  //             phone: fullPhoneNumber,
  //             is_verified: true,
  //             safety_companion_acknowledged: safetyCompanionAcknowledged,
  //           };
  //           if (!existingProfile.trial_start_date) {
  //             updateData.trial_start_date = new Date().toISOString();
  //           }
  //           const patchRes = await fetchWithTimeout(
  //             `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${loginUserId}`,
  //             { method: 'PATCH', headers: restHeaders, body: JSON.stringify(updateData) },
  //             8_000
  //           );
  //           if (patchRes.ok) {
  //             console.log('[OTP] Direct profile update succeeded');
  //             directSucceeded = true;
  //           } else {
  //             console.error('Profile update error:', await patchRes.text());
  //           }
  //         } else {
  //           const profileData = {
  //             id: loginUserId,
  //             email: verifyData.user.email || null,
  //             phone: fullPhoneNumber,
  //             is_verified: true,
  //             safety_companion_acknowledged: safetyCompanionAcknowledged,
  //             trial_start_date: new Date().toISOString(),
  //           };
  //           const insertRes = await fetchWithTimeout(
  //             `${restUrl}/${TABLES.MOBILE_USERS}`,
  //             { method: 'POST', headers: restHeaders, body: JSON.stringify(profileData) },
  //             8_000
  //           );
  //           if (insertRes.ok) {
  //             console.log('[OTP] Direct profile create succeeded');
  //             directSucceeded = true;
  //           } else {
  //             console.error('Profile creation error:', await insertRes.text());
  //           }
  //         }
  //       } catch (directErr: any) {
  //         console.warn('[OTP] Direct Supabase REST failed:', directErr?.message);
  //       }

  //       // ── Attempt 2: Dashboard proxy fallback (when Supabase unreachable) ──
  //       if (!directSucceeded) {
  //         try {
  //           console.log('[OTP] Trying dashboard proxy for profile sync...');
  //           // Build proxy payload — only set trial_start_date for new users
  //           // (matching the direct REST path logic above)
  //           const proxyPayload: any = {
  //             phone: fullPhoneNumber,
  //             is_verified: true,
  //             safety_companion_acknowledged: safetyCompanionAcknowledged,
  //           };
  //           // Only set trial_start_date if user didn't already have one
  //           // (existingProfile is from the direct REST SELECT above — may be null if that failed)
  //           if (!existingProfile?.trial_start_date) {
  //             proxyPayload.trial_start_date = new Date().toISOString();
  //           }
  //           const proxyRes = await fetchWithTimeout(
  //             `${apiBaseUrl}/api/mobile/profile`,
  //             {
  //               method: 'PATCH',
  //               headers: {
  //                 'Authorization': `Bearer ${accessToken}`,
  //                 'Content-Type': 'application/json',
  //               },
  //               body: JSON.stringify(proxyPayload),
  //             },
  //             10_000
  //           );
  //           if (proxyRes.ok) {
  //             console.log('[OTP] Dashboard proxy profile sync succeeded');
  //             // The PATCH response includes the updated profile — cache it
  //             const proxyJson = await proxyRes.json();
  //             const updatedProfile = proxyJson?.data?.profile ?? null;
  //             if (updatedProfile) {
  //               await ProfileStorage.set(loginUserId, updatedProfile);
  //               console.log('[OTP] Profile cached from proxy response');
  //             }
  //             directSucceeded = true;
  //           } else {
  //             console.warn('[OTP] Dashboard proxy profile sync failed:', proxyRes.status);
  //           }
  //         } catch (proxyErr: any) {
  //           console.warn('[OTP] Dashboard proxy fallback failed:', proxyErr?.message);
  //         }
  //       }

  //       // ── Cache full profile (if direct REST succeeded but cache not yet set) ──
  //       if (directSucceeded) {
  //         try {
  //           const cacheRes = await fetchWithTimeout(
  //             `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${loginUserId}&select=id,profile_completion_completed,name,email,phone,date_of_birth,home_address,work_address,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,blood_type,allergies,passkey_setup_completed,emergency_passkey_hash,trial_start_date,created_at,updated_at`,
  //             { headers: restHeaders },
  //             8_000
  //           );
  //           if (cacheRes.ok) {
  //             const cacheRows = await cacheRes.json();
  //             const fullProfile = Array.isArray(cacheRows) && cacheRows.length > 0 ? cacheRows[0] : null;
  //             if (fullProfile) {
  //               await ProfileStorage.set(loginUserId, fullProfile);
  //               console.log('[OTP] Profile cached for instant boot');
  //             }
  //           }
  //         } catch (cacheErr: any) {
  //           console.warn('[OTP] Profile cache update failed (non-fatal):', cacheErr?.message);
  //         }
  //       }
  //     })();
  //   } catch (error: any) {
  //     console.error('OTP verification error:', error);
  //     let errorMessage = 'OTP verification failed';

  //     if (error?.name === 'AbortError') {
  //       console.warn('[OTP] Flow timed out:', error?.message);
  //       errorMessage = 'Login is taking longer than expected. Please try again.';
  //     } else if (error.message?.includes('Invalid') || error.message?.includes('expired') || error.message?.includes('INVALID_OTP')) {
  //       errorMessage = 'Invalid or expired OTP code. Please try again.';
  //     } else if (error.message) {
  //       errorMessage = error.message;
  //     }

  //     Alert.alert('Error', errorMessage);
  //   } finally {
  //     otpVerifyInFlightRef.current = false;
  //     if (mountedRef.current) setLoading(false);
  //   }
  // };


  const handleVerifyOTP = async () => {
  if (otpVerifyInFlightRef.current) return;

  if (!otpCode || otpCode.trim().length === 0) {
    Alert.alert("Error", "Please enter the OTP code");
    return;
  }

  if (otpCode.trim().length !== 6) {
    Alert.alert("Error", "OTP must be 6 digits");
    return;
  }

  setLoading(true);
  otpVerifyInFlightRef.current = true;

  try {
    const fullPhoneNumber = countryCode + phone;

    if (__DEV__) {
      console.log("Verifying OTP:", fullPhoneNumber);
    }

 
    const res = await verifyOtp(fullPhoneNumber, otpCode.trim());

    /**
     * Expected response:
     * {
     *   accessToken: string;
     *   refreshToken: string;
     *   userId: string;
     *   isNewUser: boolean;
     *   user: UserProfile;
     * }
     */

    await setApiSession(res.accessToken, res.refreshToken);

    // we will fetch the user and store it alongside in the storage
    // await setUser(res.userId);

    await ProfileStorage.set(res.userId, res.user);

    await auth.completeLogin(res.userId, {
      access_token: res.accessToken,
      refresh_token: res.refreshToken,
    });

    if (__DEV__) {
      console.log("Login success:", res.userId);
    }


    // open the onboarding if it's a new user, otherwise proceed to the app
    // if (res.isNewUser) {
    //   if (__DEV__) console.log("New user detected, showing onboarding");
    //   onShowOnboarding?.();
    // } else {
    //   if (__DEV__) console.log("Existing user logged in");
    //   onShowOnboarding?.();
    //   //onSignupSuccess?.(comingFromPlanSelection);
    // }

  } catch (error: any) {
    console.error("OTP verification error:", error);

    await handleApiError(error, {
      logoutOn401: true,
    });

  } finally {
    otpVerifyInFlightRef.current = false;
    if (mountedRef.current) setLoading(false);
  }
};

  // Auto-verify when OTP reaches 6 digits
  const otpAutoVerifyRef = useRef(false);
  useEffect(() => {
    if (otpCode.length === 6 && otpSent && !loading && !otpAutoVerifyRef.current) {
      otpAutoVerifyRef.current = true;
      Keyboard.dismiss();
      handleVerifyOTP();
    }
    if (otpCode.length < 6) {
      otpAutoVerifyRef.current = false;
    }
  }, [otpCode, otpSent, loading]);

  // Resend OTP function
  const handleResendOTP = async () => {
    if (otpTimer > 0) {
      Alert.alert('Please wait', `You can resend OTP in ${otpTimer} seconds`);
      return;
    }
    await handleSendOTP();
  };

  const handleChangePhone = () => {
    if (otpTimerRef.current) {
      clearInterval(otpTimerRef.current);
      otpTimerRef.current = null;
    }
    setOtpSent(false);
    setOtpCode('');
    setOtpTimer(0);
    setOtpSessionId(null);
  };

  // Email/Password sign in function
  const handleEmailSignIn = async () => {
    if (!email || email.trim().length === 0) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!password || password.trim().length === 0) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      if (__DEV__) console.log('Signing in with email:', email.trim());
      
      const result = await AuthService.signIn({
        email: email.trim(),
        password,
      });

      if (!result.success) {
        throw new Error(result.error || 'Sign in failed');
      }

      // Get the session. signInWithPassword() was awaited above so the SDK
      // already has the session — getSession() is instant, no lock contention.
      console.log('[Email Step 2] Getting session after signIn...');
      const { data: sessionData } = await supabase.auth.getSession();
      const signInSession = sessionData?.session;
      const user = signInSession?.user;

      if (user) {
        if (__DEV__) console.log('[Email Step 3] Email sign in successful:', user.id);

        const emailLoginUserId = user.id;
        const emailAccessToken = signInSession.access_token;
        const restUrl = `${supabaseUrl}/rest/v1`;
        const restHeaders = {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${emailAccessToken}`,
          'Content-Type': 'application/json',
        };

        // DB write + cache via raw REST API (same pattern as OTP path)
        const emailFetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 10_000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            return await fetch(url, { ...options, signal: controller.signal });
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          const selectRes = await emailFetchWithTimeout(
            `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${emailLoginUserId}&select=id,trial_start_date,created_at`,
            { headers: restHeaders },
            8_000
          );
          const rows = selectRes.ok ? await selectRes.json() : [];
          const existingProfile = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

          if (existingProfile) {
            const updateData: any = {
              is_verified: true,
              safety_companion_acknowledged: safetyCompanionAcknowledged,
            };
            if (user.email || email.trim()) updateData.email = user.email || email.trim();
            if (user.phone) updateData.phone = user.phone;
            if (!existingProfile.trial_start_date) {
              updateData.trial_start_date = new Date().toISOString();
            }
            const patchRes = await emailFetchWithTimeout(
              `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${emailLoginUserId}`,
              { method: 'PATCH', headers: restHeaders, body: JSON.stringify(updateData) },
              8_000
            );
            if (!patchRes.ok) console.error('Profile update error:', await patchRes.text());
            else console.log('✅ Mobile user profile updated');
          } else {
            const profileData = {
              id: emailLoginUserId,
              email: user.email || email.trim(),
              name: user.user_metadata?.name || null,
              phone: user.phone || null,
              is_verified: true,
              safety_companion_acknowledged: safetyCompanionAcknowledged,
              trial_start_date: new Date().toISOString(),
            };
            const insertRes = await emailFetchWithTimeout(
              `${restUrl}/${TABLES.MOBILE_USERS}`,
              { method: 'POST', headers: restHeaders, body: JSON.stringify(profileData) },
              8_000
            );
            if (!insertRes.ok) console.error('Profile creation error:', await insertRes.text());
            else console.log('✅ Mobile user profile created');
          }

          // Cache full profile
          const cacheRes = await emailFetchWithTimeout(
            `${restUrl}/${TABLES.MOBILE_USERS}?id=eq.${emailLoginUserId}&select=id,profile_completion_completed,name,email,phone,date_of_birth,home_address,work_address,emergency_contact_name,emergency_contact_phone,emergency_contact_relationship,blood_type,allergies,passkey_setup_completed,emergency_passkey_hash,trial_start_date,created_at,updated_at`,
            { headers: restHeaders },
            8_000
          );
          if (cacheRes.ok) {
            const cacheRows = await cacheRes.json();
            const fullProfile = Array.isArray(cacheRows) && cacheRows.length > 0 ? cacheRows[0] : null;
            if (fullProfile) {
              await ProfileStorage.set(emailLoginUserId, fullProfile);
              console.log('✅ Profile cached for instant boot');
            }
          }
        } catch (dbErr: any) {
          console.warn('[Email] REST DB operations failed (non-fatal):', dbErr?.message);
        }

        // Trigger hydration
        console.log('[Email Step 4] Calling completeLogin...');
        // await auth.completeLogin(emailLoginUserId, signInSession.refresh_token
        //   ? { access_token: signInSession.access_token, refresh_token: signInSession.refresh_token }
        //   : undefined
        // );
      } else {
        throw new Error('Could not establish session. Please try again.');
      }
    } catch (error: any) {
      console.error('Email sign in error:', error);
      let errorMessage = 'Sign in failed. Please try again.';

      if (error.message?.includes('Invalid login credentials') || error.message?.includes('Invalid')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Error', errorMessage);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Logo/Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <OptimizedImage 
                source={require('../../assets/logo-t-dh.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Subscription Notice */}
          {subscriptionRequired && (
            <View style={styles.subscriptionNotice}>
              <View style={styles.subscriptionNoticeContent}>
                <MaterialIcons name="info" size={24} color="#4BA8FF" />
                <Text style={styles.subscriptionNoticeText}>
                  Subscription is required to access the app. Please subscribe first to create your account.
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.subscribeButton}
                onPress={() => {
                  if (onShowOnboarding) {
                    onShowOnboarding();
                  }
                }}
              >
                <Text style={styles.subscribeButtonText}>View Subscription Plans</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Auth Form */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>
              {authMode === 'email' ? 'Sign In' : (otpSent ? 'Verify OTP' : 'Welcome')}
            </Text>

            {authMode === 'phone' && !otpSent ? (
              <>
                {/* Phone Input */}
                <View style={styles.inputContainer}>
                  <MaterialIcons name="phone" size={20} color="#666" style={styles.inputIcon} />
                  <View style={styles.phoneInputContainer}>
                    <View style={styles.countryCodeButton}>
                      <Text style={styles.countryCodeText}>+91</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder="Phone Number (10 digits)"
                      value={phone}
                      onChangeText={(text) => {
                        const digitsOnly = text.replace(/\D/g, '');
                        if (digitsOnly.length <= 10) {
                          setPhone(digitsOnly);
                        }
                      }}
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                  </View>
                </View>

                {/* Safety Companion Acknowledgment Checkbox */}
                <View style={styles.checkboxContainer}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                    }}
                    activeOpacity={0.7}
                  >
                    {safetyCompanionAcknowledged ? (
                      <MaterialIcons name="check-box" size={28} color="#007AFF" />
                    ) : (
                      <MaterialIcons name="check-box-outline-blank" size={28} color="#666" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkboxLabelContainer}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                    }}
                    activeOpacity={0.7}
                  >
                  <Text style={styles.checkboxLabel}>
                    I understand that Deep Horizon is a safety companion app that provides digital coordination and support. It does not replace police, emergency, or licensed private security services.
                  </Text>
                  </TouchableOpacity>
                </View>

                {/* Send OTP Button */}
                <TouchableOpacity 
                  style={[
                    styles.authButton, 
                    (loading || !safetyCompanionAcknowledged || phone.length !== 10) && styles.authButtonDisabled
                  ]}
                  onPress={handleSendOTP}
                  disabled={loading || !safetyCompanionAcknowledged || phone.length !== 10}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.authButtonText}>Send OTP</Text>
                  )}
                </TouchableOpacity>

                {/* Sign in using email option */}
                <TouchableOpacity 
                  style={styles.toggleButton}
                  onPress={() => setAuthMode('email')}
                >
                  <Text style={styles.toggleText}>Sign in using email</Text>
                </TouchableOpacity>
              </>
            ) : authMode === 'email' ? (
              <>
                {/* Email Input */}
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    accessibilityLabel="Email address"
                  />
                </View>

                {/* Password Input */}
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.input}
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (safetyCompanionAcknowledged && email.trim() && password) {
                        handleEmailSignIn();
                      }
                    }}
                    accessibilityLabel="Password"
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowPassword(!showPassword)}
                  >
                    <MaterialIcons 
                      name={showPassword ? "visibility" : "visibility-off"} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                </View>

                {/* Safety Companion Acknowledgment Checkbox */}
                <View style={styles.checkboxContainer}>
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                    }}
                    activeOpacity={0.7}
                  >
                    {safetyCompanionAcknowledged ? (
                      <MaterialIcons name="check-box" size={28} color="#007AFF" />
                    ) : (
                      <MaterialIcons name="check-box-outline-blank" size={28} color="#666" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.checkboxLabelContainer}
                    onPress={() => {
                      Keyboard.dismiss();
                      setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                    }}
                    activeOpacity={0.7}
                  >
                  <Text style={styles.checkboxLabel}>
                    I understand that Deep Horizon is a safety companion app that provides digital coordination and support. It does not replace police, emergency, or licensed private security services.
                  </Text>
                  </TouchableOpacity>
                </View>

                {/* Sign In Button */}
                <TouchableOpacity 
                  style={[
                    styles.authButton, 
                    (loading || !safetyCompanionAcknowledged || !email.trim() || !password) && styles.authButtonDisabled
                  ]}
                  onPress={handleEmailSignIn}
                  disabled={loading || !safetyCompanionAcknowledged || !email.trim() || !password}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.authButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                {/* Back to phone login option */}
                <TouchableOpacity 
                  style={styles.toggleButton}
                  onPress={() => {
                    setAuthMode('phone');
                    setEmail('');
                    setPassword('');
                  }}
                >
                  <Text style={styles.toggleText}>Back to phone login</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* OTP Input */}
                <View style={styles.inputContainer}>
                  <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChangeText={(text) => {
                      const digitsOnly = text.replace(/\D/g, '');
                      if (digitsOnly.length <= 6) {
                        setOtpCode(digitsOnly);
                      }
                    }}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    accessibilityLabel="Enter 6-digit OTP code"
                    accessibilityHint="Enter the 6 digit verification code sent to your phone"
                  />
                  {otpCode.length > 0 && otpCode.length < 6 && (
                    <Text style={{ color: '#999', fontSize: 13, marginLeft: 4 }}>{otpCode.length}/6</Text>
                  )}
                </View>

                {/* Resend OTP */}
                <View style={styles.otpResendContainer}>
                  <Text style={styles.otpTimerText}>
                    {otpTimer > 0 ? `Resend OTP in ${otpTimer}s` : "Didn't receive code?"}
                  </Text>
                  {otpTimer === 0 && (
                    <TouchableOpacity onPress={handleResendOTP}>
                      <Text style={styles.resendLink}>Resend</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Verify OTP Button */}
                <TouchableOpacity 
                  style={[
                    styles.authButton, 
                    (loading || otpCode.length !== 6) && styles.authButtonDisabled
                  ]}
                  onPress={handleVerifyOTP}
                  disabled={loading || otpCode.length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.authButtonText}>Verify OTP</Text>
                  )}
                </TouchableOpacity>

                {/* Change Phone Number */}
                <TouchableOpacity 
                  style={styles.changePhoneButton}
                  onPress={handleChangePhone}
                >
                  <Text style={styles.changePhoneText}>Change Phone Number</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Back to Onboarding Button */}
            {onShowOnboarding && (
              <TouchableOpacity 
                style={styles.onboardingButton} 
                onPress={onShowOnboarding}
              >
                <MaterialIcons name="arrow-back" size={16} color="#4A90E2" />
                <Text style={styles.onboardingButtonText}>Back to Features</Text>
              </TouchableOpacity>
            )}

            {/* Policies Link */}
            <TouchableOpacity 
              style={styles.policiesLink}
              onPress={() => {
                if (navigation) {
                  navigation.navigate('Policies');
                } else {
                  // Show policies in a modal since we're outside navigation
                  setShowPoliciesModal(true);
                }
              }}
            >
              <Text style={styles.policiesLinkText}>View Policies</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Policies Modal for pre-auth users */}
      {!navigation && (
        <Modal
          visible={showPoliciesModal}
          animationType="slide"
          onRequestClose={() => setShowPoliciesModal(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setShowPoliciesModal(false)}
              >
                <MaterialIcons name="close" size={24} color="#007AFF" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>Policies</Text>
              <View style={styles.placeholder} />
            </View>
            <PoliciesScreen navigation={{ goBack: () => setShowPoliciesModal(false) }} />
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
  },
  subscriptionNotice: {
    backgroundColor: '#e3f2fd',
    padding: 16,
    marginBottom: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4BA8FF',
  },
  subscriptionNoticeContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  subscriptionNoticeText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  subscribeButton: {
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoImage: {
    width: 200,
    height: 200,
    resizeMode: 'contain',
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  phoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 12,
    minWidth: 60,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 4,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  passwordToggle: {
    padding: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    marginRight: 12,
    marginTop: 2,
  },
  checkboxLabelContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  authButton: {
    backgroundColor: '#203b84',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonDisabled: {
    opacity: 0.4,
  },
  authButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  toggleButton: {
    alignItems: 'center',
    marginTop: 24,
  },
  toggleText: {
    color: '#203b84',
    fontSize: 16,
    fontWeight: '500',
  },
  onboardingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#4A90E2',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  onboardingButtonText: {
    color: '#4A90E2',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  policiesLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  policiesLinkText: {
    color: '#666',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  placeholder: {
    width: 40,
  },
  otpResendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  otpTimerText: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  resendLink: {
    fontSize: 14,
    color: '#203b84',
    fontWeight: '500',
  },
  changePhoneButton: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  changePhoneText: {
    fontSize: 14,
    color: '#203b84',
    fontWeight: '500',
  },
});
