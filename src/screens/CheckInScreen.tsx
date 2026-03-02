/**
 * Check-In Screen
 * 
 * Dedicated screen for completing check-ins when opened from push notifications.
 * This screen is used for deep linking from check-in notifications.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '@/navigation/MainNavigator';
import { useCheckIns } from '@/features/checkins/checkin.hooks';
import { CheckInService } from '@/features/checkins/checkin.service';
import { useAuth } from '@/core/auth';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';
import { verifyEmergencyPasskey } from '@/features/emergency/emergency.passkey';
import { formatUserFriendlyDate } from '@/utils/timeHelpers';
import { clearPendingNotificationNav, peekPendingNotificationNav } from '@/core/notifications/notification.router';

type CheckInScreenRouteProp = RouteProp<MainStackParamList, 'CheckIn'>;

export default function CheckInScreen() {
  const route = useRoute<CheckInScreenRouteProp>();
  const navigation = useNavigation();
  const { checkInId } = route.params || {};
  const { isAuthReady } = useAuth();

  const { getCheckIn, completeCheckIn, loading } = useCheckIns();
  const [checkIn, setCheckIn] = useState<any>(null);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkey, setPasskey] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load check-in on mount — gate on isAuthReady to prevent DB queries
  // before auth is initialized (critical for cold-start from notification)
  useEffect(() => {
    if (!isAuthReady) return;

    const loadCheckIn = async () => {
      // Clear pending notification nav — CheckInScreen is the final consumer
      clearPendingNotificationNav('CheckInScreen mounted');

      if (checkInId) {
        const loaded = await getCheckIn(checkInId);
        if (loaded) {
          setCheckIn(loaded);
        } else {
          setError('Check-in not found');
        }
      } else {
        // No checkInId provided — cold-start param loss.
        // Stale guard: if the pending notification is >5 min old, don't auto-open
        const pending = peekPendingNotificationNav();
        if (pending) {
          const ageMs = Date.now() - pending.createdAt;
          if (ageMs > 5 * 60 * 1000) {
            console.log('[CheckInScreen] Ignoring stale notification intent, age:', ageMs, 'ms');
            setError('This check-in notification has expired. Please check your check-ins from the home screen.');
            return;
          }
        }

        // Fallback: find the most recent pending check-in.
        console.log('[CheckInScreen] No checkInId — attempting fallback via getPendingCheckIn()');
        try {
          const pendingCheckIn = await CheckInService.getPendingCheckIn();
          if (pendingCheckIn) {
            console.log('[CheckInScreen] Fallback found pending check-in:', pendingCheckIn.id);
            setCheckIn(pendingCheckIn);
          } else {
            setError('No pending check-in found');
          }
        } catch (err: any) {
          console.error('[CheckInScreen] Fallback getPendingCheckIn() failed:', err);
          setError('Failed to load check-in');
        }
      }
    };

    loadCheckIn();
  }, [checkInId, getCheckIn, isAuthReady]);

  /**
   * UX GUARANTEE:
   * When the user opens this screen from a notification, they should immediately see
   * the passkey verification modal (no extra taps).
   */
  useEffect(() => {
    if (!checkIn) return;
    if (checkIn.status === 'completed' || checkIn.status === 'missed') return;
    setShowPasskeyModal(true);
  }, [checkIn?.id, checkIn?.status]);

  // Handle passkey submission
  const handlePasskeySubmit = async () => {
    if (isProcessing || !checkIn) return;

    setIsProcessing(true);
    setError(null);

    try {
      // Verify passkey
      const isValid = await verifyEmergencyPasskey(passkey);

      if (!isValid) {
        Alert.alert('Invalid Passkey', 'Please enter the correct passkey.');
        setPasskey('');
        setIsProcessing(false);
        return;
      }

      // Complete check-in
      const result = await completeCheckIn(checkIn.id, true); // captureLocation = true

      if (result.success) {
        Alert.alert(
          'Check-In Completed',
          'Your check-in has been successfully completed.',
          [
            {
              text: 'OK',
              onPress: () => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                } else {
                  // Cold-start from notification — no screen to go back to
                  (navigation as any).reset({ index: 0, routes: [{ name: 'Home' }] });
                }
              },
            },
          ]
        );
      } else {
        setError(result.error || 'Failed to complete check-in');
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('[CheckInScreen] Error completing check-in:', err);
      setError(err.message || 'An error occurred');
      setIsProcessing(false);
    }
  };

  // Show passkey modal
  const handleCompleteCheckIn = () => {
    if (!checkIn) return;
    
    // Check if check-in is already completed
    if (checkIn.status === 'completed') {
      Alert.alert('Already Completed', 'This check-in has already been completed.');
      return;
    }

    // Check if check-in is missed
    if (checkIn.status === 'missed') {
      Alert.alert(
        'Check-In Missed',
        'This check-in was marked as missed. Please contact your security agent if you need assistance.'
      );
      return;
    }

    setShowPasskeyModal(true);
    setPasskey('');
  };

  if (loading && !checkIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4BA8FF" />
          <Text style={styles.loadingText}>Loading check-in...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !checkIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={64} color="#CC0022" />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).reset({ index: 0, routes: [{ name: 'Home' }] })}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!checkIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="info-outline" size={64} color="#4BA8FF" />
          <Text style={styles.errorTitle}>No Check-In Found</Text>
          <Text style={styles.errorText}>Unable to load check-in details.</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).reset({ index: 0, routes: [{ name: 'Home' }] })}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const scheduledDate = checkIn.scheduled_at ? new Date(checkIn.scheduled_at) : null;
  const isCompleted = checkIn.status === 'completed';
  const isMissed = checkIn.status === 'missed';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : (navigation as any).reset({ index: 0, routes: [{ name: 'Home' }] })}
        >
          <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Check-In</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Status Badge */}
        <View style={[
          styles.statusBadge,
          isCompleted && styles.statusBadgeCompleted,
          isMissed && styles.statusBadgeMissed,
        ]}>
          <Text style={styles.statusText}>
            {isCompleted ? 'Completed' : isMissed ? 'Missed' : 'Pending'}
          </Text>
        </View>

        {/* Scheduled Time */}
        {scheduledDate && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Scheduled Time</Text>
            <Text style={styles.sectionValue}>
              {formatUserFriendlyDate(scheduledDate.toISOString())}
            </Text>
          </View>
        )}

        {/* Notes */}
        {checkIn.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <Text style={styles.sectionValue}>{checkIn.notes}</Text>
          </View>
        )}

        {/* Error Message */}
        {error && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={20} color="#CC0022" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Complete Button */}
        {!isCompleted && !isMissed && (
          <TouchableOpacity
            style={[styles.completeButton, isProcessing && styles.completeButtonDisabled]}
            onPress={handleCompleteCheckIn}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={24} color="#ffffff" />
                <Text style={styles.completeButtonText}>Complete Check-In</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Info Message */}
        {isCompleted && (
          <View style={styles.infoBox}>
            <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
            <Text style={styles.infoText}>
              This check-in has been completed.
            </Text>
          </View>
        )}

        {isMissed && (
          <View style={styles.infoBox}>
            <MaterialIcons name="warning" size={20} color="#FFA500" />
            <Text style={styles.infoText}>
              This check-in was marked as missed. Please contact your security agent if you need assistance.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Passkey Modal */}
      <EmergencyPasskeyModal
        visible={showPasskeyModal}
        onSubmit={handlePasskeySubmit}
        onClose={() => {
          setShowPasskeyModal(false);
          setPasskey('');
          setIsProcessing(false);
        }}
        title="Complete Check-In"
        subtitle="Enter your passkey to complete the check-in"
        icon="schedule"
        iconColor="#4BA8FF"
        isEmergency={false}
        enteredPasskey={passkey}
        onPasskeyChange={setPasskey}
        isLoading={isProcessing}
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
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#4BA8FF',
    marginBottom: 24,
  },
  statusBadgeCompleted: {
    backgroundColor: '#27AE60',
  },
  statusBadgeMissed: {
    backgroundColor: '#CC0022',
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a1a1a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a2a2a',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  infoText: {
    color: '#ffffff',
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4BA8FF',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  completeButtonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});

