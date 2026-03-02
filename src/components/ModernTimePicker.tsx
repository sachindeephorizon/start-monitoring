import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { CheckInTime } from '../types/checkin';

interface ModernTimePickerProps {
  visible: boolean;
  hours: number;
  minutes: number;
  period: 'AM' | 'PM';
  title?: string;
  onTimeChange: (hours: number, minutes: number, period: 'AM' | 'PM') => void;
  onClose: () => void;
}

export const ModernTimePicker: React.FC<ModernTimePickerProps> = ({
  visible,
  hours,
  minutes,
  period,
  title = 'Select Time',
  onTimeChange,
  onClose,
}) => {
  // Convert CheckInTime to Date object for the picker
  const timeToDate = (hours: number, minutes: number, period: 'AM' | 'PM'): Date => {
    const date = new Date();
    let hour24 = hours;
    
    if (period === 'PM' && hours !== 12) {
      hour24 = hours + 12;
    } else if (period === 'AM' && hours === 12) {
      hour24 = 0;
    }
    
    date.setHours(hour24, minutes, 0, 0);
    return date;
  };

  // Convert Date object back to CheckInTime format
  const dateToTime = (date: Date): { hours: number; minutes: number; period: 'AM' | 'PM' } => {
    const hour24 = date.getHours();
    const mins = date.getMinutes();
    
    let hour12 = hour24;
    const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
    
    if (hour24 === 0) {
      hour12 = 12;
    } else if (hour24 > 12) {
      hour12 = hour24 - 12;
    }
    
    return { hours: hour12, minutes: mins, period };
  };

  const [selectedDate, setSelectedDate] = useState<Date>(() => 
    timeToDate(hours, minutes, period)
  );

  // Update selectedDate when props change
  useEffect(() => {
    if (visible) {
      setSelectedDate(timeToDate(hours, minutes, period));
    }
  }, [visible, hours, minutes, period]);

  const handleConfirm = (date: Date) => {
    const { hours: newHours, minutes: newMinutes, period: newPeriod } = dateToTime(date);
    onTimeChange(newHours, newMinutes, newPeriod);
    onClose();
  };

  const IOSHeader: React.FC<{ label: string }> = ({ label }) => {
    return (
      <View style={styles.iosHeader}>
        <Text style={styles.iosHeaderText}>{label}</Text>
      </View>
    );
  };

  return (
    <DateTimePickerModal
      isVisible={visible}
      mode="time"
      date={selectedDate}
      onConfirm={handleConfirm}
      onCancel={onClose}
      is24Hour={false}
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      themeVariant="dark"
      textColor="#ffffff"
      accentColor="#CC0022"
      pickerStyleIOS={{
        backgroundColor: '#1a1a1a',
      }}
      customHeaderIOS={IOSHeader}
      cancelTextIOS="Cancel"
      confirmTextIOS="Confirm"
      // 🔥 iOS FIX: Proper modal presentation to prevent stacking issues
      modalStyleIOS={{
        margin: 0,
      }}
      // 🔥 iOS FIX: Ensure proper backdrop handling
      backdropStyleIOS={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    />
  );
};

const styles = StyleSheet.create({
  iosHeader: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1a1a1a',
  },
  iosHeaderText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});


