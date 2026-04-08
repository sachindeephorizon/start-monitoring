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
import SlideMenu from '@/components/navigation/SlideMenu';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';
import { simpleCallService, SimpleCallSession } from '@/services/simpleCall.service';
import { setCallPriorityActive } from '@/services/callPriority';
import { Camera } from 'expo-camera';
import { useAuth } from '@/core/auth';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useEmergencyFlow } from '@/features/emergency/emergency.flow';
import { useIOSCompatibleSiren } from '@/hooks/useIOSCompatibleSiren';
import { useSubscription } from '@/hooks/useSubscription';
import { useCheckIn } from '@/hooks/useCheckIn';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';
import { consumePendingNotificationNav } from '@/core/notifications/notification.router';
import { Service } from '@/types/services';
import { getMyThreads } from '@/api/chat';
import { getActiveTrackMeSession, getTrackMeState } from '@/api/schedule-checking';
import { chatSocketService, NotificationEnvelope } from '@/realtime/core';
import SecurityAgentContactCard from '@/components/home/SecurityAgentContactCard';
import { EmergencyService } from '@/features/emergency/emergency.service';

interface HomeScreenProps {
  navigation: any;
}

const { height: screenHeight } = Dimensions.get('window');

const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object';
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getSocketEventName = (envelope: NotificationEnvelope): string | null => {
  if (typeof envelope?.event === 'string' && envelope.event !== 'notification') {
    return envelope.event;
  }

  if (isObject(envelope?.data) && typeof envelope.data.event === 'string') {
    return envelope.data.event;
  }

  return null;
};

const getSocketEventData = (envelope: NotificationEnvelope): Record<string, unknown> => {
  if (!isObject(envelope?.data)) {
    return {};
  }

  if (isObject(envelope.data.data)) {
    return envelope.data.data;
  }

  return envelope.data;
};

