/**
 * Book Bodyguard Screen
 *
 * Full-screen version of "Book A Bodyguard" feature.
 * Extracted from BodyguardModal to reduce HomeScreen load.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { DatePickerModal } from '@/components/DatePickerModal';
import formButtonStyles from '@/styles/FormButton.styles';
import { modalStyles } from '@/styles/Modal.styles';
import { useBodyguard } from '@/hooks/useBodyguard';
import { checkSubscriptionAccess } from '@/utils/subscriptionAccess';
import { parseFullDateLabel } from '@/utils/dateFormat';

export default function BookBodyguardScreen() {
  const navigation = useNavigation();
  const bodyguard = useBodyguard();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Check subscription access on mount
  useEffect(() => {
    checkSubscriptionAccess('Book A Bodyguard').then((hasAccess) => {
      if (!hasAccess) {
        navigation.goBack();
      }
    }).catch(() => {});
  }, []);

  const handleDateSelect = (formattedDate: string) => {
    bodyguard.setBodyguardDate(formattedDate);
    setShowDatePicker(false);
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    let newMonth = calendarMonth;
    let newYear = calendarYear;

    if (direction === 'next') {
      newMonth += 1;
      if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      }
    } else {
      newMonth -= 1;
      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }
    }

    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
  };

  const handleBookBodyguard = async () => {
    const success = await bodyguard.bookBodyguard();
    if (success) {
      navigation.goBack();
    }
  };

  const popularCities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata'];

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={screenStyles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={screenStyles.headerTitle}>Book Bodyguard Service</Text>
        <View style={screenStyles.headerSpacer} />
      </View>

      <ScrollView
        style={modalStyles.serviceContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <FontAwesome5 name="user-shield" size={48} color="#2C3E50" style={modalStyles.serviceIcon} />
        <Text style={modalStyles.serviceDescription}>
          Request professional bodyguard services for personal protection and security assistance.
        </Text>

        {/* City Selection */}
        <View style={formButtonStyles.inputSection}>
          <Text style={formButtonStyles.inputLabel}>Enter City</Text>

          <View style={{ position: 'relative' }}>
            <TextInput
              style={[formButtonStyles.textAreaInput, { height: 48, paddingRight: 40 }]}
              placeholder="Type city name"
              placeholderTextColor="#bdc3c7"
              value={bodyguard.selectedCity}
              onChangeText={bodyguard.setSelectedCity}
              autoCapitalize="words"
              autoCorrect={false}
            />
            <MaterialIcons
              name="location-city"
              size={20}
              color="#7f8c8d"
              style={{ position: 'absolute', right: 12, top: 12 }}
            />
          </View>

          {!bodyguard.selectedCity && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, color: '#7f8c8d', marginBottom: 10, fontWeight: '500' }}>
                Quick select:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {popularCities.map((city) => (
                  <TouchableOpacity
                    key={city}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: '#ecf0f1',
                      borderWidth: 1,
                      borderColor: '#bdc3c7'
                    }}
                    onPress={() => bodyguard.setSelectedCity(city)}
                  >
                    <Text style={{ fontSize: 12, color: '#2C3E50' }}>
                      {city}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Reason for Booking */}
        <View style={formButtonStyles.inputSection}>
          <Text style={formButtonStyles.inputLabel}>
            What's the reason for booking a bodyguard? Let us know so we can help you better.
          </Text>
          <TextInput
            style={formButtonStyles.textAreaInput}
            placeholder="Enter your reason here..."
            placeholderTextColor="#bdc3c7"
            value={bodyguard.bodyguardReason}
            onChangeText={bodyguard.setBodyguardReason}
            multiline={true}
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Number of Bodyguards */}
        <View style={formButtonStyles.inputSection}>
          <Text style={formButtonStyles.inputLabel}>How many bodyguards do you need?</Text>
          <View style={formButtonStyles.numberInputContainer}>
            <TouchableOpacity
              style={formButtonStyles.numberButton}
              onPress={() => bodyguard.setBodyguardCount(Math.max(1, bodyguard.bodyguardCount - 1))}
            >
              <MaterialIcons name="remove" size={20} color="#7f8c8d" />
            </TouchableOpacity>
            <Text style={formButtonStyles.numberValue}>{bodyguard.bodyguardCount}</Text>
            <TouchableOpacity
              style={formButtonStyles.numberButton}
              onPress={() => bodyguard.setBodyguardCount(bodyguard.bodyguardCount + 1)}
            >
              <MaterialIcons name="add" size={20} color="#7f8c8d" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Selection */}
        <View style={formButtonStyles.inputSection}>
          <Text style={formButtonStyles.inputLabel}>Enter Date</Text>
          <TouchableOpacity
            style={formButtonStyles.dateInput}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialIcons name="event" size={20} color="#2C3E50" />
            <Text style={formButtonStyles.dateText}>{bodyguard.bodyguardDate}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color="#2C3E50" />
          </TouchableOpacity>
        </View>

        {/* Confirm Booking Button */}
        <TouchableOpacity
          style={[formButtonStyles.actionButton, formButtonStyles.bookButton, bodyguard.isLoading && { opacity: 0.7 }]}
          onPress={handleBookBodyguard}
          disabled={bodyguard.isLoading}
        >
          {bodyguard.isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={formButtonStyles.actionButtonText}>Confirm Booking</Text>
          )}
        </TouchableOpacity>

        <Text style={modalStyles.serviceNote}>
          All bodyguards are licensed, insured, and undergo comprehensive background checks.
        </Text>

        <Text style={modalStyles.pricingNote}>
          * Rates starting at ₹3500 for 8 hour shift. Special offers for bulk booking and events. Contact us for details.
        </Text>
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        title="Select Date"
        selectedDate={bodyguard.bodyguardDate}
        currentMonth={calendarMonth}
        currentYear={calendarYear}
        onDateSelect={handleDateSelect}
        onClose={() => setShowDatePicker(false)}
        onMonthChange={handleMonthChange}
        allowPastDates={false}
        showTodayButton={true}
        styles={modalStyles}
      />
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
