/**
 * Emergency Screen
 * 
 * Dedicated screen for viewing emergency details when opened from push notifications.
 * This screen is used for deep linking from emergency notifications.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '@/navigation/MainNavigator';
import { EmergencyService } from '../features/emergency/emergency.service';
import { EmergencySessionDto } from '../features/emergency/emergency.types';
import { useEmergencyFlow } from '@/features/emergency/emergency.flow';
import { formatUserFriendlyDate } from '@/utils/timeHelpers';
import { trackMeLocationSyncService } from '@/services/trackMeLocationSync.service';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';

type EmergencyScreenRouteProp = RouteProp<MainStackParamList, 'Emergency'>;

export default function EmergencyScreen() {
  const route = useRoute<EmergencyScreenRouteProp>();
  const navigation = useNavigation();
  const { emergencyId } = route.params || {};
  
  const [emergency, setEmergency] = useState<EmergencySessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePasskey, setDisablePasskey] = useState('');
  const shakeAnimation = useState(() => new Animated.Value(0))[0];
  const {
    startEmergencyCallFromState,
    activeEmergencyId,
    disableEmergencyById,
    isEmergencyProcessing,
  } = useEmergencyFlow();

  // Load emergency on mount
  useEffect(() => {
    const loadEmergency = async () => {
      if (emergencyId) {
        setLoading(true);
        setError(null);
        
        try {
          const loaded = await EmergencyService.getEmergencyById(emergencyId);
          if (loaded) {
            setEmergency(loaded);
          } else {
            setError('Emergency not found');
          }
        } catch (err: any) {
          console.error('[EmergencyScreen] Error loading emergency:', err);
          setError(err.message || 'Failed to load emergency');
        } finally {
          setLoading(false);
        }
      } else {
        // No emergencyId provided - try to get current emergency
        setLoading(true);
        try {
          const current = await EmergencyService.getCurrentEmergency();
          if (current) {
            setEmergency(current);
          } else {
            setError('No active emergency found');
          }
        } catch (err: any) {
          console.error('[EmergencyScreen] Error loading current emergency:', err);
          setError(err.message || 'Failed to load emergency');
        } finally {
          setLoading(false);
        }
      }
    };

    loadEmergency();
  }, [emergencyId]);

  // Refresh emergency status periodically
  useEffect(() => {
    if (!emergency || emergency.status !== 'ACTIVE') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        if (emergencyId) {
          const updated = await EmergencyService.getEmergencyById(emergencyId);
          if (updated) {
            setEmergency(updated);
          }
        } else {
          const current = await EmergencyService.getCurrentEmergency();
          if (current) {
            setEmergency(current);
          }
        }
      } catch (err) {
        console.error('[EmergencyScreen] Error refreshing emergency:', err);
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [emergency, emergencyId]);

  useEffect(() => {
    let cancelled = false;

    const syncTracking = async () => {
      if (!emergency || emergency.status !== 'ACTIVE') {
        await trackMeLocationSyncService.stop();
        return;
      }

      const trackerId = emergency.trackingId || emergency.locationTrackerId || undefined;
      if (!trackerId) {
        return;
      }

      if (cancelled) {
        return;
      }

      await trackMeLocationSyncService.start(trackerId);
    };

    void syncTracking();

    return () => {
      cancelled = true;
      void trackMeLocationSyncService.stop();
    };
  }, [emergency]);

  const handleDisableEmergency = async () => {
    if (!emergency?.id) {
      return;
    }

    const result = await disableEmergencyById(emergency.id, disablePasskey.trim());
    if (result.success) {
      setShowDisableModal(false);
      setDisablePasskey('');
      setEmergency((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: 'CANCELLED',
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
      Alert.alert('Emergency Disabled', 'Emergency was disabled successfully.');
      return;
    }

    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();

    Alert.alert('Disable Failed', result.error || 'Unable to disable emergency.');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#CC0022" />
          <Text style={styles.loadingText}>Loading emergency...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !emergency) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#CC0022" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!emergency) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="info-outline" size={64} color="#4BA8FF" />
          <Text style={styles.errorTitle}>No Emergency Found</Text>
          <Text style={styles.errorText}>Unable to load emergency details.</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const triggeredDate = emergency.triggeredAt ? new Date(emergency.triggeredAt) : null;
  const resolvedDate = emergency.resolvedAt ? new Date(emergency.resolvedAt) : null;
  const isResolved = emergency.status === 'RESOLVED';
  const isActive = emergency.status === 'ACTIVE';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Status Badge */}
        <View style={[
          styles.statusBadge,
          isResolved && styles.statusBadgeResolved,
          isActive && styles.statusBadgeActive,
        ]}>
          <MaterialIcons 
            name={isResolved ? "check-circle" : "warning"} 
            size={20} 
            color="#ffffff" 
            style={styles.statusIcon}
          />
          <Text style={styles.statusText}>
            {emergency.status}
          </Text>
        </View>

        {/* Triggered Time */}
        {triggeredDate && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Triggered At</Text>
            <Text style={styles.sectionValue}>
              {formatUserFriendlyDate(triggeredDate.toISOString())}
            </Text>
          </View>
        )}

        {/* Resolved Time */}
        {resolvedDate && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Resolved At</Text>
            <Text style={styles.sectionValue}>
              {formatUserFriendlyDate(resolvedDate.toISOString())}
            </Text>
          </View>
        )}

        {/* Resolution Note */}
        {emergency.resolutionNote && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Resolution Note</Text>
            <Text style={styles.sectionValue}>{emergency.resolutionNote}</Text>
          </View>
        )}

        {isActive && (
          <>
            <TouchableOpacity
              style={styles.callButton}
              onPress={async () => {
                const started = await startEmergencyCallFromState(emergency.id);
                if (!started) {
                  Alert.alert(
                    'Call Not Ready',
                    activeEmergencyId
                      ? 'Unable to open emergency call right now. Please try again.'
                      : 'No active emergency call context found on device yet.',
                  );
                }
              }}
            >
              <MaterialIcons name="videocam" size={20} color="#ffffff" style={styles.callButtonIcon} />
              <Text style={styles.callButtonText}>Open Emergency Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.disableButton}
              onPress={() => {
                setDisablePasskey('');
                setShowDisableModal(true);
              }}
            >
              <MaterialIcons name="lock-open" size={20} color="#ffffff" style={styles.callButtonIcon} />
              <Text style={styles.callButtonText}>Disable Emergency</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Info Message */}
        {isResolved && (
          <View style={styles.infoBox}>
            <MaterialIcons name="check-circle" size={20} color="#27AE60" />
            <Text style={styles.infoText}>
              This emergency has been resolved.
            </Text>
          </View>
        )}
      </ScrollView>

      <EmergencyPasskeyModal
        visible={showDisableModal}
        onSubmit={handleDisableEmergency}
        onClose={() => setShowDisableModal(false)}
        title="Disable Emergency"
        subtitle="Enter passkey to disable"
        icon="lock-open"
        iconColor="#CC0022"
        enteredPasskey={disablePasskey}
        onPasskeyChange={setDisablePasskey}
        isLoading={isEmergencyProcessing}
        shakeAnimation={shakeAnimation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    color: '#bdc3c7',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 24,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#4BA8FF',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#CC0022',
    marginBottom: 24,
  },
  statusBadgeResolved: {
    backgroundColor: '#27AE60',
  },
  statusBadgeActive: {
    backgroundColor: '#CC0022',
  },
  statusIcon: {
    marginRight: 8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: '#bdc3c7',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionValue: {
    color: '#ffffff',
    fontSize: 18,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#CC0022',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  cancelButtonDisabled: {
    opacity: 0.6,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a2a',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    color: '#ffffff',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  callButton: {
    marginTop: 12,
    backgroundColor: '#CC0022',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonIcon: {
    marginRight: 8,
  },
  callButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  disableButton: {
    marginTop: 12,
    backgroundColor: '#4A1B1B',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