const HomeScreen: React.FC<HomeScreenProps> = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const auth = useAuth();
  const { hasAccess: hasSubscriptionAccess } = useSubscription();
  const checkIn = useCheckIn({ enableDueWatcher: false });
  const insets = useSafeAreaInsets();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [cameraPermission, setCameraPermission] = useState(false);
  const [hasActiveChatBadge, setHasActiveChatBadge] = useState(false);
  const [hasActiveTrackMeSession, setHasActiveTrackMeSession] = useState(false);
  const [trackMeBadgeLabel, setTrackMeBadgeLabel] = useState<'Active' | 'End Session'>('Active');
  const hasActiveScheduleCheckIn = checkIn.scheduledCheckIns.some((item) => item.type === 'SCHEDULE_CHECKIN');
  const activeScheduleBlinkOpacity = useRef(new Animated.Value(1)).current;
  const activeTrackMeBlinkOpacity = useRef(new Animated.Value(1)).current;
  
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
  
  // Emergency state (shared across screens)
  const {
    isEmergencyActive,
    showEmergencyPasskey,
    emergencyPasskey,
    setEmergencyPasskey,
    emergencyCountdown,
    emergencyDeadline,
    isEmergencyProcessing,
    beginEmergency,
    submitAbortPasskey,
    startEmergencyCallFromState,
    activeEmergencyId,
  } = useEmergencyFlow();
  const lastEmergencyRedirectRef = useRef<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      void checkIn.loadCheckIns().catch((error) => {
        console.error('[HomeScreen] Failed to refresh schedule check-ins:', error);
      });
    }, [checkIn.loadCheckIns])
  );

  const refreshChatBadge = useCallback(async () => {
    try {
      const threads = await getMyThreads();
      const hasOpenThread = threads.some((thread) => thread.status === 'OPEN');
      setHasActiveChatBadge(hasOpenThread);
    } catch (error) {
      console.warn('[HomeScreen] Failed to refresh chat badge state:', error);
    }
  }, []);

  const refreshTrackMeBadge = useCallback(async () => {
    try {
      const active = await getActiveTrackMeSession();
      if (!active?.isLive) {
        setHasActiveTrackMeSession(false);
        setTrackMeBadgeLabel('Active');
        return;
      }

      setHasActiveTrackMeSession(true);

      try {
        const state = await getTrackMeState(active.checkinId, 1);
        const shouldEnd = state.stats.remainingScheduled <= 0;
        setTrackMeBadgeLabel(shouldEnd ? 'End Session' : 'Active');
      } catch {
        // Keep existing label if state fetch fails.
      }
    } catch (error) {
      console.warn('[HomeScreen] Failed to refresh Track Me badge state:', error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshChatBadge();
    }, [refreshChatBadge])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshTrackMeBadge();
    }, [refreshTrackMeBadge])
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const maybeRedirectToEmergency = async () => {
        // Keep passkey countdown flow on Home until that modal completes.
        if (showEmergencyPasskey) {
          return;
        }

        const context = await EmergencyService.fetchActiveEmergencyContext();
        if (cancelled) {
          return;
        }

        if (!context || context.status !== 'ACTIVE' || !context.emergencyId) {
          lastEmergencyRedirectRef.current = null;
          return;
        }

        if (lastEmergencyRedirectRef.current === context.emergencyId) {
          return;
        }

        lastEmergencyRedirectRef.current = context.emergencyId;
        (navigation as any).navigate('Emergency', { emergencyId: context.emergencyId });
      };

      void maybeRedirectToEmergency();

      return () => {
        cancelled = true;
      };
    }, [navigation, showEmergencyPasskey]),
  );

  useEffect(() => {
    if (!auth.isAuthReady || !auth.user?.id) return;

    const notificationHandler = (envelope: NotificationEnvelope) => {
      const eventName = getSocketEventName(envelope);
      if (!eventName) return;

      if (eventName === 'chat.message.created') {
        const payload = getSocketEventData(envelope);
        const senderId = asString(payload.senderId);

        if (senderId && senderId === auth.user?.id) {
          return;
        }

        setHasActiveChatBadge(true);
        return;
      }

      if (eventName === 'chat.thread.resolved' || eventName === 'chat.thread.assigned') {
        void refreshChatBadge();
        return;
      }

      if (eventName === 'track_me') {
        void refreshTrackMeBadge();
      }
    };

    chatSocketService.onNotification(notificationHandler);

    return () => {
      chatSocketService.offNotification(notificationHandler);
    };
  }, [auth.isAuthReady, auth.user?.id, refreshChatBadge, refreshTrackMeBadge]);

  useEffect(() => {
    if (!auth.isAuthReady || !auth.user?.id) return;
    void refreshTrackMeBadge();
  }, [auth.isAuthReady, auth.user?.id, refreshTrackMeBadge]);

  useEffect(() => {
    if (!hasActiveTrackMeSession) {
      activeTrackMeBlinkOpacity.stopAnimation();
      activeTrackMeBlinkOpacity.setValue(1);
      return;
    }

    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(activeTrackMeBlinkOpacity, {
          toValue: 0.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(activeTrackMeBlinkOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    blink.start();

    return () => {
      blink.stop();
      activeTrackMeBlinkOpacity.stopAnimation();
      activeTrackMeBlinkOpacity.setValue(1);
    };
  }, [hasActiveTrackMeSession, activeTrackMeBlinkOpacity]);

  useEffect(() => {
    if (!hasActiveScheduleCheckIn) {
      activeScheduleBlinkOpacity.stopAnimation();
      activeScheduleBlinkOpacity.setValue(1);
      return;
    }

    const blink = Animated.loop(
      Animated.sequence([
        Animated.timing(activeScheduleBlinkOpacity, {
          toValue: 0.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(activeScheduleBlinkOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    blink.start();

    return () => {
      blink.stop();
      activeScheduleBlinkOpacity.stopAnimation();
      activeScheduleBlinkOpacity.setValue(1);
    };
  }, [hasActiveScheduleCheckIn, activeScheduleBlinkOpacity]);

  const shakeAnimation = useRef(new Animated.Value(0)).current;

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
  const statusDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
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
        // Navigate to dedicated audio call screen.
        // AudioCallScreen will generate callId + initiate the call internally.
        (navigation as any).navigate('AudioCall');
        
        console.log('[HomeScreen] Audio call screen opened');
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
  }, [auth.user, navigation]);
  
  // Ref-based guard to prevent duplicate modal submit taps.
  const emergencySubmitInFlightRef = useRef(false);
  const emergencyPressInFlightRef = useRef(false);

  // Handle emergency passkey submit
  const handleEmergencyPasskeySubmit = useCallback(async () => {
    if (emergencySubmitInFlightRef.current) return;

    /**
     * ✅ CRITICAL FIX: Check mounted state before updating
     */
    if (!mountedRef.current) return;

    emergencySubmitInFlightRef.current = true;

    try {
      const result = await submitAbortPasskey();

      if (!mountedRef.current) return;

      if (result.success) {
        showEmergencyStatus('Emergency cancelled successfully.', 1800);
        Alert.alert('Emergency Cancelled', 'Your emergency request has been cancelled.');
        return;
      }

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

      Alert.alert(
        'Abort Failed',
        result.error || 'Unable to cancel emergency. Continuing emergency flow now.',
        [{ text: 'Continue', onPress: () => { void startEmergencyCallFromState(); } }],
      );
    } catch (error) {
      console.error('[HomeScreen] Error aborting emergency:', error);
      Alert.alert('Abort Failed', 'Unable to verify abort request. Continuing emergency flow now.', [
        { text: 'Continue', onPress: () => { void startEmergencyCallFromState(); } },
      ]);
    } finally {
      emergencySubmitInFlightRef.current = false;
    }
  }, [submitAbortPasskey, shakeAnimation, showEmergencyStatus, startEmergencyCallFromState]);
  
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
    if (emergencyPressInFlightRef.current || isEmergencyProcessing || isEmergencyActive) {
      return;
    }

    emergencyPressInFlightRef.current = true;
    console.log('🚨 Emergency button pressed - triggering immediately');
    void (async () => {
      try {
        const result = await beginEmergency();
        if (!result.success) {
          Alert.alert('Emergency Failed', result.error || 'Failed to trigger emergency. Please try again.');
          return;
        }
        showEmergencyStatus('Emergency triggered. Enter passkey within 10 seconds to abort.', 2500);
      } finally {
        emergencyPressInFlightRef.current = false;
      }
    })();
  };
  
  const handleEmergencyPressOut = () => {
    // If emergency hasn't been activated yet (within 3 seconds), do nothing
    // The EmergencyButton component handles the 3-second press detection
  };

  const toggleSiren = useCallback(async () => {
    await siren.toggleSiren();
  }, [siren]);

  const ensureSubscriptionAccess = useCallback(async (featureName: string) => {
    if (hasSubscriptionAccess) {
      return true;
    }

    return checkSubscriptionAccess(featureName);
  }, [hasSubscriptionAccess]);

  const handleServicePress = async (service: string) => {
    if (service === 'Video Monitor Me') {
      const hasAccess = await ensureSubscriptionAccess('Video Monitor Me');
      if (!hasAccess) return;
      (navigation as any).navigate('VideoMonitor');
    } else if (service === 'Track Me On The Go') {
      const hasAccess = await ensureSubscriptionAccess('Track Me On The Go');
      if (!hasAccess) return;
      (navigation as any).navigate('Tracking');
    } else if (service === 'Schedule Check In') {
      const hasAccess = await ensureSubscriptionAccess('Schedule Check In');
      if (!hasAccess) return;
      (navigation as any).navigate('ScheduleCheckIn');
    } else if (service === 'Book A Bodyguard') {
      const hasAccess = await ensureSubscriptionAccess('Book A Bodyguard');
      if (!hasAccess) return;
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

    const hasAccess = await ensureSubscriptionAccess('Audio Call');
    if (!hasAccess) return;
    
    Alert.alert(
      'Call Security Agent',
      'Start an audio call with your assigned security agent?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Audio Call',
          onPress: async () => {
            try {
              await startCall('audio', 'Direct audio call from homepage');
            } catch (error) {
              console.error('[HomeScreen] Failed to start audio call:', error);
              Alert.alert('Call Error', 'Failed to start audio call. Please try again.');
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
              const hasAccess = await ensureSubscriptionAccess('Video Call');
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
            const hasAccess = await ensureSubscriptionAccess('Video Call');
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
    ensureSubscriptionAccess('Chat').then((hasAccess) => {
      if (!hasAccess) return;
      (navigation as any).navigate('Chat');
    });
  }, [ensureSubscriptionAccess, navigation]);

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
          isDisabled={isEmergencyProcessing || emergencyPressInFlightRef.current}
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
              <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                <Text style={serviceCardStyles.serviceSubtitle}>Real-time location sharing</Text>
                {hasActiveTrackMeSession && (
                  <Animated.Text
                    style={{
                      marginLeft: 4,
                      color: trackMeBadgeLabel === 'End Session' ? '#E67E22' : '#1FA35B',
                      fontSize: 12,
                      fontWeight: '700',
                      opacity: activeTrackMeBlinkOpacity,
                      marginTop: 4,
                    }}
                  >
                    {trackMeBadgeLabel}
                  </Animated.Text>
                )}
              </View>
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
              <View style={{ flexDirection: 'column', alignItems: 'center' }}>
                <Text style={serviceCardStyles.serviceSubtitle}>Automated safety calls</Text>
                {hasActiveScheduleCheckIn && (
                  <Animated.Text
                    style={{
                      marginLeft: 4,
                      color: '#1FA35B',
                      fontSize: 12,
                      fontWeight: '700',
                      opacity: activeScheduleBlinkOpacity,
                      marginTop: 4,
                    }}
                  >
                    Active
                  </Animated.Text>
                )}
              </View>
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
          
          <SecurityAgentContactCard
            isStartingCall={isStartingCall}
            hasActiveChatBadge={hasActiveChatBadge}
            onStartAudioCall={handleStartAudioCall}
            onOpenChat={handleOpenChat}
            onStartVideoCall={handleStartVideoCall}
          />

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

