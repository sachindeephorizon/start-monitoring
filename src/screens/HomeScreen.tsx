/**
 * Home Screen - UI Only
 * 
 * Main home screen with emergency button, service cards, and navigation.
 * This is a pure UI component with no background processing.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Platform,
  StatusBar,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { EmergencyButton } from '@/components/emergency';
import { layoutStyles } from '@/styles/Layout.styles';
import { serviceCardStyles } from '@/styles/ServiceCard.styles';
import { emergencyStyles } from '@/styles/Emergency.styles';
import AudioCallInterface from '@/components/AudioCallInterface';
import ChatBox from '@/components/chat/ChatBox';
import SlideMenu from '@/components/navigation/SlideMenu';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';
import { simpleCallService, SimpleCallSession } from '@/services/simpleCall.service';
import { setCallPriorityActive } from '@/services/callPriority';
import { Camera } from 'expo-camera';
import { useAuth } from '@/core/auth';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useEmergency } from '@/features/emergency';
import { verifyEmergencyPasskeyDetailed } from '@/features/emergency/emergency.passkey';
import { EMERGENCY_PASSKEY_TIMEOUT_SECONDS } from '@/features/emergency/emergency.constants';
import { useChat } from '@/hooks/useChat';
import { formatChatTime } from '@/utils/chat';
import { useIOSCompatibleSiren } from '@/hooks/useIOSCompatibleSiren';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';
import { consumePendingNotificationNav } from '@/core/notifications/notification.router';
import { Service } from '@/types/services';

interface HomeScreenProps {
  navigation: any;
}

const { height: screenHeight } = Dimensions.get('window');

const HomeScreen: React.FC<HomeScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(false);
  
  // Siren hook - flashlight control callback (simplified for now)
  const handleFlashlightControl = useCallback((enabled: boolean) => {
    // Flashlight control - can be enhanced later with actual torch API
    console.log(`🔦 Flashlight ${enabled ? 'ON' : 'OFF'}`);
    // TODO: Implement actual flashlight control if needed
  }, []);
  
  const siren = useIOSCompatibleSiren({
    onFlashlightControl: handleFlashlightControl,
    cameraPermission: cameraPermission,
  });
  const isSirenActive = siren.isActive;
  
  // Call state
  const [showCall, setShowCall] = useState(false);
  const [callSession, setCallSession] = useState<SimpleCallSession | null>(null);
  const [isAudioCall, setIsAudioCall] = useState(false);
  
  // Chat state
  const [showChatbox, setShowChatbox] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chat = useChat();
  
  // Emergency state
  const { triggerEmergency } = useEmergency();
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [showEmergencyPasskey, setShowEmergencyPasskey] = useState(false);
  const [emergencyPasskey, setEmergencyPasskey] = useState('');
  const [emergencyCountdown, setEmergencyCountdown] = useState(EMERGENCY_PASSKEY_TIMEOUT_SECONDS);
  const [emergencyDeadline, setEmergencyDeadline] = useState<number | null>(null);
  const [isEmergencyProcessing, setIsEmergencyProcessing] = useState(false);
  const emergencyResponseInFlightRef = useRef(false);

  // ✅ Auto-open service route from notification routing.
  // When a tracking_checkin notification is tapped, the router navigates to
  // Home with { openService: 'tracking' }. This effect reads that param and
  // forwards to the correct screen so useTrackingSession can detect the
  // missed check-in and show the passkey modal.
  useEffect(() => {
    const params = route.params as any;
    if (params?.openService) {
      const service = params.openService;
      if (service === Service.TRACKING) {
        (navigation as any).navigate('Tracking');
      } else if (service === Service.VIDEO) {
        (navigation as any).navigate('VideoMonitor');
      }
      // Clear param so it doesn't re-trigger on re-render or focus
      navigation.setParams({ openService: undefined } as any);
    }
  }, [(route.params as any)?.openService]);

  // ✅ COLD-START FALLBACK: Consume pending notification route on focus.
  //
  // On cold start (app fully killed), `replayPendingNavigation()` fires before
  // MainNavigator mounts (AuthGuard is still loading). By the time HomeScreen
  // mounts, the navigation params have been overwritten by MainNavigator's
  // default initial state. This effect reads the module-level fallback that
  // was stored by the notification router, ensuring the correct modal opens
  // or the correct screen is navigated to even on cold start.
  //
  // Uses useFocusEffect instead of useEffect so that if the intent arrives
  // slightly after initial mount (e.g. iOS cold-start listener fires late),
  // the next focus event will still pick it up.
  const _lastConsumedNotificationId = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingNotificationNav();
      if (!pending) return;

      // Dedup: don't process the same notification twice.
      // If notificationId is present, use it. Otherwise, derive a fingerprint from
      // screen + params + time bucket (5s window) to prevent rare double-consume.
      const dedupKey = pending.notificationId
        || `${pending.screen}:${JSON.stringify(pending.params)}:${Math.floor(pending.createdAt / 5000)}`;
      if (dedupKey === _lastConsumedNotificationId.current) {
        console.log('[HomeScreen] Skipping already-consumed notification:', dedupKey);
        return;
      }
      _lastConsumedNotificationId.current = dedupKey;

      // Stale guard: reject notifications older than 5 minutes
      const ageMs = Date.now() - pending.createdAt;
      if (ageMs > 5 * 60 * 1000) {
        console.log('[HomeScreen] Ignoring stale notification intent, age:', ageMs, 'ms');
        return;
      }

      console.log('[HomeScreen] Cold-start notification fallback:', pending.screen, pending.params, 'age:', ageMs, 'ms');

      if (pending.screen === 'Home' && pending.params?.openService) {
        const service = pending.params.openService;
        if (service === Service.TRACKING) {
          (navigation as any).navigate('Tracking');
        } else if (service === Service.VIDEO) {
          (navigation as any).navigate('VideoMonitor');
        }
      } else if (pending.screen && pending.screen !== 'Home') {
        // Different screen — navigate (e.g. CheckIn screen from check_in notification)
        (navigation as any).navigate(pending.screen, pending.params);
      }
    }, [navigation])
  );
  const shakeAnimation = useRef(new Animated.Value(0)).current;
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Emergency status message (auto-dismissing)
  const [emergencyStatusMessage, setEmergencyStatusMessage] = useState<string | null>(null);
  const statusOpacity = useRef(new Animated.Value(0)).current;

  /**
   * ✅ CRITICAL FIX: Mounted ref to prevent state updates after unmount
   *
   * This ref tracks whether the component is still mounted. All async operations
   * that update state must check this ref before updating to avoid memory leaks
   * and React warnings about setting state on unmounted components.
   */
  const mountedRef = useRef(true);
  const statusDismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      if (statusDismissTimerRef.current) {
        clearTimeout(statusDismissTimerRef.current);
        statusDismissTimerRef.current = null;
      }
    };
  }, []);

  // Show auto-dismissing status message
  const showEmergencyStatus = useCallback((message: string, durationMs: number = 1500) => {
    setEmergencyStatusMessage(message);

    // Clear any pending dismiss timer
    if (statusDismissTimerRef.current) {
      clearTimeout(statusDismissTimerRef.current);
    }

    // Fade in
    Animated.timing(statusOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Auto-dismiss after duration
    statusDismissTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      Animated.timing(statusOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        if (mountedRef.current) {
          setEmergencyStatusMessage(null);
        }
      });
    }, durationMs);
  }, [statusOpacity]);




  // Start call function (defined early so it can be used in emergency response)
  const startCall = useCallback(async (callType: 'video' | 'audio', reason: string) => {
    try {
      setIsStartingCall(true);
      setCallPriorityActive(true);



      // ensureValidSession() already refreshes expired tokens
      const user = auth.user;

      if(!user){
        throw new Error('User not authenticated');
      }
      if (__DEV__) console.log('[HomeScreen] ✅ Session valid, user ID:', user.id);

      
      const userName = user?.name || user.email || 'User';
      
      if (callType === 'audio') {
        // Use dedicated audio call service for audio calls
        const { audioCallService } = await import('@/services/audioCall.service');
        
        // Initialize user
        await audioCallService.initializeUser(user.id, userName);
        
        // Generate call ID (similar to video calls)
        const timestamp = Date.now();
        const shortUserId = user.id.substring(0, 8);
        const callId = `audio-${shortUserId}-${timestamp}`;
        
        // Create audio call (this will create the database record and Stream call)
        await audioCallService.createAudioCall(callId, true);
        
        // Create session object for UI
        const session: SimpleCallSession = {
          id: callId,
          callType: 'audio',
          roomCode: callId,
          userName: userName,
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        
        setCallSession(session);
        setIsAudioCall(true);
        setShowCall(true);
        
        console.log('[HomeScreen] Audio call started:', callId);
      } else {
        // Use simpleCallService for video calls
        const session = await simpleCallService.createCallSession({
          callType,
          userName,
          reason,
          priority: reason.includes('Emergency') ? 'emergency' : 'medium',
        });
        
        await simpleCallService.startCall(session);
        
        setCallSession(session);
        setIsAudioCall(false);
        setShowCall(true);
        
        console.log('[HomeScreen] Video call started:', session.roomCode);
      }
    } catch (error: any) {
      console.error('[HomeScreen] ❌ Failed to start call:', error);
      console.error('[HomeScreen] Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      });
      Alert.alert(
        'Call Error',
        `Failed to start ${callType} call: ${error?.message || 'Unknown error'}\n\nPlease try again or contact support.`,
        [{ text: 'OK' }]
      );
    } finally {
      setIsStartingCall(false);
      setCallPriorityActive(false); // Reset priority flag on error too
    }
  }, []);
  
  // Initiate emergency response (trigger emergency and start video call)
  const initiateEmergencyResponse = useCallback(async (options?: { alertDescription?: string; callReason?: string }) => {
    if (emergencyResponseInFlightRef.current) {
      console.warn('[HomeScreen] ⚠️ Emergency response already in flight - skipping duplicate trigger');
      return;
    }
    emergencyResponseInFlightRef.current = true;

    console.log('🚨 ========================================');
    console.log('🚨 INITIATING EMERGENCY RESPONSE');
    console.log('🚨 ========================================');
    const alertDescription = options?.alertDescription || 'Emergency button pressed - User requested immediate assistance';
    const callReason = options?.callReason || 'Emergency video call - user requested immediate assistance';
    console.log('[HomeScreen] Alert description:', alertDescription);
    console.log('[HomeScreen] Call reason:', callReason);

    try {
      // Validate session is not expired before emergency
      // ensureValidSession() handles token refresh internally
      const { ensureValidSession: getValidSession } = await import('@/lib/supabase');
      const currentSession = await getValidSession();

      if (!currentSession?.user) {
        console.error('[HomeScreen] ❌ No session available for emergency');
        Alert.alert(
          'Session Expired',
          'Your session has expired. Please restart the app to continue.',
          [{ text: 'OK' }]
        );
        emergencyResponseInFlightRef.current = false;
        return;
      }

      if (__DEV__) console.log('[HomeScreen] ✅ Session valid for emergency, user ID:', currentSession.user.id);

      // Trigger emergency — pass validated userId and accessToken to avoid
      // redundant getSession() calls that contend on the SDK auth lock.
      console.log('[HomeScreen] Step 1: Triggering emergency via EmergencyService...');
      const result = await triggerEmergency({
        description: alertDescription,
        userId: currentSession.user.id,
        accessToken: currentSession.access_token,
      });

      console.log('[HomeScreen] Emergency trigger result:', result);

      if (!result.success) {
        console.error('[HomeScreen] ❌ Emergency trigger FAILED:', result.error);
        // Don't return — still proceed to video call. The video call is the
        // critical safety feature; the DB record is secondary.
        showEmergencyStatus('🚨 Connecting to DeepHorizon agent...', 3000);
      } else {
        console.log('[HomeScreen] ✅ Emergency triggered successfully!');
        console.log('[HomeScreen] Emergency ID:', result.emergencyId);
        showEmergencyStatus('🚨 Emergency sent to DeepHorizon agents', 3000);
      }

      // Brief delay to allow message to be visible before video call starts
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if component is still mounted after delay
      if (!mountedRef.current) return;

      console.log('[HomeScreen] Step 2: Starting emergency video call...');

      // Start emergency video call — ALWAYS attempt even if DB insert failed
      await startCall('video', callReason);

      console.log('[HomeScreen] ✅ Emergency video call started successfully');
      console.log('[HomeScreen] 🚨 EMERGENCY RESPONSE COMPLETE');
      console.log('[HomeScreen] ========================================');
    } catch (error: any) {
      console.error('[HomeScreen] ❌ Emergency response EXCEPTION:', error);
      console.error('[HomeScreen] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      Alert.alert(
        'Emergency Alert Error',
        `An error occurred: ${error?.message || 'Unknown error'}\n\nPlease try again or contact support immediately.`,
        [{ text: 'OK' }]
      );
    } finally {
      emergencyResponseInFlightRef.current = false;
    }
  }, [triggerEmergency, startCall, showEmergencyStatus]);
  
  // Handle emergency timeout (countdown expired)
  const handleEmergencyTimeout = useCallback(async () => {
    /**
     * ✅ CRITICAL FIX: Don't set emergencyResponseInFlightRef here!
     * The initiateEmergencyResponse() function handles this flag internally.
     * Setting it here causes a race condition where the flag is true when
     * initiateEmergencyResponse checks it, causing the emergency to be skipped.
     *
     * PREVIOUS BUG: Line 292 set the flag to true, then line 302 called
     * initiateEmergencyResponse(), which checked the flag at line 219 and
     * skipped the emergency creation!
     */
    if (emergencyResponseInFlightRef.current) {
      console.warn('[HomeScreen] Emergency timeout triggered but response already in flight');
      return;
    }

    console.log('[HomeScreen] 🚨 EMERGENCY TIMEOUT - Countdown expired!');
    console.log('[HomeScreen] Closing modal and triggering emergency...');

    emergencyActiveRef.current = false;
    setIsEmergencyActive(false);
    setShowEmergencyPasskey(false);
    setEmergencyDeadline(null);

    console.log('[HomeScreen] Calling initiateEmergencyResponse...');
    await initiateEmergencyResponse({
      alertDescription: 'Emergency escalation: countdown expired without verification',
      callReason: 'Emergency video call - countdown expired',
    });
    console.log('[HomeScreen] initiateEmergencyResponse completed');
  }, [initiateEmergencyResponse]);
  
  // Emergency countdown timer
  useEffect(() => {
    if (!isEmergencyActive || !emergencyDeadline) {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((emergencyDeadline - Date.now()) / 1000));
      setEmergencyCountdown(remaining);
      
      if (remaining <= 0) {
        // Countdown expired - trigger emergency
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        handleEmergencyTimeout().catch((err: any) => {
          console.error('[HomeScreen] Emergency timeout handler error:', err);
        });
      }
    };
    
    updateCountdown();
    countdownIntervalRef.current = setInterval(updateCountdown, 100);
    
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [isEmergencyActive, emergencyDeadline, handleEmergencyTimeout]);
  
  // Ref-based guard to prevent double-submit (state closures can be stale on rapid taps)
  const emergencyProcessingRef = useRef(false);

  // Handle emergency passkey submit
  const handleEmergencyPasskeySubmit = useCallback(async () => {
    if (emergencyProcessingRef.current) return;

    /**
     * ✅ CRITICAL FIX: Check mounted state before updating
     */
    if (!mountedRef.current) return;

    emergencyProcessingRef.current = true;
    setIsEmergencyProcessing(true);

    try {
      // Validate passkey — use detailed result to distinguish wrong passkey from auth errors
      const passkeyResult = await verifyEmergencyPasskeyDetailed(emergencyPasskey);

      /**
       * CRITICAL FIX: After async operation, check if component is still mounted
       * The await above could take time, and component might unmount during that time
       */
      if (!mountedRef.current) return;

      // Helper to clean up emergency state
      const cleanupEmergencyState = () => {
        emergencyActiveRef.current = false;
        setIsEmergencyActive(false);
        setShowEmergencyPasskey(false);
        setEmergencyPasskey('');
        setEmergencyDeadline(null);
        setIsEmergencyProcessing(false);
        emergencyProcessingRef.current = false;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };

      if (passkeyResult.valid) {
        // Correct passkey - cancel emergency
        cleanupEmergencyState();

        Alert.alert(
          'Emergency Cancelled',
          'Emergency alert has been successfully cancelled.',
          [{ text: 'OK' }]
        );
      } else if (passkeyResult.isSystemError) {
        // Auth/system error — don't trigger emergency (it would also fail).
        // Show error and let user retry or dismiss.
        console.error('[HomeScreen] Passkey verification system error:', passkeyResult.errorMessage);
        cleanupEmergencyState();

        Alert.alert(
          'Verification Error',
          'Could not verify your passkey due to a connection error. Emergency has been cancelled. Please try again if needed.',
          [{ text: 'OK' }]
        );
      } else {
        // Wrong passkey - trigger emergency immediately
        const shake = Animated.sequence([
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: -10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ]);
        shake.start();

        cleanupEmergencyState();

        await initiateEmergencyResponse({
          alertDescription: 'Emergency escalation: incorrect passkey entered',
          callReason: 'Emergency video call - incorrect passkey',
        });

        // Check mounted again after emergency response
        if (!mountedRef.current) return;

        Alert.alert(
          'EMERGENCY ALERT ACTIVATED',
          'Incorrect passkey entered. Security agents are connecting with you right now.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[HomeScreen] Error validating emergency passkey:', error);
      // On unexpected error, cancel emergency gracefully (don't trigger — it would likely fail too)
      emergencyActiveRef.current = false;
      setEmergencyPasskey('');
      setIsEmergencyActive(false);
      setShowEmergencyPasskey(false);
      setEmergencyDeadline(null);
      setIsEmergencyProcessing(false);
      emergencyProcessingRef.current = false;

      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }

      if (!mountedRef.current) return;

      Alert.alert(
        'Verification Error',
        'An unexpected error occurred while verifying your passkey. Emergency has been cancelled for safety. Please try again if needed.',
        [{ text: 'OK' }]
      );
    }
  }, [emergencyPasskey, isEmergencyProcessing, initiateEmergencyResponse, shakeAnimation]);
  
  // Begin emergency (called when button is pressed and held for 3 seconds)
  // Ref-based guard for beginEmergency to prevent double-trigger from rapid taps
  // (state-based guards suffer from stale closures on fast taps)
  const emergencyActiveRef = useRef(false);

  const beginEmergency = useCallback(() => {
    if (emergencyActiveRef.current || isEmergencyActive || isEmergencyProcessing) {
      console.log('🚨 Emergency already active, ignoring button press');
      return;
    }

    // Guard: auth must be fully initialized before emergency can be triggered.
    // Without this, the emergency API call will fail with "User does not exist"
    // if the session JWT references a user that hasn't been fully hydrated.
    if (!auth.isAuthReady) {
      console.warn('🚨 Emergency blocked: auth not ready yet');
      Alert.alert(
        'Please Wait',
        'App is still initializing. Please try again in a moment.',
        [{ text: 'OK' }]
      );
      return;
    }

    console.log('🚨 Emergency triggered - initiating emergency protocol');
    emergencyActiveRef.current = true;
    setIsEmergencyActive(true);
    setEmergencyCountdown(EMERGENCY_PASSKEY_TIMEOUT_SECONDS);
    setEmergencyDeadline(Date.now() + EMERGENCY_PASSKEY_TIMEOUT_SECONDS * 1000);

    // Always show passkey modal (like old app) - user can cancel or let it expire
    setShowEmergencyPasskey(true);
    setEmergencyPasskey('');
    setIsEmergencyProcessing(false);
    emergencyResponseInFlightRef.current = false;
    console.log('🚨 Emergency modal should now be visible - showEmergencyPasskey:', true);
  }, [isEmergencyActive, isEmergencyProcessing, auth.isAuthReady]);
  
  // Handle logout
  const handleLogout = async () => {
    try {
      // Clean up any active services
      if (callSession) {
        await simpleCallService.endCall(callSession.id);
      }
      setShowCall(false);
      setCallSession(null);
      setCallPriorityActive(false);
      
      // Sign out
      await auth.signOut();
      console.log('[HomeScreen] Logout successful');
    } catch (error) {
      console.error('[HomeScreen] Logout error:', error);
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
  };

  const handleEmergencyPress = () => {
    console.log('🚨 Emergency button pressed - triggering immediately');
    beginEmergency();
  };
  
  const handleEmergencyPressOut = () => {
    // If emergency hasn't been activated yet (within 3 seconds), do nothing
    // The EmergencyButton component handles the 3-second press detection
  };

  const toggleSiren = useCallback(async () => {
    await siren.toggleSiren();
  }, [siren]);

  const handleServicePress = (service: string) => {
    if (service === 'Video Monitor Me') {
      (navigation as any).navigate('VideoMonitor');
    } else if (service === 'Track Me On The Go') {
      (navigation as any).navigate('Tracking');
    } else if (service === 'Schedule Check In') {
      (navigation as any).navigate('ScheduleCheckIn');
    } else if (service === 'Book A Bodyguard') {
      (navigation as any).navigate('BookBodyguard');
    } else {
      // TODO: Implement other service modals
      Alert.alert('Service', `${service} feature will be implemented`);
    }
  };
  
  // Check camera permission
  React.useEffect(() => {
    const checkPermission = async () => {
      try {
        const { status } = await Camera.getCameraPermissionsAsync();
        setCameraPermission(status === 'granted');
      } catch (error) {
        console.error('Error checking camera permission:', error);
      }
    };
    checkPermission();
  }, []);
  
  
  // Handle end video session
  const handleEndVideoSession = async () => {
    if (callSession) {
      if (isAudioCall) {
        // End audio call
        const { audioCallService } = await import('@/services/audioCall.service');
        await audioCallService.endCall();
      } else {
        // End video call
        await simpleCallService.endCall(callSession.id);
      }
    }
    setShowCall(false);
    setCallSession(null);
    setIsAudioCall(false);
    setCallPriorityActive(false);
  };
  
  // Handle call end
  const handleCallEnd = () => {
    handleEndVideoSession();
  };
  
  // Handle call error
  const handleCallError = (error: string) => {
    console.error('[HomeScreen] Call error:', error);
    Alert.alert('Call Error', error);
    handleEndVideoSession();
  };

  const handleStartAudioCall = async () => {
    if (isStartingCall) return;
    
    Alert.alert(
      'Call Security Agent',
      'Start an audio call with your assigned security agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Audio Call',
          onPress: async () => {
            const hasAccess = await checkSubscriptionAccess('Audio Call');
            if (!hasAccess) return;
            try {
              setIsStartingCall(true);
              await startCall('audio', 'Direct audio call from homepage');
            } catch (error) {
              console.error('[HomeScreen] Failed to start audio call:', error);
              Alert.alert('Call Error', 'Failed to start audio call. Please try again.');
            } finally {
              setIsStartingCall(false);
            }
          }
        }
      ]
    );
  };

  const handleStartVideoCall = async () => {
    if (isStartingCall) return;
    
    // Check camera permission
    if (!cameraPermission) {
      Alert.alert(
        'Camera Permission Required',
        'Please grant camera permission to start a video call.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              const hasAccess = await checkSubscriptionAccess('Video Call');
              if (!hasAccess) return;
              const { status } = await Camera.requestCameraPermissionsAsync();
              if (status === 'granted') {
                setCameraPermission(true);
                await startCall('video', 'Direct video call from homepage');
              }
            }
          }
        ]
      );
      return;
    }
    
    Alert.alert(
      'Video Call Security Agent',
      'Start a video call with your assigned security agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Video Call',
          onPress: async () => {
            const hasAccess = await checkSubscriptionAccess('Video Call');
            if (!hasAccess) return;
            await startCall('video', 'Direct video call from homepage');
          }
        }
      ]
    );
  };

  /**
   * ✅ PERFORMANCE FIX: Use useCallback to prevent unnecessary re-renders
   * This function is passed to child components, so stable reference improves performance
   */
  const handleOpenChat = useCallback(() => {
    // Open immediately; verify access in background and close if denied.
    setShowChatbox(true);
    void checkSubscriptionAccess('Chat')
      .then((has) => {
        if (!has) setShowChatbox(false);
      })
      .catch(() => {});
  }, []); // No dependencies - function is stable

  /**
   * Send chat message. Accepts text directly to avoid stale-closure issues
   * (e.g. quick responses setting state then immediately calling send).
   */
  const handleSendMessage = useCallback(async (text?: string) => {
    const content = (text || chatInput).trim();
    if (!content || isSendingChat) {
      return;
    }
    setIsSendingChat(true);
    setChatInput('');
    try {
      await chat.sendMessage(content);
    } catch (error) {
      console.error('[HomeScreen] Error sending message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
      setChatInput(content); // Restore input on error
    } finally {
      setIsSendingChat(false);
    }
  }, [chatInput, chat.sendMessage, isSendingChat]);

  return (
    <View style={{ flex: 1, backgroundColor: isSirenActive ? siren.bgColor : undefined }}>
      <StatusBar 
        barStyle={isSirenActive ? "light-content" : "dark-content"} 
        backgroundColor={isSirenActive ? siren.bgColor : "#ffffff"} 
        translucent={false} 
      />
      <SafeAreaView style={[layoutStyles.container, isSirenActive && { backgroundColor: siren.bgColor }]} edges={['top', 'bottom']}>
        {/* Professional Header */}
        <View style={[layoutStyles.newHeader, { paddingTop: 16 }]}>
          <View style={layoutStyles.headerLeft}>
            <View style={layoutStyles.logoContainer}>
              <Image 
                source={require('../../assets/LOGOnew.png')} 
                style={layoutStyles.logoImage} 
              />
            </View>
          </View>

          <View style={layoutStyles.headerCenter}>
            <Text style={layoutStyles.newHeaderTitle} numberOfLines={1} adjustsFontSizeToFit={true}>
              DeepHorizon
            </Text>
          </View>

          <View style={layoutStyles.headerRight}>
            <TouchableOpacity
              style={layoutStyles.menuButton}
              onPress={() => setIsMenuOpen(true)}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Open menu"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={layoutStyles.menuDash} />
              <View style={layoutStyles.menuDash} />
              <View style={layoutStyles.menuDash} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Professional Emergency Button */}
        <EmergencyButton
          onPressIn={handleEmergencyPress}
          onPressOut={handleEmergencyPressOut}
          isEmergencyActive={isEmergencyActive}
        />

        {/* Service Cards */}
        <ScrollView 
          style={{ flex: 1 }}
          contentContainerStyle={[
            serviceCardStyles.servicesContainer, 
            { 
              flexGrow: 1,
              paddingBottom: 16,
              minHeight: Math.max(
                (screenHeight - insets.top - insets.bottom) - ((Platform.OS === 'ios' ? 110 : 80) + (Platform.OS === 'ios' ? 70 : 60)),
                screenHeight * 0.5
              ),
            }
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          scrollEnabled={true}
        >
          <View style={serviceCardStyles.servicesGridRow}>
            <TouchableOpacity
              style={[serviceCardStyles.serviceCard, serviceCardStyles.videoCard]}
              onPress={() => handleServicePress('Video Monitor Me')}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Video Monitor Me. Live camera access for agents"
              accessibilityRole="button"
            >
              <MaterialIcons name="videocam" size={32} color="#34495e" />
              <Text style={serviceCardStyles.serviceTitle}>Video Monitor Me</Text>
              <Text style={serviceCardStyles.serviceSubtitle}>Live camera access for agents</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[serviceCardStyles.serviceCard, serviceCardStyles.trackingCard]}
              onPress={() => handleServicePress('Track Me On The Go')}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Track Me On The Go. Real-time location sharing"
              accessibilityRole="button"
            >
              <MaterialIcons name="my-location" size={32} color="#2C3E50" />
              <Text style={serviceCardStyles.serviceTitle}>Track Me On The Go</Text>
              <Text style={serviceCardStyles.serviceSubtitle}>Real-time location sharing</Text>
            </TouchableOpacity>
          </View>
          <View style={serviceCardStyles.servicesGridRow}>
            <TouchableOpacity
              style={[serviceCardStyles.serviceCard, serviceCardStyles.checkinCard]}
              onPress={() => handleServicePress('Schedule Check In')}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Schedule Check In. Automated safety calls"
              accessibilityRole="button"
            >
              <MaterialIcons name="schedule" size={32} color="#2C3E50" />
              <Text style={serviceCardStyles.serviceTitle}>Schedule Check In</Text>
              <Text style={serviceCardStyles.serviceSubtitle}>Automated safety calls</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[serviceCardStyles.serviceCard, serviceCardStyles.bodyguardCard]}
              onPress={() => handleServicePress('Book A Bodyguard')}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Book A Bodyguard. Professional protection services"
              accessibilityRole="button"
            >
              <FontAwesome5 name="user-shield" size={32} color="#2C3E50" />
              <Text style={serviceCardStyles.serviceTitle}>Book A Bodyguard</Text>
              <Text style={serviceCardStyles.serviceSubtitle}>Professional protection services</Text>
            </TouchableOpacity>
          </View>
          
          {/* Security Agent Contact Card */}
          <View
            style={serviceCardStyles.securityAgentCard}
            accessible={true}
            accessibilityLabel="Security Agent contact options"
          >
            <Text style={serviceCardStyles.securityAgentTitle}>Security Agent</Text>
            <View style={serviceCardStyles.contactIcons}>
              <TouchableOpacity
                style={[serviceCardStyles.contactIcon, isStartingCall && { opacity: 0.5 }]}
                onPress={handleStartAudioCall}
                disabled={isStartingCall}
                accessible={true}
                accessibilityLabel="Call security agent"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="phone" size={24} color="#2C3E50" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[serviceCardStyles.contactIcon, serviceCardStyles.contactIconSpacing]}
                onPress={handleOpenChat}
                accessible={true}
                accessibilityLabel="Chat with security agent"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="chat" size={24} color="#2C3E50" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[serviceCardStyles.contactIcon, serviceCardStyles.contactIconSpacing, isStartingCall && { opacity: 0.5 }]}
                onPress={handleStartVideoCall}
                disabled={isStartingCall}
                accessible={true}
                accessibilityLabel="Video call security agent"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="videocam" size={24} color="#2C3E50" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Siren Button */}
          <View style={emergencyStyles.sirenSection}>
            <TouchableOpacity
              style={[
                emergencyStyles.sirenButton,
                isSirenActive && emergencyStyles.sirenButtonActive
              ]}
              onPress={toggleSiren}
              activeOpacity={0.8}
              accessible={true}
              accessibilityLabel={isSirenActive ? 'Stop siren. Tap to stop emergency alert' : 'Activate siren. Emergency alert sound'}
              accessibilityRole="button"
            >
              <View style={emergencyStyles.actionIconContainer}>
                <MaterialIcons name="volume-up" size={20} color="#ffffff" />
              </View>
              <View style={emergencyStyles.actionTextContainer}>
                <Text style={emergencyStyles.actionMainText}>
                  {isSirenActive ? 'STOP SIREN' : 'SIREN'}
                </Text>
                <Text style={emergencyStyles.actionSubText}>
                  {isSirenActive
                    ? 'Tap to stop emergency alert'
                    : 'Activate emergency alert'
                  }
                </Text>
              </View>
              <View style={emergencyStyles.actionArrow}>
                <MaterialIcons name="keyboard-arrow-right" size={20} color="#ffffff" />
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
        
        {/* Audio Call Interface - Full Screen */}
        {showCall && callSession && isAudioCall && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: '#1a1a1a'
          }}>
            <AudioCallInterface
              callId={callSession.roomCode}
              userName={callSession.userName}
              onCallEnd={handleCallEnd}
              onCallError={handleCallError}
            />
          </View>
        )}
        
        {/* Stream Video Call Interface - Full Screen */}
        {/* {showCall && callSession && !isAudioCall && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: '#0B132B'
          }}>
            <Suspense fallback={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B132B' }}>
                <ActivityIndicator size="large" color="#ffffff" />
                <Text style={{ color: '#ffffff', marginTop: 16 }}>Loading call interface...</Text>
              </View>
            }>
              <StreamVideoCallDedicated
                callId={callSession.roomCode}
                userName={callSession.userName}
                onCallEnd={handleCallEnd}
                onCallError={handleCallError}
              />
            </Suspense>
          </View>
        )} */}
        
        {/* Slide Menu */}
        <SlideMenu
          visible={isMenuOpen}
          onClose={() => setIsMenuOpen(false)}
          onLogout={handleLogout}
          navigation={navigation}
        />
        
        {/* Emergency Passkey Modal */}
        {/* ✅ SECURITY FIX: Removed hardcoded demoPasskey="1234" - never expose demo passkeys in production */}
        <EmergencyPasskeyModal
          visible={showEmergencyPasskey}
          onSubmit={handleEmergencyPasskeySubmit}
          title="Emergency Alert"
          subtitle="Enter passkey to cancel"
          icon="warning"
          iconColor="#CC0022"
          isEmergency={true}
          emergencyCountdown={emergencyCountdown}
          emergencyDeadlineMs={emergencyDeadline ? emergencyDeadline : undefined}
          enteredPasskey={emergencyPasskey}
          onPasskeyChange={setEmergencyPasskey}
          isLoading={isEmergencyProcessing}
          shakeAnimation={shakeAnimation}
        />
        
        {/* Chat Box */}
        <ChatBox
          visible={showChatbox}
          chatMessages={chat.messages}
          chatInput={chatInput}
          isTyping={chat.isTyping}
          isSending={isSendingChat}
          onClose={() => setShowChatbox(false)}
          onChatInputChange={setChatInput}
          onSendMessage={handleSendMessage}
          formatChatTime={formatChatTime}
        />

        {/* Emergency Status Message - Auto-dismissing overlay */}
        {emergencyStatusMessage && (
          <Animated.View
            style={{
              position: 'absolute',
              top: insets.top + 80,
              left: 20,
              right: 20,
              backgroundColor: '#CC0022',
              borderRadius: 12,
              padding: 16,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
              zIndex: 10000,
              opacity: statusOpacity,
            }}
          >
            <Text
              style={{
                color: '#ffffff',
                fontSize: 16,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              {emergencyStatusMessage}
            </Text>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
};

export default HomeScreen;

