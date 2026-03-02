/**
 * Location Tracking Modal
 * 
 * Full implementation of "Track Me On The Go" feature
 * Based on old app but adapted for new architecture
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ServiceModal from '../common/ServiceModal';
import { DatePickerModal } from '../DatePickerModal';
import { ModernTimePicker } from '../ModernTimePicker';
import { EmergencyPasskeyModal } from './EmergencyPasskeyModal';
import formButtonStyles from '../../styles/FormButton.styles';
import { modalStyles } from '../../styles/Modal.styles';
import { trackingStyles } from '../../styles/Tracking.styles';
import { CheckInTime } from '../../types/checkin';
import { TRACKING_INTERVALS, TrackingIntervalValue } from '../../types/tracking';
import { useTrackingSession } from '@/hooks/useTrackingSession';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';

// Lazy-loaded WebView component
const LazyMapView: React.FC<{
  currentLocation: Location.LocationObject;
}> = memo(({ currentLocation }) => {
  const mapUri = `https://www.openstreetmap.org/export/embed.html?bbox=${(currentLocation.coords.longitude - 0.01).toFixed(6)},${(currentLocation.coords.latitude - 0.01).toFixed(6)},${(currentLocation.coords.longitude + 0.01).toFixed(6)},${(currentLocation.coords.latitude + 0.01).toFixed(6)}&layer=mapnik&marker=${currentLocation.coords.latitude},${currentLocation.coords.longitude}`;
  
  return (
    <WebView
      source={{ uri: mapUri }}
      style={trackingStyles.mapWebView}
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  );
});
LazyMapView.displayName = 'LazyMapView';

export interface LocationTrackingModalProps {
  visible: boolean;
  onClose: () => void;
  setActiveService: (service: string | null) => void;
}

export const LocationTrackingModal: React.FC<LocationTrackingModalProps> = ({
  visible,
  onClose,
  setActiveService,
}) => {
  const navigation = useNavigation();
  const tracking = useTrackingSession();
  
  // Local state
  const [trackingInterval, setTrackingInterval] = useState<number>(15);
  const [showTrackingIntervalDropdown, setShowTrackingIntervalDropdown] = useState(false);

  // Sync local interval state from active session so the dropdown and display
  // reflect the actual session interval (not the stale default of 15).
  useEffect(() => {
    if (tracking.session?.checkin_interval_minutes) {
      setTrackingInterval(tracking.session.checkin_interval_minutes);
    }
  }, [tracking.session?.checkin_interval_minutes]);
  const [locationPermission, setLocationPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showMap, setShowMap] = useState(false);
  
  // Date/Time state
  const [trackingDateLabel, setTrackingDateLabel] = useState('');
  const [trackingDateValue, setTrackingDateValue] = useState<Date | null>(null);
  const [fromTime, setFromTime] = useState<CheckInTime>({ hours: 9, minutes: 0, period: 'AM' });
  const [toTime, setToTime] = useState<CheckInTime>({ hours: 5, minutes: 0, period: 'PM' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerType, setTimePickerType] = useState<'from' | 'to' | null>(null);
  
  // Calendar month navigation state
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Passkey modal state
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);
  const [passkey, setPasskey] = useState('');
  const [isValidatingPasskey, setIsValidatingPasskey] = useState(false);

  // ServiceModal readiness — gates nested passkey modal presentation.
  // On iOS (Fabric), sibling Modals can't present from the same parent VC.
  // The passkey modal must present FROM ServiceModal's VC (nested), so we
  // wait for ServiceModal's onShow before allowing the passkey modal.
  const [serviceModalReady, setServiceModalReady] = useState(false);

  useEffect(() => {
    if (!visible) setServiceModalReady(false);
  }, [visible]);

  // Check subscription access
  useEffect(() => {
    if (visible) {
      checkSubscriptionAccess('Track Me On The Go').then((hasAccess) => {
        if (!hasAccess) {
          // Close modal - checkSubscriptionAccess will handle navigation to TrialExpired screen
          onClose();
        }
      }).catch(() => {});
    }
  }, [visible, onClose]);

  // Show map when modal is visible
  useEffect(() => {
    if (visible) {
      setShowMap(true);
      return () => {
        setShowMap(false);
      };
    } else {
      setShowMap(false);
    }
  }, [visible]);

  // Check location permission
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        setLocationPermission(status === 'granted');
      } catch (error) {
        console.error('[LocationTrackingModal] Error checking location permission:', error);
      }
    };
    if (visible) {
      checkPermission();
    }
  }, [visible]);

  // Initialize date to today if not set
  useEffect(() => {
    if (visible && !trackingDateValue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setTrackingDateValue(today);
      setTrackingDateLabel(formatFullDateLabel(today));
    }
  }, [visible, trackingDateValue]);

  // Sync passkey modal with tracking hook
  useEffect(() => {
    if (tracking.showPasskeyModal && !showPasskeyModal) {
      setShowPasskeyModal(true);
      setPasskey('');
    } else if (!tracking.showPasskeyModal && showPasskeyModal) {
      setShowPasskeyModal(false);
      setPasskey('');
    }
  }, [tracking.showPasskeyModal, showPasskeyModal]);

  // Get current location
  const getCurrentLocation = useCallback(async (showError = false) => {
    try {
      setIsGettingLocation(true);
      
      if (!locationPermission) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (showError) {
            Alert.alert(
              'Location Permission Required',
              'This app needs location access to show your current position. Would you like to grant permission?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  onPress: async () => {
                    const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
                    if (newStatus === 'granted') {
                      setLocationPermission(true);
                      getCurrentLocation(true);
                    } else {
                      Alert.alert(
                        'Permission Denied',
                        'You can enable location access later in your device settings.',
                        [
                          { text: 'OK' },
                          { text: 'Settings', onPress: () => Linking.openSettings() }
                        ]
                      );
                    }
                  }
                }
              ]
            );
          }
          setIsGettingLocation(false);
          return;
        }
        setLocationPermission(true);
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      setCurrentLocation(location);
    } catch (error) {
      console.error('[LocationTrackingModal] Error getting location:', error);
      if (showError) {
        Alert.alert('Error', 'Failed to get your current location. Please try again.');
      }
    } finally {
      setIsGettingLocation(false);
    }
  }, [locationPermission]);

  // Format time display
  const formatTime = useCallback((time: CheckInTime): string => {
    return `${time.hours}:${String(time.minutes).padStart(2, '0')} ${time.period}`;
  }, []);

  // Handle date selection
  const handleDateSelect = useCallback((formattedDate: string) => {
    const parsedDate = parseFullDateLabel(formattedDate);
    setTrackingDateValue(parsedDate);
    setTrackingDateLabel(formattedDate);
    setShowDatePicker(false);
  }, []);

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
  const handleTimeChange = useCallback((hours: number, minutes: number, period: 'AM' | 'PM') => {
    if (timePickerType === 'from') {
      setFromTime({ hours, minutes, period });
    } else if (timePickerType === 'to') {
      setToTime({ hours, minutes, period });
    }
    setShowTimePicker(false);
    setTimePickerType(null);
  }, [timePickerType]);

  // Apply time to date (12-hour → 24-hour conversion)
  const applyTimeToDateLocal = useCallback((baseDate: Date, time: CheckInTime): Date => {
    const result = new Date(baseDate);
    let hours = time.hours % 12; // 12→0, 1-11 unchanged
    if (time.period === 'PM') {
      hours += 12; // 0→12 (noon), 1→13, ... 11→23
    }
    // AM: 0 stays 0 (midnight), 1-11 unchanged

    result.setHours(hours, time.minutes, 0, 0);
    result.setMilliseconds(0);
    return result;
  }, []);

  // Handle start tracking session
  const handleStartTrackingSession = useCallback(async () => {
    if (tracking.loading || tracking.isTracking) {
      console.log('[LocationTrackingModal] Cannot start - already loading or tracking');
      return;
    }

    if (!trackingDateLabel) {
      Alert.alert('Date Required', 'Please select a date for tracking.');
      return;
    }

    try {
      const baseDate = trackingDateValue
        ? new Date(trackingDateValue.getTime())
        : new Date();
      baseDate.setHours(0, 0, 0, 0);

      const startTime = applyTimeToDateLocal(baseDate, fromTime);
      let endTime = applyTimeToDateLocal(baseDate, toTime);

      // Cross-midnight: e.g. 11 PM → 3 AM means the end is the next day
      if (endTime <= startTime) {
        endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
      }

      // Ensure end time is in the future — otherwise no check-ins can fire
      const now = new Date();
      if (endTime <= now) {
        Alert.alert(
          'Invalid Time Range',
          'The end time has already passed. Please select a future end time or a later date.'
        );
        return;
      }

      // Verify at least one check-in fits within the remaining window
      const effectiveStartMs = Math.max(startTime.getTime(), now.getTime());
      const intervalMs = trackingInterval * 60_000;
      const sessionStartMs = startTime.getTime();
      let firstCheckinMs: number;
      if (effectiveStartMs <= sessionStartMs) {
        firstCheckinMs = sessionStartMs;
      } else {
        const elapsed = effectiveStartMs - sessionStartMs;
        firstCheckinMs = sessionStartMs + Math.ceil(elapsed / intervalMs) * intervalMs;
      }
      if (firstCheckinMs > endTime.getTime()) {
        Alert.alert(
          'Insufficient Time',
          `Not enough time remaining for a check-in at the ${trackingInterval}-minute interval. Please extend the end time or reduce the check-in interval.`
        );
        return;
      }

      console.log('[LocationTrackingModal] Starting tracking session:', {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        interval: trackingInterval,
      });

      const success = await tracking.createSession(startTime, endTime, trackingInterval as TrackingIntervalValue);

      if (success) {
        console.log('[LocationTrackingModal] ✅ Tracking session started successfully');
        Alert.alert(
          'Tracking Started',
          `Security tracking is now active from ${formatTime(fromTime)} to ${formatTime(toTime)} with passkey check-ins every ${trackingInterval} minutes.`,
          [{ text: 'OK' }]
        );
        // Get initial location asynchronously with timeout (non-blocking)
        // Don't await - location is optional and can take time to acquire
        (async () => {
          try {
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Location timeout')), 5000)
            );
            const locationPromise = (async () => {
              const { status } = await Location.getForegroundPermissionsAsync();
              if (status !== 'granted') {
                const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
                if (newStatus !== 'granted') return;
              }
              const location = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.High,
              });
              setCurrentLocation(location);
            })();
            await Promise.race([locationPromise, timeoutPromise]);
          } catch (error) {
            console.warn('[LocationTrackingModal] Initial location fetch failed (non-blocking):', error);
          }
        })();
      } else {
        console.error('[LocationTrackingModal] ❌ Failed to start tracking session');
        Alert.alert('Error', 'Failed to start tracking session. Please try again.');
      }
    } catch (error) {
      console.error('[LocationTrackingModal] ❌ Exception while starting tracking:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  }, [tracking, trackingDateLabel, trackingDateValue, fromTime, toTime, trackingInterval, applyTimeToDateLocal, formatTime, getCurrentLocation]);

  // Handle stop tracking session
  const handleStopTrackingSession = useCallback(async () => {
    Alert.alert(
      'Stop Tracking',
      'Are you sure you want to stop the security tracking session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            /**
             * ✅ FIX: Show success/error alert BEFORE closing modal
             * Previously, onClose() was called before the Alert, causing
             * the modal to disappear before user could see the result.
             */
            const success = await tracking.completeTrackingSession();
            if (success) {
              Alert.alert(
                'Tracking Stopped',
                'Security tracking has been stopped.',
                [{ text: 'OK', onPress: () => onClose() }]
              );
            } else {
              Alert.alert('Error', 'Failed to stop tracking session. Please try again.');
            }
          },
        },
      ]
    );
  }, [tracking, onClose]);

  // Handle passkey submit
  const handlePasskeySubmit = useCallback(async () => {
    if (isValidatingPasskey || passkey.length !== 4) return;
    
    setIsValidatingPasskey(true);
    
    try {
      // Validate passkey using tracking service
      const { validatePasskey } = await import('@/services/trackingService');
      const isValid = await validatePasskey(passkey);
      
      if (isValid) {
        await tracking.onPasskeySuccess();
        setPasskey('');
      } else {
        await tracking.onPasskeyFailure();
        setPasskey('');
        Alert.alert('Incorrect Passkey', 'The passkey you entered is incorrect.');
      }
    } catch (error) {
      console.error('[LocationTrackingModal] Error validating passkey:', error);
      await tracking.onPasskeyFailure();
      setPasskey('');
      Alert.alert('Error', 'Failed to validate passkey. Please try again.');
    } finally {
      setIsValidatingPasskey(false);
    }
  }, [passkey, isValidatingPasskey, tracking]);

  // Get current check-in countdown
  const nextCheckIn = tracking.nextTrackingCheckIn;
  const countdown = tracking.trackingCountdown;

  return (
      <ServiceModal
        visible={visible}
        onClose={onClose}
        title="Track Me On The Go"
        onShow={() => setServiceModalReady(true)}
      >
        <ScrollView
          style={modalStyles.serviceContent}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Tracking Interval Selection */}
          <View style={formButtonStyles.inputSection}>
            <Text style={formButtonStyles.inputLabel}>Select Check-in Interval</Text>
            <TouchableOpacity
              style={formButtonStyles.dropdownInput}
              onPress={() => setShowTrackingIntervalDropdown(true)}
              disabled={tracking.isTracking}
            >
              <MaterialIcons name="schedule" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
              <Text style={[formButtonStyles.dropdownText, !tracking.isTracking && formButtonStyles.selectedText, tracking.isTracking && { color: '#bdc3c7' }]}>
                Every {trackingInterval} minutes
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
            </TouchableOpacity>
          </View>

          {/* Interval Dropdown */}
          {showTrackingIntervalDropdown && (
            <View style={{ marginBottom: 16 }}>
              {TRACKING_INTERVALS.map((interval) => (
                <TouchableOpacity
                  key={interval.value}
                  style={{
                    padding: 12,
                    backgroundColor: trackingInterval === interval.value ? '#e3f2fd' : '#f5f5f5',
                    borderRadius: 8,
                    marginBottom: 4,
                  }}
                  onPress={() => {
                    setTrackingInterval(interval.value);
                    setShowTrackingIntervalDropdown(false);
                  }}
                  disabled={tracking.isTracking}
                >
                  <Text style={{ color: trackingInterval === interval.value ? '#1976d2' : '#333' }}>
                    {interval.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Date Selection */}
          <View style={formButtonStyles.inputSection}>
            <Text style={formButtonStyles.inputLabel}>Select Date</Text>
            <TouchableOpacity
              style={formButtonStyles.dropdownInput}
              onPress={() => {
                // Sync calendar to currently selected date before opening
                const d = trackingDateValue ?? new Date();
                setCalendarMonth(d.getMonth());
                setCalendarYear(d.getFullYear());
                setShowDatePicker(true);
              }}
              disabled={tracking.isTracking}
            >
              <MaterialIcons name="calendar-today" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
              <Text style={[formButtonStyles.dropdownText, !tracking.isTracking && formButtonStyles.selectedText, tracking.isTracking && { color: '#bdc3c7' }]}>
                {trackingDateLabel || 'Select Date'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
            </TouchableOpacity>
          </View>

          {/* Time Selection - From and To */}
          <View style={formButtonStyles.inputSection}>
            <Text style={formButtonStyles.inputLabel}>Time Range</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[formButtonStyles.inputLabel, { fontSize: 14, marginBottom: 4 }]}>From</Text>
                <TouchableOpacity
                  style={formButtonStyles.dropdownInput}
                  onPress={() => {
                    setTimePickerType('from');
                    setShowTimePicker(true);
                  }}
                  disabled={tracking.isTracking}
                >
                  <MaterialIcons name="access-time" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
                  <Text style={[formButtonStyles.dropdownText, !tracking.isTracking && formButtonStyles.selectedText, tracking.isTracking && { color: '#bdc3c7' }]}>
                    {formatTime(fromTime)}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[formButtonStyles.inputLabel, { fontSize: 14, marginBottom: 4 }]}>To</Text>
                <TouchableOpacity
                  style={formButtonStyles.dropdownInput}
                  onPress={() => {
                    setTimePickerType('to');
                    setShowTimePicker(true);
                  }}
                  disabled={tracking.isTracking}
                >
                  <MaterialIcons name="access-time" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
                  <Text style={[formButtonStyles.dropdownText, !tracking.isTracking && formButtonStyles.selectedText, tracking.isTracking && { color: '#bdc3c7' }]}>
                    {formatTime(toTime)}
                  </Text>
                  <MaterialIcons name="keyboard-arrow-down" size={20} color={tracking.isTracking ? "#bdc3c7" : "#7f8c8d"} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Session Status Display */}
          {tracking.session && (
            <View style={[trackingStyles.trackingStatusCard, { marginTop: 16 }]}>
              <View style={trackingStyles.trackingHeader}>
                <MaterialIcons name="security" size={20} color="#27ae60" />
                <Text style={trackingStyles.trackingTitle}>Active Security Session</Text>
              </View>
              <View style={{ marginTop: 8 }}>
                <Text style={[trackingStyles.statusText, { fontSize: 14 }]}>
                  Check-ins every {tracking.session.checkin_interval_minutes} minutes
                </Text>
                {nextCheckIn && (
                  <Text style={[trackingStyles.statusText, { fontSize: 14 }]}>
                    Next check-in: {nextCheckIn.toLocaleTimeString()}
                  </Text>
                )}
                <Text style={[trackingStyles.statusText, { fontSize: 14 }]}>
                  Total: {tracking.trackingStats.success + tracking.trackingStats.failed} |
                  ✅ Successful: {tracking.trackingStats.success} |
                  ❌ Failed: {tracking.trackingStats.failed}
                </Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={trackingStyles.trackingButtonsContainer}>
            <TouchableOpacity
              style={[
                trackingStyles.trackingButton,
                !tracking.isTracking && !tracking.loading && !tracking.session
                  ? trackingStyles.startButtonActive
                  : trackingStyles.inactiveTrackingButton
              ]}
              onPress={handleStartTrackingSession}
              disabled={tracking.isTracking || tracking.loading || !!tracking.session}
            >
              {tracking.loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <MaterialIcons name="play-arrow" size={20} color={!tracking.isTracking && !tracking.session ? "#ffffff" : "#bdc3c7"} />
              )}
              <Text style={[trackingStyles.trackingButtonText, !tracking.isTracking && !tracking.session ? trackingStyles.activeButtonText : trackingStyles.inactiveButtonText]}>
                {tracking.loading ? 'Starting...' : 'Start Secure Tracking'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[trackingStyles.trackingButton, (tracking.isTracking || tracking.session) ? trackingStyles.endButtonActive : trackingStyles.inactiveTrackingButton]}
              onPress={handleStopTrackingSession}
              disabled={!tracking.isTracking && !tracking.session}
            >
              <MaterialIcons name="stop" size={20} color={(tracking.isTracking || tracking.session) ? "#ffffff" : "#bdc3c7"} />
              <Text style={[trackingStyles.trackingButtonText, (tracking.isTracking || tracking.session) ? trackingStyles.activeButtonText : trackingStyles.inactiveButtonText]}>
                End Tracking
              </Text>
            </TouchableOpacity>
          </View>

          {/* Active Tracking Check-in Status */}
          {(tracking.isTracking || tracking.session) && locationPermission && (
            <View style={trackingStyles.trackingStatusCard}>
              <View style={trackingStyles.trackingHeader}>
                <Text style={trackingStyles.trackingTitle}>Active Tracking</Text>
                <View style={trackingStyles.statusIndicator}>
                  <View style={[trackingStyles.statusDot, trackingStyles.activeDot]} />
                  <Text style={trackingStyles.statusText}>Every {tracking.session?.checkin_interval_minutes ?? trackingInterval} min</Text>
                </View>
              </View>
              <Text style={trackingStyles.trackingDescription}>
                Security agents will request check-ins every {tracking.session?.checkin_interval_minutes ?? trackingInterval} minutes while tracking is active
              </Text>

              <View style={trackingStyles.nextCheckInContainer}>
                <Text style={trackingStyles.nextCheckInLabel}>Next check-in in:</Text>
                <Text style={trackingStyles.countdownTimer}>{countdown}</Text>
                {nextCheckIn && (
                  <View style={trackingStyles.progressBar}>
                    <View style={[trackingStyles.progressFill, {
                      width: `${Math.max(0, Math.min(100, (((tracking.session?.checkin_interval_minutes ?? trackingInterval) * 60 * 1000) - (nextCheckIn.getTime() - Date.now())) / ((tracking.session?.checkin_interval_minutes ?? trackingInterval) * 60 * 1000) * 100))}%`
                    }]} />
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Current Location Section */}
          <View style={trackingStyles.locationCard}>
            <View style={trackingStyles.locationHeader}>
              <MaterialIcons name="my-location" size={20} color="#2C3E50" />
              <Text style={trackingStyles.locationCardTitle}>Current Location</Text>
              <TouchableOpacity
                style={trackingStyles.refreshLocationButton}
                onPress={() => getCurrentLocation(true)}
                disabled={isGettingLocation}
              >
                <MaterialIcons name="refresh" size={16} color="#2C3E50" />
              </TouchableOpacity>
            </View>

            {isGettingLocation ? (
              <View style={trackingStyles.mapPlaceholder}>
                <ActivityIndicator size="large" color="#F39C12" style={{ marginBottom: 12 }} />
                <MaterialIcons name="location-searching" size={48} color="#F39C12" />
                <Text style={trackingStyles.mapViewText}>Getting precise location...</Text>
              </View>
            ) : currentLocation ? (
              <View style={trackingStyles.liveMapContainer}>
                <View style={trackingStyles.mapHeader}>
                  <Text style={trackingStyles.liveIndicator}>🔴 LIVE MAP</Text>
                  <TouchableOpacity
                    style={trackingStyles.openMapsButton}
                    onPress={() => {
                      const url = `https://maps.google.com/?q=${currentLocation.coords.latitude},${currentLocation.coords.longitude}`;
                      Linking.openURL(url);
                    }}
                  >
                    <Text style={trackingStyles.openMapsText}>Open in Maps</Text>
                  </TouchableOpacity>
                </View>
                {showMap && currentLocation && (
                  <LazyMapView currentLocation={currentLocation} />
                )}
                <View style={trackingStyles.locationDetails}>
                  <Text style={trackingStyles.addressText}>
                    Coordinates: {currentLocation.coords.latitude.toFixed(6)}, {currentLocation.coords.longitude.toFixed(6)}
                  </Text>
                  <Text style={trackingStyles.addressText}>
                    Accuracy: ±{Math.round(currentLocation.coords.accuracy || 0)}m
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={trackingStyles.mapPlaceholder}
                onPress={() => getCurrentLocation(true)}
              >
                <MaterialIcons name="place" size={48} color="#2C3E50" />
                <Text style={trackingStyles.mapViewText}>
                  {locationPermission ? 'Tap to get location' : 'Grant location permission'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Check-in History Section */}
          <View style={trackingStyles.historyCard}>
            <Text style={trackingStyles.historyTitle}>Check-in History</Text>
            <Text style={trackingStyles.historySubtitle}>Record of your recent check-ins</Text>

            <View style={trackingStyles.historyList}>
              {tracking.checkInHistory && tracking.checkInHistory.length > 0 ? (
                tracking.checkInHistory.map((checkIn, index) => {
                  // History is ordered newest-first; compute chronological number
                  const checkInNumber = tracking.checkInHistory.length - index;
                  return (
                  <View key={checkIn.id || index} style={trackingStyles.historyItem}>
                    <MaterialIcons
                      name={checkIn.status === 'success' ? "check-circle" : checkIn.status === 'missed' ? "error" : "schedule"}
                      size={16}
                      color={checkIn.status === 'success' ? "#27ae60" : checkIn.status === 'missed' ? "#e74c3c" : "#f39c12"}
                    />
                    <View style={trackingStyles.historyContent}>
                      <Text style={trackingStyles.historyTime}>
                        {new Date(checkIn.scheduled_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                      <Text style={trackingStyles.historyLocation}>
                        Check-in #{checkInNumber}
                      </Text>
                    </View>
                    <View style={[trackingStyles.respondedBadge, {
                      backgroundColor: checkIn.status === 'success' ? 'rgba(39, 174, 96, 0.1)' :
                        checkIn.status === 'missed' ? 'rgba(231, 76, 60, 0.1)' : 'rgba(243, 156, 18, 0.1)'
                    }]}>
                      <Text style={[trackingStyles.respondedText, {
                        color: checkIn.status === 'success' ? '#27ae60' :
                          checkIn.status === 'missed' ? '#e74c3c' : '#f39c12'
                      }]}>
                        {checkIn.status === 'success' ? 'Responded' :
                          checkIn.status === 'missed' ? 'Missed' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                  );
                })
              ) : (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#95a5a6', fontStyle: 'italic' }}>No recent check-ins found</Text>
                </View>
              )}
            </View>
          </View>

          {!locationPermission && (
            <View style={modalStyles.permissionWarning}>
              <MaterialIcons name="warning" size={20} color="#F39C12" />
              <Text style={modalStyles.permissionText}>
                Location permission required. Please enable location access in your device settings.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Date Picker Modal */}
        <DatePickerModal
          visible={showDatePicker}
          title="Select Date"
          selectedDate={trackingDateLabel}
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
        {timePickerType && (
          <ModernTimePicker
            visible={showTimePicker}
            hours={timePickerType === 'from' ? fromTime.hours : toTime.hours}
            minutes={timePickerType === 'from' ? fromTime.minutes : toTime.minutes}
            period={timePickerType === 'from' ? fromTime.period : toTime.period}
            title={`Select ${timePickerType === 'from' ? 'Start' : 'End'} Time`}
            onTimeChange={handleTimeChange}
            onClose={() => {
              setShowTimePicker(false);
              setTimePickerType(null);
            }}
          />
        )}

        {/* Passkey Modal for Check-ins — INSIDE ServiceModal so it presents
            from ServiceModal's VC (nested presentation), not from the root VC
            (sibling presentation). This prevents the iOS Fabric error:
            "Attempt to present ... which is already presenting ..."
            Conditionally rendered to avoid invisible Modal blocking touches. */}
        {showPasskeyModal && serviceModalReady && (
          <EmergencyPasskeyModal
            visible={true}
            onSubmit={handlePasskeySubmit}
            title="Security Check-In"
            subtitle="Enter passkey to verify"
            icon="security"
            iconColor="#2c3e50"
            isEmergency={false}
            emergencyCountdown={tracking.passkeyTimeLeft}
            emergencyDeadlineMs={tracking.passkeyTimeLeft ? Date.now() + tracking.passkeyTimeLeft * 1000 : undefined}
            enteredPasskey={passkey}
            onPasskeyChange={setPasskey}
            isLoading={isValidatingPasskey}
          />
        )}
      </ServiceModal>
  );
};

export default LocationTrackingModal;
