/**
 * Check-In Modal
 * 
 * Full implementation of "Schedule Check In" feature
 * Based on old app but adapted for new architecture
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ServiceModal from '../common/ServiceModal';
import { DatePickerModal } from '../DatePickerModal';
import { ModernTimePicker } from '../ModernTimePicker';
import { EmergencyPasskeyModal } from './EmergencyPasskeyModal';
import { styles } from './CheckInModal.styles';
import { modalStyles } from '../../styles/Modal.styles';
import { CheckInTime, CheckInFrequency } from '@/types/checkin';
import { useCheckIn } from '../../hooks/useCheckIn';
import { formatUserFriendlyDate } from '@/utils/timeHelpers';
import { generateFutureInstances } from '@/utils/recurring';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';

// Helper function
const formatTime = (time: CheckInTime): string => {
  const hours = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
  const minutes = time.minutes.toString().padStart(2, '0');
  return `${hours}:${minutes} ${time.period}`;
};

export interface CheckInModalProps {
  visible: boolean;
  onClose: () => void;
  setActiveService: (service: string | null) => void;
}

const CheckInModal: React.FC<CheckInModalProps> = ({
  visible,
  onClose,
  setActiveService,
}) => {
  const navigation = useNavigation();
  const checkIn = useCheckIn({ enableDueWatcher: false });

  // Local state for pickers
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // ServiceModal readiness — gates nested passkey modal presentation.
  // Same fix as LocationTrackingModal: prevents iOS Fabric sibling modal conflict.
  const [serviceModalReady, setServiceModalReady] = useState(false);

  useEffect(() => {
    if (!visible) setServiceModalReady(false);
  }, [visible]);

  // Check subscription access
  useEffect(() => {
    if (visible) {
      checkSubscriptionAccess('Schedule Check In').then((hasAccess) => {
        if (!hasAccess) {
          // Close modal - checkSubscriptionAccess will handle navigation to TrialExpired screen
          onClose();
        }
      }).catch(() => {});
    }
  }, [visible, onClose]);

  // Initialize date to today if not set
  useEffect(() => {
    if (visible && !checkIn.checkInDate) {
      const today = new Date();
      checkIn.setCheckInDate(formatFullDateLabel(today));
    }
  }, [visible, checkIn]);

  // Sync notes
  useEffect(() => {
    if (checkIn.checkInNotes) {
      setNotesText(checkIn.checkInNotes);
    }
  }, [checkIn.checkInNotes]);

  // Handle date selection
  const handleDateSelect = useCallback((formattedDate: string) => {
    checkIn.setCheckInDate(formattedDate);
    setShowDatePicker(false);
  }, [checkIn]);

  // Handle month navigation in date picker
  const handleMonthChange = useCallback((direction: 'prev' | 'next') => {
    setCalendarMonth((prev) => {
      if (direction === 'next') {
        if (prev === 11) {
          setCalendarYear((y) => y + 1);
          return 0;
        }
        return prev + 1;
      } else {
        if (prev === 0) {
          setCalendarYear((y) => y - 1);
          return 11;
        }
        return prev - 1;
      }
    });
  }, []);

  // Handle time change
  const handleTimeChange = (hours: number, minutes: number, period: 'AM' | 'PM') => {
    checkIn.setCheckInTime({ hours, minutes, period });
    setShowTimePicker(false);
  };

  // Handle notes change
  const handleNotesChange = (text: string) => {
    setNotesText(text);
    checkIn.setCheckInNotes(text);
  };

  // Handle schedule check-in
  const handleScheduleCheckIn = async () => {
    try {
      console.log('[CheckInModal] Scheduling check-in:', {
        date: checkIn.checkInDate,
        time: formatTime(checkIn.checkInTime),
        frequency: checkIn.checkInFrequency,
        notes: checkIn.checkInNotes,
      });

      const success = await checkIn.scheduleCheckIn();

      if (success) {
        console.log('[CheckInModal] ✅ Check-in scheduled successfully');
        // Don't close modal - let user see the scheduled check-ins
      } else {
        console.error('[CheckInModal] ❌ Failed to schedule check-in');
        Alert.alert('Error', 'Failed to schedule check-in. Please try again.');
      }
    } catch (error) {
      console.error('[CheckInModal] ❌ Exception while scheduling check-in:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  };

  // Handle cancel check-in
  const handleCancelCheckIn = async (id: string) => {
    Alert.alert(
      'Cancel Check-in',
      'Are you sure you want to cancel this scheduled check-in?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[CheckInModal] Cancelling check-in:', id);
              const success = await checkIn.cancelCheckIn(id);

              if (success) {
                console.log('[CheckInModal] ✅ Check-in cancelled successfully');
              } else {
                console.error('[CheckInModal] ❌ Failed to cancel check-in');
                Alert.alert('Error', 'Failed to cancel check-in. Please try again.');
              }
            } catch (error) {
              console.error('[CheckInModal] ❌ Exception while cancelling check-in:', error);
              Alert.alert('Error', 'An unexpected error occurred. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Get future instances for preview
  const getFutureInstances = () => {
    if (checkIn.checkInFrequency === 'One-time') {
      return [];
    }
    
    const scheduledTime = (() => {
      try {
        const parsedDate = parseFullDateLabel(checkIn.checkInDate);
        if (isNaN(parsedDate.getTime())) {
          return null;
        }

        let hours = checkIn.checkInTime.hours;
        if (checkIn.checkInTime.period === 'PM' && hours !== 12) hours += 12;
        if (checkIn.checkInTime.period === 'AM' && hours === 12) hours = 0;

        const scheduledDate = new Date(parsedDate);
        scheduledDate.setHours(hours, checkIn.checkInTime.minutes, 0, 0);

        return scheduledDate;
      } catch (error) {
        return null;
      }
    })();
    
    if (!scheduledTime) {
      return [];
    }
    
    return generateFutureInstances(scheduledTime, checkIn.checkInFrequency, 3);
  };

  return (
      <ServiceModal
        visible={visible}
        onClose={onClose}
        title="Schedule Check In"
        onShow={() => setServiceModalReady(true)}
      >
        <ScrollView
          style={styles.scheduleContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          <Text style={styles.scheduleDescription}>
            Schedule a time for a security agent to call and verify your safety.
          </Text>

          {/* Date Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => {
                // Sync calendar to currently selected date before opening
                const parsed = parseFullDateLabel(checkIn.checkInDate);
                setCalendarMonth(parsed.getMonth());
                setCalendarYear(parsed.getFullYear());
                setShowDatePicker(true);
              }}
            >
              <MaterialIcons name="event" size={20} color="#2C3E50" />
              <Text style={styles.dateText}>{checkIn.checkInDate}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#2C3E50" />
            </TouchableOpacity>
          </View>

          {/* Time Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Time</Text>
            <TouchableOpacity 
              style={styles.timeInput}
              onPress={() => setShowTimePicker(true)}
            >
              <MaterialIcons name="access-time" size={20} color="#7f8c8d" />
              <Text style={styles.timeText}>{formatTime(checkIn.checkInTime)}</Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#7f8c8d" />
            </TouchableOpacity>
          </View>

          {/* Frequency Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Frequency</Text>
            <View style={styles.frequencyOptions}>
              {(['One-time', 'Daily', 'Weekly'] as const).map((frequency) => (
                <TouchableOpacity
                  key={frequency}
                  style={styles.frequencyOption}
                  onPress={() => checkIn.setCheckInFrequency(frequency)}
                >
                  <View style={[
                    styles.radioButton, 
                    checkIn.checkInFrequency === frequency && styles.radioButtonSelected
                  ]}>
                    {checkIn.checkInFrequency === frequency && (
                      <View style={styles.radioButtonInner} />
                    )}
                  </View>
                  <Text style={styles.frequencyText}>{frequency}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recurring Preview Section */}
          {(checkIn.checkInFrequency === 'Daily' || checkIn.checkInFrequency === 'Weekly') && (
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Recurring Schedule Preview</Text>
              <View style={styles.recurringPreview}>
                <View style={styles.recurringItem}>
                  <MaterialIcons name="schedule" size={16} color="#27ae60" />
                  <Text style={styles.recurringText}>
                    Next 3 check-ins: {formatTime(checkIn.checkInTime)} on{' '}
                    {checkIn.checkInFrequency === 'Daily' 
                      ? 'consecutive days' 
                      : `every ${new Date(checkIn.checkInDate).toLocaleDateString('en-US', { weekday: 'long' })}`
                    }
                  </Text>
                </View>
                <Text style={styles.recurringNote}>
                  ✓ Automatic scheduling after each successful check-in
                </Text>
                <Text style={styles.recurringNote}>
                  ✓ Cancel anytime from upcoming checks list
                </Text>
              </View>
            </View>
          )}

          {/* Notes Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Notes (Context for security agent)</Text>
            <TextInput
              style={[styles.notesInput, { padding: 12, textAlignVertical: 'top', minHeight: 80 }]}
              multiline
              numberOfLines={4}
              placeholder="Enter notes or context for the security agent..."
              placeholderTextColor="#95a5a6"
              value={notesText}
              onChangeText={handleNotesChange}
              autoCapitalize="sentences"
            />
          </View>

          {/* Schedule Button */}
          <TouchableOpacity
            style={[styles.scheduleCheckButton, checkIn.isScheduling && styles.scheduleCheckButtonDisabled]}
            onPress={handleScheduleCheckIn}
            disabled={checkIn.isScheduling}
          >
            <Text style={styles.scheduleCheckButtonText}>
              {checkIn.isScheduling 
                ? 'Scheduling...' 
                : `Schedule ${checkIn.checkInFrequency === 'One-time' ? '' : checkIn.checkInFrequency + ' '}Security Check`
              }
            </Text>
          </TouchableOpacity>

          {/* Upcoming Security Checks */}
          <View style={styles.upcomingSection}>
            <Text style={styles.upcomingSectionTitle}>Upcoming Security Checks</Text>

            {checkIn.isLoadingCheckIns ? (
              <View style={styles.noCheckInsContainer}>
                <ActivityIndicator size="small" color="#2C3E50" />
                <Text style={[styles.noCheckInsText, { marginTop: 8 }]}>Loading upcoming check-ins...</Text>
              </View>
            ) : (
              (() => {
              const upcomingCheckIns = checkIn.scheduledCheckIns;
              return upcomingCheckIns.length > 0 ? (
              upcomingCheckIns.map((checkInItem) => {
                const scheduledDate = new Date(checkInItem.startAt);
                const dateString = formatFullDateLabel(scheduledDate);
                const timeString = scheduledDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                const frequency = checkInItem.frequency;

                return (
                  <View key={checkInItem.id} style={styles.upcomingCheckIn}>
                    <View style={styles.checkInHeader}>
                      <View style={styles.checkInMainInfo}>
                        <Text style={styles.checkInDate}>
                          {formatUserFriendlyDate(dateString)} at {timeString}
                        </Text>
                        <Text style={styles.checkInFrequency}>
                          {frequency === 'One-time' ? 'One-time check' : 
                           frequency === 'Daily' ? 'Daily recurring check' :
                           frequency === 'Weekly' ? 'Weekly recurring check' : 
                           `${frequency} check`}
                        </Text>
                      </View>
                      <View style={styles.checkInActions}>
                        <TouchableOpacity 
                          style={styles.deleteButton}
                          onPress={() => handleCancelCheckIn(checkInItem.id)}
                        >
                          <MaterialIcons name="delete" size={18} color="#e74c3c" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    {checkInItem.notes && (
                      <Text style={styles.checkInNotes}>{checkInItem.notes}</Text>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.noCheckInsContainer}>
                <Text style={styles.noCheckInsText}>No upcoming security checks</Text>
              </View>
            );
            })()
            )}
          </View>
        </ScrollView>

        {/* Date Picker Modal */}
        <DatePickerModal
          visible={showDatePicker}
          title="Select Date"
          selectedDate={checkIn.checkInDate}
          currentMonth={calendarMonth}
          currentYear={calendarYear}
          onDateSelect={handleDateSelect}
          onClose={() => setShowDatePicker(false)}
          onMonthChange={handleMonthChange}
          allowPastDates={false}
          showTodayButton={true}
          styles={modalStyles}
        />

        {/* Time Picker Modal */}
        <ModernTimePicker
          visible={showTimePicker}
          hours={checkIn.checkInTime.hours}
          minutes={checkIn.checkInTime.minutes}
          period={checkIn.checkInTime.period}
          title="Select Time"
          onTimeChange={handleTimeChange}
          onClose={() => setShowTimePicker(false)}
        />
        {/* Passkey Modal for Check-ins — INSIDE ServiceModal so it presents
            from ServiceModal's VC (nested), preventing iOS Fabric sibling modal conflict.
            Conditionally rendered to avoid invisible Modal blocking touches. */}
        {checkIn.showPasskeyModal && serviceModalReady && (
          <EmergencyPasskeyModal
            visible={true}
            onSubmit={checkIn.handlePasskeySubmit}
            title="Security Check-In"
            subtitle="Enter passkey to verify"
            icon="security"
            iconColor="#2c3e50"
            isEmergency={false}
            emergencyCountdown={checkIn.passkeyCountdown}
            emergencyDeadlineMs={checkIn.activeCheckIn ? new Date(checkIn.activeCheckIn.scheduledAt).getTime() + 30 * 1000 : undefined}
            enteredPasskey={checkIn.enteredPasskey}
            onPasskeyChange={checkIn.setEnteredPasskey}
            isLoading={checkIn.isPasskeyProcessing}
          />
        )}
      </ServiceModal>
  );
};

export default CheckInModal;
