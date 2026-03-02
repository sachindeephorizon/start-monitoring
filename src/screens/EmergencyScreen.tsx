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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { MainStackParamList } from '@/navigation/MainNavigator';
import { EmergencyService } from '@/features/emergency/emergency.service';
import { Emergency } from '@/features/emergency/emergency.types';
import { formatUserFriendlyDate } from '@/utils/timeHelpers';

type EmergencyScreenRouteProp = RouteProp<MainStackParamList, 'Emergency'>;

export default function EmergencyScreen() {
  const route = useRoute<EmergencyScreenRouteProp>();
  const navigation = useNavigation();
  const { emergencyId } = route.params || {};
  
  const [emergency, setEmergency] = useState<Emergency | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

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
    if (!emergency || emergency.status === 'resolved') {
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

  // Handle cancel emergency
  const handleCancelEmergency = () => {
    if (!emergency) return;

    Alert.alert(
      'Cancel Emergency',
      'Are you sure you want to cancel this emergency?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const success = await EmergencyService.cancel(emergency.id);
              if (success) {
                Alert.alert(
                  'Emergency Cancelled',
                  'The emergency has been cancelled.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        navigation.goBack();
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', 'Failed to cancel emergency. Please try again.');
              }
            } catch (err: any) {
              console.error('[EmergencyScreen] Error cancelling emergency:', err);
              Alert.alert('Error', err.message || 'Failed to cancel emergency');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
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

  const triggeredDate = emergency.triggered_at ? new Date(emergency.triggered_at) : null;
  const resolvedDate = emergency.resolved_at ? new Date(emergency.resolved_at) : null;
  const isResolved = emergency.status === 'resolved';
  const isActive = ['active', 'triggered', 'acknowledged', 'in_progress'].includes(emergency.status);

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
            {emergency.status.charAt(0).toUpperCase() + emergency.status.slice(1).replace('_', ' ')}
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

        {/* Description */}
        {emergency.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Description</Text>
            <Text style={styles.sectionValue}>{emergency.description}</Text>
          </View>
        )}

        {/* Priority */}
        {emergency.priority && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Priority</Text>
            <Text style={styles.sectionValue}>
              {emergency.priority.charAt(0).toUpperCase() + emergency.priority.slice(1)}
            </Text>
          </View>
        )}

        {/* Agent Assignment */}
        {emergency.assigned_agent_id && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Assigned Agent</Text>
            <Text style={styles.sectionValue}>Agent assigned</Text>
          </View>
        )}

        {/* Cancel Button */}
        {isActive && (
          <TouchableOpacity
            style={[styles.cancelButton, isCancelling && styles.cancelButtonDisabled]}
            onPress={handleCancelEmergency}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <MaterialIcons name="cancel" size={24} color="#ffffff" />
                <Text style={styles.cancelButtonText}>Cancel Emergency</Text>
              </>
            )}
          </TouchableOpacity>
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
});

