import React, { memo, useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import ServiceModal from '@/components/common/ServiceModal';
import { styles } from './VideoMonitorModal.styles';
import { Camera } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { streamVideoServiceDedicated } from '@/services/streamVideoServiceDedicated';
import { isCallPriorityActive } from '@/services/callPriority';

interface VideoMonitorModalProps {
  visible: boolean;
  isMonitoring: boolean;
  cameraPermission: boolean;
  cameraFacing: 'front' | 'back';
  isMuted: boolean;
  isVideoEnabled: boolean;
  onClose: () => void;
  onStartMonitoring: () => void;
  onSetCameraFacing: (facing: 'front' | 'back') => void;
  onSetIsMuted: (muted: boolean) => void;
  onSetIsVideoEnabled: (enabled: boolean) => void;
  onSetIsMonitoring: (monitoring: boolean) => void;
  onEndVideoSession?: () => void;
}

// Lazy-loaded modal content component
const VideoMonitorContent: React.FC<{
  cameraPermission: boolean;
  isMonitoring: boolean;
  onStartMonitoring: () => void;
  onRequestPermissions: () => Promise<void>;
}> = memo(({ cameraPermission, isMonitoring, onStartMonitoring, onRequestPermissions }) => {
  return (
    <View style={styles.serviceContent}>
      <MaterialIcons name="videocam" size={48} color="#2C3E50" style={styles.serviceIcon} />

      <Text style={styles.serviceDescription}>
        Activate video monitoring to allow our security agents to access your camera and monitor your surroundings in real-time.
      </Text>

      {!cameraPermission && (
        <View style={styles.permissionWarning}>
          <MaterialIcons name="warning" size={20} color="#F39C12" />
          <Text style={styles.permissionText}>Camera permission required</Text>
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Monitoring Status:</Text>
        <Text style={[styles.statusText, isMonitoring ? styles.activeStatus : styles.inactiveStatus]}>
          {isMonitoring ? 'ACTIVE' : 'INACTIVE'}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.startButton]}
        onPress={async () => {
          if (cameraPermission) {
            onStartMonitoring();
            return;
          }
          await onRequestPermissions();
        }}
      >
        <Text style={styles.actionButtonText}>Start Monitoring</Text>
      </TouchableOpacity>

      <Text style={styles.serviceNote}>
        Note: You can end the monitoring session at any time. Your privacy and security are our top priorities.
      </Text>
    </View>
  );
});
VideoMonitorContent.displayName = 'VideoMonitorContent';

const VideoMonitorModal: React.FC<VideoMonitorModalProps> = memo(({
  visible,
  isMonitoring,
  cameraPermission,
  onClose,
  onStartMonitoring,
  onSetIsMonitoring,
  onEndVideoSession,
}) => {
  const [isRequestingPermissions, setIsRequestingPermissions] = useState(false);
  const navigation = useNavigation();

  // 🔥 CRITICAL iOS FIX: Check subscription access immediately - NO setTimeout
  // setTimeout can cause iOS JS thread suspension
  useEffect(() => {
    if (visible) {
      // iOS: Run immediately, Android: can use small delay
      if (Platform.OS === 'ios') {
        // Run immediately on iOS
          import('@/utils/subscriptionAccess').then(({ checkSubscriptionAccess }) => {
          checkSubscriptionAccess('Video Monitor').then((hasAccess) => {
            if (!hasAccess) {
              // Close modal - checkSubscriptionAccess will handle navigation to TrialExpired screen
              onClose();
            }
          }).catch(() => {
            // On error, allow modal to stay open
          });
        }).catch(() => {
          // If import fails, allow modal to stay open
        });
      } else {
        // Android: Small delay for smoothness
        const accessCheckTimer = setTimeout(() => {
          import('@/utils/subscriptionAccess').then(({ checkSubscriptionAccess }) => {
            checkSubscriptionAccess('Video Monitor').then((hasAccess) => {
              if (!hasAccess) {
                // Close modal - checkSubscriptionAccess will handle navigation to TrialExpired screen
                onClose();
              }
            }).catch(() => {});
          }).catch(() => {});
        }, 100);

      return () => clearTimeout(accessCheckTimer);
      }
    }
  }, [visible, onClose, navigation]);

  // 🔥 FIX: Defer Stream SDK prewarm to not block modal opening
  // Stream client is already preloaded in InitCoordinator, but we verify it's ready
  // Use setTimeout to defer this verification AFTER modal is visible
  useEffect(() => {
    if (visible) {
      // Never compete with call start/active; token/connect/join must win on iOS.
      if (isCallPriorityActive()) {
        return;
      }
      // iOS-only: avoid setTimeout deferral (can behave poorly under iOS JS scheduling)
      // Android keeps the small delay.
      let cancelled = false;
      if (Platform.OS === 'ios') {
        Promise.resolve()
          .then(() => {
            if (cancelled) return;
            return ensureValidSession();
          })
          .then((sess: any) => {
            const user = sess?.user;
            if (cancelled) return;
            if (user) {
              const userId = user.id;
              const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Mobile User';
              // Token-only warmup (shared cache with call flow). Avoids full connectUser contention on iOS.
              return streamVideoServiceDedicated.preFetchToken(userId, userName).catch((error) => {
                if (__DEV__) console.warn('[VideoMonitorModal] Token prefetch failed (non-critical):', error);
              });
            }
          })
          .catch(() => {
            // Non-critical
          });
        return () => {
          cancelled = true;
        };
      }

      // Android: Defer SDK verification to AFTER modal is rendered (non-blocking)
      const prewarmTimer = setTimeout(() => {
        if (isCallPriorityActive()) return;
        ensureValidSession().then((sess: any) => { const user = sess?.user;
          if (user) {
            const userId = user.id;
            const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email || 'Mobile User';
            streamVideoServiceDedicated.preFetchToken(userId, userName).catch((error) => {
              if (__DEV__) console.warn('[VideoMonitorModal] Token prefetch failed (non-critical):', error);
            });
          }
        }).catch(() => {
          // Non-critical
        });
      }, 50);

      return () => clearTimeout(prewarmTimer);
    }
  }, [visible]);

  // Handle permission requests asynchronously after modal opens
  const handleRequestPermissions = async () => {
    if (isRequestingPermissions) return;
    
    setIsRequestingPermissions(true);
    try {
      const cameraResult = await Camera.requestCameraPermissionsAsync();
      const micResult = await Camera.requestMicrophonePermissionsAsync();

      const cameraGranted = cameraResult.status === 'granted';
      const micGranted = micResult.status === 'granted';

      if (cameraGranted && micGranted) {
        onStartMonitoring();
      } else {
        Alert.alert(
          'Permissions Required',
          'Camera and microphone permissions are required for video monitoring. Please grant these permissions in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('[VideoMonitorModal] Permission request error:', error);
      Alert.alert(
        'Permission Error',
        'Failed to request camera and microphone permissions. Please try again or grant permissions manually in settings.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsRequestingPermissions(false);
    }
  };

  // 🔥 PRODUCTION OPTIMIZATION: Keep modal mounted, hide with style
  // Prevents Hermes GC rehydration delay in production builds

  // NOTE: Video Monitor now uses the same video call system as emergency calls
  // When isMonitoring is true, the parent component (App.tsx) handles rendering
  // StreamVideoCallDedicated component via showCall state and callSession
  // This ensures consistency between Video Monitor and Emergency video calls
  // Both use the same call session created via simpleCallService.createCallSession()
  
  // VideoMonitorModal only shows the initial setup UI
  // Once monitoring starts, the actual video call is handled by StreamVideoCallDedicated
  // which is rendered in App.tsx based on showCall and callSession state

  // ... rest of the component (ServiceModal) ...

  // Regular modal for starting monitoring - lightweight shell with lazy content
  // 🔥 PRODUCTION OPTIMIZATION: Always render, visibility controlled by ServiceModal
  return (
    <ServiceModal
      visible={visible && !isMonitoring}
      onClose={onClose}
      title="Video Monitoring Service"
    >
      <VideoMonitorContent
        cameraPermission={cameraPermission}
        isMonitoring={isMonitoring}
        onStartMonitoring={onStartMonitoring}
        onRequestPermissions={handleRequestPermissions}
      />
    </ServiceModal>
  );
});

VideoMonitorModal.displayName = 'VideoMonitorModal';

export default VideoMonitorModal;
