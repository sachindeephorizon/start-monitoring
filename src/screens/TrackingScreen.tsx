/**
 * Tracking Screen
 *
 * Full-screen version of "Track Me On The Go" feature..
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import Svg, { Circle } from 'react-native-svg';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { DatePickerModal } from '@/components/DatePickerModal';
import { ModernTimePicker } from '@/components/ModernTimePicker';
import { EmergencyPasskeyModal } from '@/components/modals/EmergencyPasskeyModal';
import formButtonStyles from '@/styles/FormButton.styles';
import { modalStyles } from '@/styles/Modal.styles';
import { trackingStyles } from '@/styles/Tracking.styles';
import { CheckInTime } from '@/types/checkin';
import { TRACKING_INTERVALS, TrackingIntervalValue } from '@/types/tracking';
import { useTrackingSession } from '@/hooks/useTrackingSession';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';

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

const CircularProgress: React.FC<{ percent: number; label: string }> = ({ percent, label }) => {
  const size = 96;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e9edf1"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#2C3E50"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ fontSize: 12, color: '#7f8c8d', fontWeight: '600' }}>{label}</Text>
        <Text style={{ fontSize: 13, color: '#2C3E50', fontWeight: '700' }}>{Math.round(clamped)}%</Text>
      </View>
    </View>
  );
};

export default function TrackingScreen() {
  const navigation = useNavigation();
  const tracking = useTrackingSession();

  const [trackingInterval, setTrackingInterval] = useState<number>(15);
  const [showTrackingIntervalDropdown, setShowTrackingIntervalDropdown] = useState(false);

  useEffect(() => {
    if (tracking.session?.checkin_interval_minutes) {
      setTrackingInterval(tracking.session.checkin_interval_minutes);
    }
  }, [tracking.session?.checkin_interval_minutes]);

  const [locationPermission, setLocationPermission] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showMap, setShowMap] = useState(true);

  const [trackingDateLabel, setTrackingDateLabel] = useState('');
  const [trackingDateValue, setTrackingDateValue] = useState<Date | null>(null);
  const [fromTime, setFromTime] = useState<CheckInTime>({ hours: 9, minutes: 0, period: 'AM' });
  const [toTime, setToTime] = useState<CheckInTime>({ hours: 5, minutes: 0, period: 'PM' });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerType, setTimePickerType] = useState<'from' | 'to' | null>(null);

  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  const [showEndTrackingPasskeyModal, setShowEndTrackingPasskeyModal] = useState(false);
  const [endTrackingPasskey, setEndTrackingPasskey] = useState('');
  const [isEndingTracking, setIsEndingTracking] = useState(false);

  // Check subscription access on mount
  useEffect(() => {
    checkSubscriptionAccess('Track Me On The Go').then((hasAccess) => {
      if (!hasAccess) {
        navigation.goBack();
      }
    }).catch(() => { });
  }, []);

  // Check location permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        setLocationPermission(status === 'granted');
      } catch (error) {
        console.error('[TrackingScreen] Error checking location permission:', error);
      }
    };
    checkPermission();
  }, []);

  // Initialize date to today on mount
  useEffect(() => {
    if (!trackingDateValue) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setTrackingDateValue(today);
      setTrackingDateLabel(formatFullDateLabel(today));
    }
  }, []);

  // Cleanup map on unmount
  useEffect(() => {
    return () => setShowMap(false);
  }, []);

  const getCurrentLocation = useCallback(async (
    options: { showError?: boolean; requestPermission?: boolean } = {},
  ): Promise<Location.LocationObject | null> => {
    const { showError = false, requestPermission = false } = options;

    try {
      setIsGettingLocation(true);

      if (!locationPermission) {
        if (!requestPermission) {
          if (showError) {
            Alert.alert(
              'Location Permission Required',
              'Start Track Me to grant location access for this session.',
              [
                { text: 'OK' },
                { text: 'Settings', onPress: () => Linking.openSettings() },
              ]
            );
          }

          return null;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (showError) {
            Alert.alert(
              'Permission Denied',
              'Track Me requires location permission. Please enable location access in your device settings.',
              [
                { text: 'OK' },
                { text: 'Settings', onPress: () => Linking.openSettings() },
              ]
            );
          }

          return null;
        }

        setLocationPermission(true);
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation(location);
      return location;
    } catch (error) {
      console.error('[TrackingScreen] Error getting location:', error);
      if (showError) {
        Alert.alert('Error', 'Failed to get your current location. Please try again.');
      }
      return null;
    } finally {
      setIsGettingLocation(false);
    }
  }, [locationPermission]);

  useEffect(() => {
    if (locationPermission && !currentLocation && !isGettingLocation) {
      getCurrentLocation({ showError: false, requestPermission: false }).catch(() => { });
    }
  }, [locationPermission, currentLocation, isGettingLocation, getCurrentLocation]);

  const formatTime = useCallback((time: CheckInTime): string => {
    return `${time.hours}:${String(time.minutes).padStart(2, '0')} ${time.period}`;
  }, []);

  const handleDateSelect = useCallback((formattedDate: string) => {
    const parsedDate = parseFullDateLabel(formattedDate);
    setTrackingDateValue(parsedDate);
    setTrackingDateLabel(formattedDate);
    setShowDatePicker(false);
  }, []);

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

  const handleTimeChange = useCallback((hours: number, minutes: number, period: 'AM' | 'PM') => {
    if (timePickerType === 'from') {
      setFromTime({ hours, minutes, period });
    } else if (timePickerType === 'to') {
      setToTime({ hours, minutes, period });
    }
    setShowTimePicker(false);
    setTimePickerType(null);
  }, [timePickerType]);

  const applyTimeToDateLocal = useCallback((baseDate: Date, time: CheckInTime): Date => {
    const result = new Date(baseDate);
    let hours = time.hours % 12;
    if (time.period === 'PM') {
      hours += 12;
    }
    result.setHours(hours, time.minutes, 0, 0);
    result.setMilliseconds(0);
    return result;
  }, []);

  const handleStartTrackingSession = useCallback(async () => {
    if (tracking.loading || tracking.isTracking) return;

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

      if (endTime <= startTime) {
        endTime = new Date(endTime.getTime() + 24 * 60 * 60 * 1000);
      }

      const now = new Date();
      if (endTime <= now) {
        Alert.alert(
          'Invalid Time Range',
          'The end time has already passed. Please select a future end time or a later date.'
        );
        return;
      }

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

      const initialLocation = await getCurrentLocation({ showError: true, requestPermission: true });
      if (!initialLocation) {
        Alert.alert(
          'Location Required',
          'Track Me only works when location permission is granted and your current location is available.'
        );
        return;
      }

      const success = await tracking.createSession(
        startTime,
        endTime,
        trackingInterval as TrackingIntervalValue,
        {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
          altitude: typeof initialLocation.coords.altitude === 'number' ? initialLocation.coords.altitude : undefined,
          accuracy: typeof initialLocation.coords.accuracy === 'number' ? initialLocation.coords.accuracy : undefined,
          speed: typeof initialLocation.coords.speed === 'number' ? initialLocation.coords.speed : undefined,
          heading: typeof initialLocation.coords.heading === 'number' ? initialLocation.coords.heading : undefined,
          capturedAt: new Date(initialLocation.timestamp || Date.now()).toISOString(),
        },
      );

      if (success) {
        Alert.alert(
          'Tracking Started',
          `Security tracking is now active from ${formatTime(fromTime)} to ${formatTime(toTime)} with passkey check-ins every ${trackingInterval} minutes.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to start tracking session. Please try again.');
      }
    } catch (error) {
      console.error('[TrackingScreen] Exception while starting tracking:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    }
  }, [tracking, trackingDateLabel, trackingDateValue, fromTime, toTime, trackingInterval, applyTimeToDateLocal, formatTime, getCurrentLocation]);

  const handleStopTrackingSession = useCallback(async () => {
    setEndTrackingPasskey('');
    setShowEndTrackingPasskeyModal(true);
  }, []);

  const handleEndTrackingWithPasskey = useCallback(async () => {
    if (isEndingTracking || endTrackingPasskey.length !== 4) {
      return;
    }

    setIsEndingTracking(true);

    try {
      const success = await tracking.completeTrackingSession({
        passcode: endTrackingPasskey,
        isSafe: true,
      });

      if (success) {
        setShowEndTrackingPasskeyModal(false);
        setEndTrackingPasskey('');
        Alert.alert(
          'Tracking Stopped',
          'Security tracking has been stopped.',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Error', 'Failed to stop tracking session. Please verify your passkey and try again.');
      }
    } finally {
      setIsEndingTracking(false);
    }
  }, [isEndingTracking, endTrackingPasskey, tracking, navigation]);

  const nextCheckIn = tracking.nextTrackingCheckIn;
  const countdown = tracking.trackingCountdown;
  const activeIntervalMin = tracking.session?.checkin_interval_minutes ?? trackingInterval;
  const activeIntervalMs = activeIntervalMin * 60 * 1000;
  const checkinProgressPercent = nextCheckIn
    ? (((activeIntervalMs - (nextCheckIn.getTime() - Date.now())) / activeIntervalMs) * 100)
    : 0;

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={screenStyles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={screenStyles.headerTitle}>Track Me On The Go</Text>
        <View style={screenStyles.headerSpacer} />
      </View>

      <ScrollView
        style={modalStyles.serviceContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
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

        {/* Time Selection */}
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
                <MaterialIcons name="event-note" size={14} color="#2C3E50" /> Scheduled: {tracking.trackingStats.totalScheduled}
              </Text>
              <Text style={[trackingStyles.statusText, { fontSize: 14 }]}> 
                <MaterialIcons name="check-circle" size={14} color="#27ae60" /> Completed: {tracking.trackingStats.success}
              </Text>
              <Text style={[trackingStyles.statusText, { fontSize: 14 }]}> 
                <MaterialIcons name="cancel" size={14} color="#e74c3c" /> Failed: {tracking.trackingStats.totalFailed}
              </Text>
              <Text style={[trackingStyles.statusText, { fontSize: 14 }]}> 
                <MaterialIcons name="pending-actions" size={14} color="#f39c12" /> Remaining: {tracking.trackingStats.remainingScheduled}
              </Text>
              {typeof tracking.trackingStats.expectedTotalUntilEnd === 'number' && (
                <Text style={[trackingStyles.statusText, { fontSize: 14 }]}> 
                  <MaterialIcons name="timeline" size={14} color="#2C3E50" /> Expected until end: {tracking.trackingStats.expectedTotalUntilEnd}
                </Text>
              )}
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
              Security agents will request check-ins every {tracking.session?.checkin_interval_minutes ?? trackingInterval} minutes while tracking is active.
            </Text>
            <View style={trackingStyles.nextCheckInContainer}>
              <Text style={trackingStyles.nextCheckInLabel}>Next check-in in:</Text>
              <Text style={trackingStyles.countdownTimer}>{countdown}</Text>
              <CircularProgress percent={checkinProgressPercent} label="Cycle" />
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
              onPress={() => getCurrentLocation({ showError: true, requestPermission: false })}
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
              onPress={() => getCurrentLocation({ showError: true, requestPermission: false })}
            >
              <MaterialIcons name="place" size={48} color="#2C3E50" />
              <Text style={trackingStyles.mapViewText}>
                {locationPermission ? 'Tap to get location' : 'Tap Start Tracking to grant location permission'}
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
                        checkIn.status === 'failed' ? 'rgba(231, 76, 60, 0.1)' :
                        checkIn.status === 'missed' ? 'rgba(231, 76, 60, 0.1)' : 'rgba(243, 156, 18, 0.1)'
                    }]}>
                      <Text style={[trackingStyles.respondedText, {
                        color: checkIn.status === 'success' ? '#27ae60' :
                          checkIn.status === 'failed' ? '#e74c3c' :
                          checkIn.status === 'missed' ? '#e74c3c' : '#f39c12'
                      }]}>
                        {checkIn.status === 'success' ? 'Responded' :
                          checkIn.status === 'failed' ? 'Failed' :
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

      {showEndTrackingPasskeyModal && (
        <EmergencyPasskeyModal
          visible={true}
          onSubmit={handleEndTrackingWithPasskey}
          title="End Tracking"
          subtitle="Enter passkey to stop this active Track Me session"
          icon="lock"
          iconColor="#2c3e50"
          isEmergency={false}
          enteredPasskey={endTrackingPasskey}
          onPasskeyChange={setEndTrackingPasskey}
          isLoading={isEndingTracking}
          onClose={() => {
            if (isEndingTracking) return;
            setShowEndTrackingPasskeyModal(false);
            setEndTrackingPasskey('');
          }}
        />
      )}
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    color: '#2C3E50',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 32,
  },
});
