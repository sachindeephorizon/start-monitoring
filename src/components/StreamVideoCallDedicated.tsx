/**
 * Dedicated Stream Video Call Component for Mobile App
 * Video calls using Stream.io Video SDK
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Alert, ActivityIndicator, Platform, AppState, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PermissionsAndroid } from 'react-native';
import {
  StreamVideoClient,
  StreamVideo,
  StreamCall,
  CallingState,
  User,
  useCallStateHooks,
  ParticipantView,
  CallContent
} from '@stream-io/video-react-native-sdk';
import { MaterialIcons } from '@expo/vector-icons';
import { streamVideoServiceDedicated } from '@/services/streamVideoServiceDedicated';
import { backgroundCallNotificationService } from '@/services/backgroundCallNotification.service';
import { Camera } from 'expo-camera';
import * as DeviceInfo from 'expo-device';
import { MediaRecovery } from '@/services/mediaRecovery';
import { useInCallAudio } from '@/hooks/useInCallAudio';
import { logger } from '@/utils/logger';
import { runInteractionTask, iosImmediateInteractionOptions } from '@/utils/interactionGuard';
import { useAuth } from '@/core/auth';

interface StreamVideoCallDedicatedProps {
  callId: string;
  userName: string;
  onCallEnd: () => void;
  onCallError: (error: string) => void;
}

type StreamCallGateProps = {
  onHangup: () => void;
  isVideoEnabled: boolean;
  isSimulator: boolean;
  callRef: React.MutableRefObject<any>;
  onJoinedChange: (joined: boolean) => void;
  hasEverJoinedRef: React.MutableRefObject<boolean>;
};

const StreamCallGate: React.FC<StreamCallGateProps> = ({
  onHangup,
  isVideoEnabled,
  isSimulator,
  callRef,
  onJoinedChange,
  hasEverJoinedRef,
}) => {
  const { useCallCallingState } = useCallStateHooks();
  const callingState = useCallCallingState();
  const isJoined = callingState === CallingState.JOINED;
  // Sometimes the hook can lag a render behind; treat the underlying call state as authoritative.
  const isJoinedLike =
    isJoined || callRef.current?.state?.callingState === CallingState.JOINED;
  const didEndRef = useRef(false);

  // Avoid repeated state churn
  useEffect(() => {
    onJoinedChange(isJoinedLike);
  }, [isJoinedLike, onJoinedChange]);

  // Exit call UI if Stream reports LEFT, but only if we actually joined at least once.
  // iOS/Android: Do NOT auto-close the UI on transient LEFT.
  // Stream can briefly report LEFT during reconnects (WS close 1001) even though the call is recoverable.
  // We rely on explicit user hangup or `call.ended` to close the UI.

  // Media enable is owned by the parent `StreamVideoCallDedicated` component.
  // Rationale: iOS can be sensitive to when media is enabled; centralizing it avoids
  // duplicate enable attempts and makes it easier to add retries + publication checks.

  // IMPORTANT:
  // Do NOT mount CallContent before we're actually joined. On iOS, mounting CallContent against a "shell"
  // Call (or before the user is connected) can cause the SDK to trigger internal hangup flows, which then
  // closes our entire call UI and looks like it "needs swipes" to proceed.
  if (!isJoinedLike) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Connecting to video call...</Text>
      </View>
    );
  }

  // Only allow hangup once joined (prevents any auto-hangup during connect from closing our UI).
  return <CallContent onHangupCallHandler={onHangup} />;
};

const StreamVideoCallDedicated: React.FC<StreamVideoCallDedicatedProps> = ({
  callId,
  userName,
  onCallEnd,
  onCallError,
}) => {
  const CALL_TRACE = process.env.EXPO_PUBLIC_CALL_TRACE === 'true';
  const traceT0Ref = useRef<number>(Date.now());
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uiTick, setUiTick] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [isSimulator, setIsSimulator] = useState(false);
  const [isVideoTrackPublished, setIsVideoTrackPublished] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [connectionRetryCount, setConnectionRetryCount] = useState(0);
  const [hasJoined, setHasJoined] = useState(false);
  const [hasEverJoined, setHasEverJoined] = useState(false);
  // iOS: keep an authoritative ref (state updates can be delayed/batched and cause premature UI exit)
  const hasEverJoinedRef = useRef(false);
  const callStartTime = useRef(new Date());
  const clientRef = useRef<StreamVideoClient | null>(null);
  const callRef = useRef<any>(null);
  const videoTrackCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const mediaRecoveryRef = useRef(new MediaRecovery());
  const listenersAttachedRef = useRef(false);
  const isMountedRef = useRef(true);
  const republishCooldownRef = useRef<number>(0);
  const isVideoEnabledRef = useRef<boolean>(true);
  const isMutedRef = useRef<boolean>(false);
  const didInitialMediaEnableRef = useRef(false);
  // iOS reliability: in rare cases Stream state updates don't trigger a React render until an AppState "nudge".
  // We run a short-lived rAF watchdog to detect JOINED and flip UI immediately without requiring a swipe.
  const joinedWatchRafRef = useRef<number | null>(null);
  const userHangupRef = useRef(false);

  // Call hooks at top-level, never inside return/conditional
  // Only mark "active" once Stream reports JOINED. Starting audio routing earlier can destabilize iOS join.
  const isCallActive = !!client && !!call && hasJoined && !error;
  // Keep uiTick referenced so bundlers don't drop it; it is used purely to force a re-render on iOS.
  void uiTick;
  // Keep call audio routed and screen awake while active; use speaker for video calls
  useInCallAudio(isCallActive, true, 'video');

  // Keep desired media state for recovery
  useEffect(() => {
    isVideoEnabledRef.current = Boolean(isVideoEnabled);
    isMutedRef.current = Boolean(isMuted);
    mediaRecoveryRef.current.setDesired(Boolean(isVideoEnabled), !isMuted);
  }, [isMuted, isVideoEnabled]);

  useEffect(() => {
    // OPTIMIZATION: Warm up camera hardware early (non-blocking)
    const warmupCamera = async () => {
      try {
        if (Platform.OS !== 'web') {
          // await Camera.getAvailableCameraDevicesAsync(); // Removed as it may not exist in this version
        }
      } catch (error) {
        // Non-critical - camera will initialize on call start
      }
    };
    warmupCamera();

    // Detect if running on simulator
    const checkSimulator = async () => {
      const isDevice = await DeviceInfo.isDevice;
      setIsSimulator(!isDevice);
    };

    checkSimulator();
    // UI-FIRST: initialize Stream client/call shell immediately so the interface mounts fast,
    // then request permissions and join in the background.
    (async () => {
      try {
        // initClient is local (no token/network); safe to do early for instant UI.
        const ensuredClient = await streamVideoServiceDedicated.initClient();
        if (!clientRef.current) {
          setClient(ensuredClient);
          clientRef.current = ensuredClient;
        }

        // UI-FIRST: Create a call shell immediately so we don't show the "blue spinner" while token/connect/join runs.
        // We DO NOT mount CallContent until JOINED (StreamCallGate handles that), so this is safe on iOS.
        if (!callRef.current) {
          const preCreated = streamVideoServiceDedicated.preCreateCall(callId);
          if (preCreated) {
            callRef.current = preCreated;
            setCall(preCreated);
          }
        }
      } catch (e) {
        // If Stream SDK isn't available (Expo Go), we'll fail during join anyway.
      }
    })();

    requestPermissionsAndInitialize();

    // App foreground/background handling with proper AppState
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' && callRef.current) {
        // Pause camera when backgrounded to save battery
        callRef.current.camera?.disable?.().catch(() => { });
      } else if (nextAppState === 'active' && callRef.current && isVideoEnabledRef.current) {
        // Only re-enable Stream camera once JOINED. Enabling before JOINED can break join on iOS.
        if (callRef.current?.state?.callingState === CallingState.JOINED) {
          callRef.current.camera?.enable?.().catch(() => { });
        }
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      isMountedRef.current = false;
      if (joinedWatchRafRef.current != null) {
        try {
          cancelAnimationFrame(joinedWatchRafRef.current);
        } catch { }
        joinedWatchRafRef.current = null;
      }
      if (videoTrackCheckInterval.current) {
        clearInterval(videoTrackCheckInterval.current);
      }
      // Cleanup AppState subscription
      appStateSubscription?.remove();
      cleanupCall();
    };
  }, []);

  // iOS media enabling is handled inside `StreamCallGate` when Stream reports JOINED.
  // Media enabling is performed here to allow retry + publication verification on iOS.
  useEffect(() => {
    if (!hasJoined) {
      didInitialMediaEnableRef.current = false;
      return;
    }
    if (didInitialMediaEnableRef.current) return;
    didInitialMediaEnableRef.current = true;

    if (Platform.OS === 'ios' && isSimulator) return;
    const callInstance = callRef.current;
    if (!callInstance) return;

    // iOS FIX: don't touch mic/camera until Stream session is hydrated.
    // Otherwise we can hit "PeerConnection not found" / sessionId undefined and wedge join.
    (async () => {
      try {
        await waitForStreamSessionReady(callInstance, Platform.OS === 'ios' ? 3500 : 1500);
      } catch { }

      // Enable microphone (best-effort) AFTER session hydration
      try {
        await callInstance.microphone?.enable?.();
      } catch { }

      // Enable camera with retries + publication verification (fixes "camera takes time" on iOS)
      if (isVideoEnabledRef.current) {
        requestAnimationFrame(() => {
          enableCameraWithRetry(callInstance, 3)
            .then((published) => setIsVideoTrackPublished(Boolean(published)))
            .catch(() => { });
        });
      }
    })();
  }, [hasJoined, isSimulator]);

  const handleJoinedChange = useCallback((joined: boolean) => {
    setHasJoined((prev) => (prev === joined ? prev : joined));
    setIsConnecting((prev) => (joined ? false : prev));
    if (joined) {
      hasEverJoinedRef.current = true;
      setHasEverJoined(true);
    }
  }, []);

  const startJoinedWatchdog = useCallback((callInstance: any) => {
    // Android does not exhibit the "JOINED requires a swipe/nudge to re-render" issue.
    // Keep this watchdog iOS-only to avoid unnecessary rAF loops on Android.
    if (Platform.OS !== 'ios' || typeof requestAnimationFrame !== 'function') {
      return;
    }
    if (joinedWatchRafRef.current != null) {
      try {
        cancelAnimationFrame(joinedWatchRafRef.current);
      } catch { }
      joinedWatchRafRef.current = null;
    }

    const startedAt = Date.now();
    const maxMs = 15000;

    const tick = () => {
      if (!isMountedRef.current) return;
      const state = callInstance?.state?.callingState;
      if (state === CallingState.JOINED) {
        logger.log('[StreamVideoCallDedicated] JOINED detected via watchdog, updating UI immediately');
        handleJoinedChange(true);
        hasEverJoinedRef.current = true;
        setHasEverJoined(true);
        setIsConnecting(false);
        if (Platform.OS === 'ios') {
          setUiTick((t) => t + 1);
        }
        joinedWatchRafRef.current = null;
        return;
      }
      if (Date.now() - startedAt >= maxMs) {
        joinedWatchRafRef.current = null;
        return;
      }
      joinedWatchRafRef.current = requestAnimationFrame(tick);
    };

    joinedWatchRafRef.current = requestAnimationFrame(tick);
  }, [handleJoinedChange]);

  // SECURITY FIX: Improved cleanup patterns
  const cleanupCall = useCallback(async () => {
    try {
      // Leave call if still active
      if (callRef.current && callRef.current.state?.callingState !== CallingState.LEFT) {
        await callRef.current.leave().catch(() => { });
      }

      // SECURITY FIX: Use service cleanup method
      await streamVideoServiceDedicated.cleanupCall();

      // Clear local state
      callRef.current = null;
      setIsVideoTrackPublished(false);

      // Remove all event listeners (if any were added)
      // Note: Stream SDK handles most cleanup automatically
    } catch (error) {
      logger.warn('[StreamVideoCallDedicated] Call cleanup warning:', error);
    }
  }, []);

  // Check if video track is properly published
  const checkVideoTrackPublished = async (callInstance: any) => {
    try {
      if (!callInstance || !callInstance.state) return false;

      const localParticipant = callInstance.state.localParticipant;
      if (!localParticipant) return false;

      const hasVideoTrack = localParticipant.videoStream &&
        localParticipant.videoStream.getVideoTracks().length > 0;

      if (__DEV__) {
        logger.debug('[StreamVideoCallDedicated] Video track check:', {
          hasVideoTrack,
          trackCount: localParticipant.videoStream?.getVideoTracks()?.length || 0,
          isPublished: hasVideoTrack
        });
      }

      return hasVideoTrack;
    } catch (error) {
      logger.error('[StreamVideoCallDedicated] Video track check failed:', error);
      return false;
    }
  };

  const sleepRaf = useCallback(async (ms: number): Promise<void> => {
    if (ms <= 0) return;
    if (Platform.OS !== 'ios' || typeof requestAnimationFrame !== 'function') {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return;
    }
    await new Promise<void>((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (!isMountedRef.current) {
          resolve();
          return;
        }
        if (Date.now() - start >= ms) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, []);

  const waitForStreamSessionReady = useCallback(async (callInstance: any, maxMs: number = 2500): Promise<boolean> => {
    const startedAt = Date.now();
    while (isMountedRef.current && Date.now() - startedAt < maxMs) {
      const sessionId = callInstance?.state?.session?.id;
      const local = callInstance?.state?.localParticipant;
      if (sessionId && local) return true;
      await sleepRaf(120);
    }
    return Boolean(callInstance?.state?.session?.id);
  }, [sleepRaf]);

  // Enable camera with retries and attempt recovery if track isn't published
  const enableCameraWithRetry = async (callInstance: any, maxAttempts: number = 3): Promise<boolean> => {
    if (!callInstance) return false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Abort if component unmounted or call is explicitly left
        if (!isMountedRef.current) {
          return false;
        }

        // Check if call is in a valid state for camera enable
        const state = callInstance?.state?.callingState;
        if (state === CallingState.LEFT) {
          return false;
        }

        // iOS FIX: wait until Stream session is hydrated before touching camera.
        // This avoids SDK errors like "Cannot read property 'sessionId' of undefined".
        await waitForStreamSessionReady(callInstance, Platform.OS === 'ios' ? 3000 : 1500);

        // Try to prefer front camera before enabling if supported
        try {
          if (callInstance?.camera && typeof callInstance.camera.setCameraPosition === 'function') {
            await callInstance.camera.setCameraPosition('front');
            setIsFrontCamera(true);
            console.log('[StreamVideoCallDedicated] Set camera position to front');
          }
        } catch (posErr) {
          console.warn('[StreamVideoCallDedicated] Unable to set camera position to front:', posErr);
        }
        await callInstance.camera.enable();
        setIsVideoEnabled(true);

        // Wait briefly for track to publish
        await sleepRaf(800);

        const published = await checkVideoTrackPublished(callInstance);
        if (published) {
          setIsVideoTrackPublished(true);
          console.log('[StreamVideoCallDedicated] Camera enabled and track published');
          return true;
        }

        console.warn('[StreamVideoCallDedicated] Video track not published yet, attempting recovery');

        // Try recovery: disable/enable cycle
        try {
          await callInstance.camera.disable();
          await sleepRaf(300);
        } catch (disableErr) {
          console.warn('[StreamVideoCallDedicated] Camera disable during recovery failed:', disableErr);
        }

        // On second and later attempts, try switching camera to encourage a working device
        if (attempt >= 2 && typeof callInstance.camera.switchCamera === 'function') {
          try {
            console.log('[StreamVideoCallDedicated] Switching camera to recover track publication');
            await callInstance.camera.switchCamera();
            setIsFrontCamera(prev => !prev);
          } catch (switchErr) {
            console.warn('[StreamVideoCallDedicated] switchCamera failed:', switchErr);
          }
        }

      } catch (err) {
        console.error('[StreamVideoCallDedicated] Camera enable attempt failed:', err);
      }
    }

    console.error('[StreamVideoCallDedicated] Failed to publish video track after retries');
    setIsVideoTrackPublished(false);
    return false;
  };


  // SECURITY FIX: Platform-specific permission flows
  const requestPermissionsAndInitialize = async () => {
    try {
      let cameraStatus = 'undetermined';
      let micStatus = 'undetermined';

      if (Platform.OS === 'android') {
        // Android: Check and request permissions with proper handling
        try {
          const cameraPermission = PermissionsAndroid.PERMISSIONS.CAMERA;
          const micPermission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;

          // Check current permissions
          const cameraCheck = await PermissionsAndroid.check(cameraPermission);
          const micCheck = await PermissionsAndroid.check(micPermission);

          if (!cameraCheck || !micCheck) {
            // Request permissions
            const granted = await PermissionsAndroid.requestMultiple([
              cameraPermission,
              micPermission,
            ]);

            cameraStatus = granted[cameraPermission] === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
            micStatus = granted[micPermission] === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';

            // Handle permanently denied permissions
            if (cameraStatus === 'denied' || micStatus === 'denied') {
              const isPermanentlyDenied =
                granted[cameraPermission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ||
                granted[micPermission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

              if (isPermanentlyDenied) {
                Alert.alert(
                  'Permissions Required',
                  'Camera and microphone permissions are required for video calls. Please enable them in Settings.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Open Settings',
                      onPress: () => Linking.openSettings()
                    }
                  ]
                );
                onCallError('Permissions permanently denied - please enable in Settings');
                return;
              }
            }
          } else {
            cameraStatus = 'granted';
            micStatus = 'granted';
          }
        } catch (androidError) {
          logger.error('[StreamVideoCallDedicated] Android permission error:', androidError);
          // Fallback to Expo Camera API
          const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
          const { status: micStatusExpo } = await Camera.requestMicrophonePermissionsAsync();
          cameraStatus = camStatus;
          micStatus = micStatusExpo;
        }
      } else {
        // iOS: Prefer get*PermissionsAsync first (fast path). Only request if needed.
        try {
          const camExisting = await Camera.getCameraPermissionsAsync();
          const micExisting = (Camera as any).getMicrophonePermissionsAsync
            ? await (Camera as any).getMicrophonePermissionsAsync()
            : { status: 'undetermined' };

          cameraStatus = camExisting?.status || 'undetermined';
          micStatus = micExisting?.status || 'undetermined';

          if (cameraStatus !== 'granted') {
            const { status } = await Camera.requestCameraPermissionsAsync();
            cameraStatus = status;
          }
          if (micStatus !== 'granted') {
            const { status } = await Camera.requestMicrophonePermissionsAsync();
            micStatus = status;
          }
        } catch (iosPermErr) {
          // Fallback: request directly
          const { status: camStatus } = await Camera.requestCameraPermissionsAsync();
          const { status: micStatusExpo } = await Camera.requestMicrophonePermissionsAsync();
          cameraStatus = camStatus;
          micStatus = micStatusExpo;
        }
      }

      setCameraPermission(cameraStatus === 'granted');

      if (cameraStatus !== 'granted' || micStatus !== 'granted') {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone permissions are required for video calls.',
          [{ text: 'OK' }]
        );
        onCallError('Camera and microphone permissions required');
        return;
      }

      await initializeAndJoinVideoCall();
    } catch (error) {
      logger.error('[StreamVideoCallDedicated] Permission request failed:', error);
      onCallError('Failed to request permissions');
    }
  };


  const auth = useAuth();

  const getAuthUserFast = useCallback(async () => {

    if(!auth.user) {
      throw new Error('User not authenticated');
    }


    return auth.user;
   
  }, []);

  const initializeAndJoinVideoCall = async () => {
    try {
      if (CALL_TRACE) {
        traceT0Ref.current = Date.now();
        logger.log('[CallTrace] init start');
      }
      setIsConnecting(true);
      setHasJoined(false);
      setHasEverJoined(false);
      hasEverJoinedRef.current = false;
      setError(null);

      // We create a Call instance only after the user is connected, then join.
      // Mounting a Call/CallContent too early on iOS can trigger SDK auto-hangup flows.

      // iOS-only fix:
      // AppState.currentState can be stale on iOS, which can incorrectly gate the entire join flow
      // until the user backgrounds -> foregrounds the app.
      //
      // We skip this gate on iOS so token generation / connectUser / call.join start immediately
      // when this screen mounts. Android behavior remains unchanged.
      if (Platform.OS !== 'ios' && AppState.currentState !== 'active') {
        await new Promise<void>((resolve) => {
          const sub = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
              sub.remove();
              resolve();
            }
          });
          setTimeout(() => {
            sub.remove();
            resolve();
          }, 1000);
        });
      }

      const joinFlow = async () => {
        try {
          if (CALL_TRACE) logger.log('[CallTrace] getAuthUserFast start', Date.now() - traceT0Ref.current);
          const authUser = await getAuthUserFast();
          if (CALL_TRACE) logger.log('[CallTrace] getAuthUserFast ok', Date.now() - traceT0Ref.current);

          // CRITICAL FIX: Always use authUser.id (UUID) for consistency with pre-initialization
          // Pre-initialization uses authUser.id, so we must use the same here
          const actualUserId = authUser.id; // Use UUID, not email/phone

          // CRITICAL FIX: Ensure user is connected (check if already connected first)
          let finalClient = streamVideoServiceDedicated.getClient();
          const streamUserId = actualUserId;

          // CRITICAL: Check if user is already connected by checking currentUser (more reliable than client.userID)
          let currentUser = streamVideoServiceDedicated.getCurrentUser();
          let isAlreadyConnected = currentUser && currentUser.id === streamUserId;

          // iOS FIX: If any connection is in progress (pre-init or another call), wait for it instead of starting a new one (prevents deadlock)
          if (streamVideoServiceDedicated.isConnecting() && !isAlreadyConnected) {
            logger.log('[StreamVideoCallDedicated] Connection in progress, waiting for it to complete...');
            try {
              await streamVideoServiceDedicated.waitForConnection();
              // Refresh client and user after connection completes
              finalClient = streamVideoServiceDedicated.getClient();
              currentUser = streamVideoServiceDedicated.getCurrentUser();
              isAlreadyConnected = currentUser && currentUser.id === streamUserId;
              if (finalClient && isAlreadyConnected) {
                logger.log('[StreamVideoCallDedicated] Connection completed, user connected:', currentUser?.id ?? '(unknown)');
              } else {
                logger.warn('[StreamVideoCallDedicated] Connection completed but user not connected, will initialize manually');
              }
            } catch (error) {
              logger.warn('[StreamVideoCallDedicated] Error waiting for connection:', error);
            }
          }

          if (finalClient && isAlreadyConnected) {
            logger.log('[StreamVideoCallDedicated] User already connected, skipping initialization');
            // iOS: No wait needed - currentUser is already set, proceed immediately
          } else {
            // User not connected or client not available - initialize
            try {
              if (!isAlreadyConnected) {
                logger.log('[StreamVideoCallDedicated] User not connected, initializing with UUID:', actualUserId);
              } else {
                logger.log('[StreamVideoCallDedicated] Client not available, initializing...');
              }

              if (CALL_TRACE) logger.log('[CallTrace] initializeUser start', Date.now() - traceT0Ref.current);
              await streamVideoServiceDedicated.initializeUser(actualUserId, userName, true);
              if (CALL_TRACE) logger.log('[CallTrace] initializeUser ok', Date.now() - traceT0Ref.current);

              // Get fresh client after initialization
              finalClient = streamVideoServiceDedicated.getClient()!;
              if (!finalClient) {
                throw new Error('Failed to get client after initialization');
              }

              // iOS: initializeUser() is async and waits for connectUser to complete.
              // No additional wait needed - currentUser is set immediately after connectUser resolves.
              // Verify currentUser is set (this is the reliable indicator)
              const verifyUser = streamVideoServiceDedicated.getCurrentUser();
              if (!verifyUser || verifyUser.id !== streamUserId) {
                logger.warn('[StreamVideoCallDedicated] User verification unclear, but continuing');
              } else {
                logger.log('[StreamVideoCallDedicated] User verified connected:', verifyUser.id);
              }
            } catch (initError) {
              logger.error('[StreamVideoCallDedicated] User initialization failed:', initError);
              // Only recover silently if a pre-initialized connection is already available.
              // If there is no connected user, re-throw so the caller surfaces the real error
              // instead of proceeding to call.join() and getting a confusing
              // "User token is not set" from the Stream SDK.
              const recoveredUser = streamVideoServiceDedicated.getCurrentUser();
              finalClient = streamVideoServiceDedicated.getClient() ?? null;
              if (!recoveredUser || !finalClient) {
                throw initError;
              }
              logger.log('[StreamVideoCallDedicated] Recovered via pre-initialized connection:', recoveredUser.id);
            }
          }

          // CRITICAL: Verify client and connection before proceeding
          if (!finalClient) {
            throw new Error('Stream Video client not available');
          }

          // CRITICAL: Verify connection using currentUser (more reliable than client.userID)
          const verifyUser = streamVideoServiceDedicated.getCurrentUser();
          if (verifyUser && verifyUser.id === streamUserId) {
            logger.log('[StreamVideoCallDedicated] Connection verified successfully:', verifyUser.id);
          } else {
            logger.warn('[StreamVideoCallDedicated] Connection verification unclear, but proceeding:', {
              expected: streamUserId,
              actual: verifyUser?.id || 'not set'
            });
          }

          setClient(finalClient);
          clientRef.current = finalClient;

          // Create a single Call instance once we know the user is connected.
          // IMPORTANT: Pass the same Call instance into createVideoCall so we do not swap call objects later.
          const preCreated = streamVideoServiceDedicated.preCreateCall(callId) || undefined;
          if (preCreated && !callRef.current) {
            callRef.current = preCreated;
            setCall(preCreated);
          }

          // Join call (service handles retries).
          if (CALL_TRACE) logger.log('[CallTrace] createVideoCall start', Date.now() - traceT0Ref.current);
          const callInstance = await streamVideoServiceDedicated.createVideoCall(callId, true, preCreated);
          if (CALL_TRACE) logger.log('[CallTrace] createVideoCall ok', Date.now() - traceT0Ref.current);
          callRef.current = callInstance;
          setCall(callInstance);
          mediaRecoveryRef.current.attach(finalClient, callInstance);
          // Start watchdog immediately so UI flips even if Stream store updates are delayed.
          startJoinedWatchdog(callInstance);

          // Attach listeners once (now that we have the real call instance)
          if (!listenersAttachedRef.current) {
            listenersAttachedRef.current = true;

            callInstance.on('call.session_participant_joined', (event: any) => {
              logger.log('[StreamVideoCallDedicated] Participant joined:', event.participant?.user?.name || 'Unknown');
            });
            callInstance.on('call.session_participant_left', (event: any) => {
              logger.log('[StreamVideoCallDedicated] Participant left:', event.participant?.user?.name || 'Unknown');
            });
            callInstance.on('call.ended', () => {
              // iOS stability:
              // We've observed transient WS closes (code 1001 "Stream end encountered") that can emit `call.ended`
              // even though the call can recover. Do NOT auto-close the UI unless the user explicitly hung up.
              if (!userHangupRef.current) {
                logger.warn('[StreamVideoCallDedicated] call.ended received (non-user), keeping UI open for recovery');
                return;
              }
              setIsVideoTrackPublished(false);
              onCallEnd();
            });
            callInstance.on('call.updated', (event: any) => {
              const state = event.call?.state?.callingState;
              if (state === CallingState.JOINED) {
                setIsConnecting(false);
                setHasJoined(true);
                hasEverJoinedRef.current = true;
                setHasEverJoined(true);
                if (Platform.OS === 'ios') {
                  requestAnimationFrame(() => setUiTick((t) => t + 1));
                }
                backgroundCallNotificationService.showCallNotification(callId, userName, true).catch(() => {});
              }
            });
            (callInstance as any).on('call.session_participant_updated', (event: any) => {
              if (event.participant && event.participant.isLocalParticipant) {
                const hasVideo = event.participant.videoStream && event.participant.videoStream.getVideoTracks().length > 0;
                setIsVideoTrackPublished(hasVideo);
              }
            });
          }

          // Joined state (callInstance will typically transition to JOINED shortly after join resolves)
          try {
            if (callInstance?.state?.callingState === CallingState.JOINED) {
              logger.log('[StreamVideoCallDedicated] Call already JOINED after createVideoCall, updating UI...');
              setHasJoined(true);
              hasEverJoinedRef.current = true;
              setHasEverJoined(true);
              setIsConnecting(false);
              
              // iOS FIX: Force React to flush state updates immediately
              if (Platform.OS === 'ios') {
                requestAnimationFrame(() => {
                  logger.log('[StreamVideoCallDedicated] iOS: Forced UI update after immediate JOINED check');
                  setUiTick((t) => t + 1);
                });
              }
            }
          } catch { }

          // IMPORTANT: Do not enable camera/mic here.
          // We only enable local media after Stream reports JOINED (see `StreamCallGate` and call.updated listener),
          // otherwise iOS can hit "PeerConnection not found" / join instability.

          // Keep isConnecting=true until Stream reports JOINED.
        } catch (e: any) {
          logger.error('[StreamVideoCallDedicated] Failed to join video call:', e);
          setError(e.message || 'Failed to join video call');
          onCallError(e.message || 'Failed to join video call');
          setIsConnecting(false);
          throw e;
        }
      };

      // iOS: run immediately (avoids any InteractionManager / scheduling quirks).
      if (Platform.OS === 'ios') {
        await joinFlow();
      } else {
        await runInteractionTask(
          'Stream video call initialization',
          async () => {
            await joinFlow();
          },
          350,
          iosImmediateInteractionOptions
        ).then(({ completed }) => completed);
      }
    } catch (e: any) {
      logger.error('[StreamVideoCallDedicated] Failed to initialize video call:', e);
      setError(e.message || 'Failed to initialize video call');
      onCallError(e.message || 'Failed to initialize video call');
      setIsConnecting(false);
    }
  };

  const toggleMute = async () => {
    if (call && call.state?.callingState !== CallingState.LEFT) {
      try {
        if (Platform.OS === 'ios' && isSimulator) {
          setIsMuted(!isMuted); // Update UI state anyway
        } else {
          await call.microphone.toggle();
          setIsMuted(!isMuted);
        }
      } catch (error) {
        logger.error('[StreamVideoCallDedicated] Failed to toggle microphone:', error);
      }
    }
  };

  const toggleVideo = async () => {
    if (call && call.state?.callingState !== CallingState.LEFT) {
      try {
        if (Platform.OS === 'ios' && isSimulator) {
          console.warn('[StreamVideoCallDedicated] Simulator detected — skipping camera toggle');
          setIsVideoEnabled(!isVideoEnabled); // Update UI state anyway
        } else {
          await call.camera.toggle();
          const nowEnabled = !isVideoEnabled;
          setIsVideoEnabled(nowEnabled);
          console.log('[StreamVideoCallDedicated] Camera toggled:', nowEnabled);

          // If enabling video, ensure track is published; otherwise try recovery
          if (nowEnabled) {
            setTimeout(async () => {
              const published = await checkVideoTrackPublished(call);
              setIsVideoTrackPublished(published);
              if (!published) {
                console.warn('[StreamVideoCallDedicated] Track not published after toggle — retrying enable flow');
                await enableCameraWithRetry(call, 2);
              }
            }, 600);
          }
        }
      } catch (error) {
        console.error('[StreamVideoCallDedicated] Failed to toggle camera:', error);
      }
    } else {
      console.warn('[StreamVideoCallDedicated] Cannot toggle camera - call not available or already left');
    }
  };

  const switchCamera = async () => {
    if (call && call.state?.callingState !== CallingState.LEFT) {
      try {
        if (Platform.OS === 'ios' && isSimulator) {
          console.warn('[StreamVideoCallDedicated] Simulator detected — skipping switch camera');
          setIsFrontCamera(!isFrontCamera);
          return;
        }

        if (typeof call.camera.switchCamera === 'function') {
          await call.camera.switchCamera();
          setIsFrontCamera(prev => !prev);
          console.log('[StreamVideoCallDedicated] Switched camera');
        } else if (typeof call.camera.setCameraPosition === 'function') {
          const target = isFrontCamera ? 'back' : 'front';
          await call.camera.setCameraPosition(target);
          setIsFrontCamera(!isFrontCamera);
          console.log('[StreamVideoCallDedicated] Set camera position to', target);
        } else {
          console.warn('[StreamVideoCallDedicated] Camera switching not supported by SDK');
        }

        // After switching, verify publication when video is enabled
        if (isVideoEnabled) {
          setTimeout(async () => {
            const published = await checkVideoTrackPublished(call);
            if (!published) {
              console.warn('[StreamVideoCallDedicated] Track not published after switch — retrying enable flow');
              await enableCameraWithRetry(call, 2);
            }
          }, 400);
        }
      } catch (error) {
        console.error('[StreamVideoCallDedicated] Failed to switch camera:', error);
      }
    }
  };

  // Join retries/timeouts are handled in `streamVideoServiceDedicated.createVideoCall()`.

  const hangupCall = useCallback(async () => {
    userHangupRef.current = true;
    // Navigate away immediately; perform cleanup asynchronously to avoid UI delay
    try { onCallEnd(); } catch { }
    // Immediately clear local state so UI disappears without waiting for SDK teardown
    try {
      setCall(null);
      setClient(null);
      callRef.current = null;
      clientRef.current = null;
    } catch { }
    setTimeout(async () => {
      try {
        // Clear video track check interval
        if (videoTrackCheckInterval.current) {
          clearInterval(videoTrackCheckInterval.current);
          videoTrackCheckInterval.current = null;
        }
        // Clean up call properly
        await cleanupCall();

        // Dismiss background notification
        backgroundCallNotificationService.dismissCallNotification(callId).catch(() => {});
      } catch (error) {
        logger.error('[StreamVideoCallDedicated] Error ending video call:', error);
      }
    }, 0);
  }, [callId, cleanupCall, onCallEnd]);


  // Show error state first
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <View style={styles.errorContainer}>
          <MaterialIcons name="error" size={60} color="#f44336" />
          <Text style={styles.errorText}>Failed to initialize video call</Text>
          <Text style={styles.errorSubText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={requestPermissionsAndInitialize}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Unify "connecting vs joined" UI under Stream's CallingState (via StreamCallGate).
  // Before we have a real joined Call instance, show a neutral loader (no duplicated "Connecting..." UI).
  if (!client || !call) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={[styles.loadingText, { marginTop: 14 }]}>Please wait…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B132B" />
      <StreamVideo client={client}>
        <StreamCall call={call}>
          <StreamCallGate
            onHangup={hangupCall}
            isVideoEnabled={isVideoEnabled}
            isSimulator={isSimulator}
            callRef={callRef}
            onJoinedChange={handleJoinedChange}
            hasEverJoinedRef={hasEverJoinedRef}
          />
        </StreamCall>
      </StreamVideo>
    </SafeAreaView>
  );
};

// Video content component that renders actual video streams
const VideoCallContent: React.FC<{ isFrontCamera: boolean }> = ({ isFrontCamera }) => {
  const { useParticipants, useLocalParticipant } = useCallStateHooks();
  const participants = useParticipants().filter(Boolean);
  const localParticipant = useLocalParticipant();

  // Filter out local participant from remote participants
  const remoteParticipants = participants.filter((participant: any) => !participant.isLocalParticipant);

  console.log('[VideoCallContent] Participants:', {
    total: participants.length,
    remote: remoteParticipants.length,
    local: localParticipant ? 'present' : 'missing'
  });

  // Debug each participant's video state (guarded; participants can transiently include undefined during join/reconnect)
  participants.forEach((participant: any, index: number) => {
    const hasVideoStream = !!participant.videoStream;
    const videoTrackCount = participant.videoStream?.getVideoTracks()?.length || 0;
    const hasAudioStream = !!participant.audioStream;
    const audioTrackCount = participant.audioStream?.getAudioTracks()?.length || 0;

    // Additional debugging for video tracks
    if (participant.videoStream) {
      const videoTracks = participant.videoStream.getVideoTracks();
      console.log(`[VideoCallContent] Video tracks for participant ${index}:`, {
        trackCount: videoTracks.length,
        tracks: videoTracks.map((track: any) => ({
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: track.muted
        }))
      });
    }

    console.log(`[VideoCallContent] Participant ${index}:`, {
      sessionId: participant?.sessionId,
      userId: participant?.userId,
      name: participant?.name,
      isLocalParticipant: participant?.isLocalParticipant,
      hasVideoStream,
      hasAudioStream,
      videoTrackCount,
      audioTrackCount,
      isVideoPublished: hasVideoStream && videoTrackCount > 0
    });
  });

  // Determine if any remote has video published
  const anyRemoteHasVideo = remoteParticipants.some((p: any) => p.videoStream && p.videoStream.getVideoTracks().length > 0);

  // If no remote participants, show waiting message
  if (remoteParticipants.length === 0) {
    return (
      <View style={styles.videoContentContainer}>
        <View style={styles.noParticipantsContainer}>
          <Text style={styles.noParticipantsText}>Waiting for agent to join...</Text>
        </View>
        {localParticipant && (
          <View style={styles.localVideoWrapper} pointerEvents="none">
            {localParticipant.videoStream && localParticipant.videoStream.getVideoTracks().length > 0 ? (
              // Wrap local participant view so we can mirror the front camera preview
              <View style={isFrontCamera ? styles.localParticipantMirrored : styles.localParticipant}>
                <ParticipantView
                  participant={localParticipant}
                  style={styles.participantViewFull}
                />
              </View>
            ) : (
              <View style={[styles.localVideo, styles.noVideoPlaceholder]}>
                <MaterialIcons name="videocam-off" size={20} color="#B0B0B0" />
                <Text style={styles.noVideoText}>Camera Off</Text>
              </View>
            )}
            <Text style={styles.localVideoText}>You</Text>
            <View style={[styles.statusIndicator, styles.statusIndicatorConnected]} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.videoContentContainer}>
      {remoteParticipants.filter(Boolean).map((participant: any) => {
        const hasVideo = participant.videoStream && participant.videoStream.getVideoTracks().length > 0;
        return (
          <View key={participant.sessionId || participant.userId || String(Math.random())} style={styles.remoteVideoWrapper}>
            {hasVideo ? (
              <ParticipantView participant={participant} />
            ) : (
              <View style={[styles.remoteVideo, styles.noVideoPlaceholder]}>
                <MaterialIcons name="videocam-off" size={48} color="#666" />
                <Text style={styles.noVideoText}>Camera Off</Text>
              </View>
            )}
            <Text style={styles.participantName}>
              {participant.name || participant.userId || 'Agent'}
            </Text>
          </View>
        );
      })}

      {localParticipant && (
        <View style={styles.localVideoWrapper}>
          {localParticipant.videoStream && localParticipant.videoStream.getVideoTracks().length > 0 ? (
            <ParticipantView participant={localParticipant} />
          ) : (
            <View style={[styles.localVideo, styles.noVideoPlaceholder]}>
              <MaterialIcons name="videocam-off" size={20} color="#B0B0B0" />
              <Text style={styles.noVideoText}>Camera Off</Text>
            </View>
          )}
          <Text style={styles.localVideoText}>You</Text>
          <View style={[styles.statusIndicator, styles.statusIndicatorConnected]} />
        </View>
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B132B',
  },
  callConnectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B132B',
  },
  loadingText: {
    color: '#EAEAEA',
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
  },
  videoCallContainer: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  videoContentContainer: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  remoteVideoWrapper: {
    flex: 1,
    backgroundColor: '#0B132B',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#0B132B',
    borderRadius: 16,
  },
  participantName: {
    color: '#EAEAEA',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 2,
    // Ensure label never blocks playback/taps on video surface
    // and cannot intercept gestures intended for video area
    // @ts-ignore
    pointerEvents: 'none',
  },
  localVideoWrapper: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 120,
    height: 90,
    backgroundColor: '#1C2541',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#00A3FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  // Wrapper that mirrors the local preview for front camera (React Native transform)
  localParticipantMirrored: {
    flex: 1,
    transform: [{ scaleX: -1 }],
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  localParticipant: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  participantViewFull: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  localVideo: {
    flex: 1,
    width: '100%',
    borderRadius: 14,
  },
  localVideoText: {
    color: '#EAEAEA',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  noParticipantsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B132B',
  },
  noParticipantsText: {
    color: '#EAEAEA',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  controlsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(11,19,43,0.9)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  controlButtonActive: {
    backgroundColor: '#00A3FF',
    borderColor: '#00A3FF',
    shadowColor: '#00A3FF',
    shadowOpacity: 0.3,
  },
  controlButtonDisabled: {
    backgroundColor: '#FF4D4F',
    borderColor: '#FF4D4F',
    shadowColor: '#FF4D4F',
    shadowOpacity: 0.3,
  },
  hangupButton: {
    backgroundColor: '#FF4D4F',
    borderColor: '#FF4D4F',
    shadowColor: '#FF4D4F',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0B132B',
  },
  errorText: {
    color: '#EAEAEA',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
  },
  errorSubText: {
    color: '#B0B0B0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: '#00A3FF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    shadowColor: '#00A3FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  retryButtonText: {
    color: '#EAEAEA',
    fontSize: 16,
    fontWeight: '700',
  },
  noVideoPlaceholder: {
    backgroundColor: '#1C2541',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  noVideoText: {
    color: '#B0B0B0',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  // New modern styles
  statusIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00A3FF',
  },
  statusIndicatorConnected: {
    backgroundColor: '#00A3FF',
  },
  statusIndicatorConnecting: {
    backgroundColor: '#FFA500',
  },
  statusIndicatorDisconnected: {
    backgroundColor: '#FF4D4F',
  },
  // callDuration styles removed (we no longer re-render every second on iOS)
  connectionStatus: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionStatusText: {
    color: '#EAEAEA',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});

export default StreamVideoCallDedicated;
