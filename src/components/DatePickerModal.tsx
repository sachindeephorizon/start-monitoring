import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface DatePickerModalProps {
  visible: boolean;
  title?: string;
  selectedDate: string;
  currentMonth: number;
  currentYear: number;
  onDateSelect: (formattedDate: string) => void;
  onClose: () => void;
  onMonthChange: (direction: 'prev' | 'next') => void;
  showTodayButton?: boolean;
  allowPastDates?: boolean;
  styles: any; // Accept styles from parent to maintain styling consistency
}

export const DatePickerModal: React.FC<DatePickerModalProps> = ({
  visible,
  title = 'Select Date',
  selectedDate,
  currentMonth,
  currentYear,
  onDateSelect,
  onClose,
  onMonthChange,
  showTodayButton = true,
  allowPastDates = false,
  styles,
}) => {
  const today = new Date();
  
  // Generate calendar days for selected month/year
  const firstDay = new Date(currentYear, currentMonth, 1);
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - firstDay.getDay());
  
  const calendarDays: Date[] = [];
  const totalDays = 42; // 6 weeks
  
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    calendarDays.push(date);
  }
  
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  const formatSelectedDate = (date: Date) => {
    const fullDayNames = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday', 
      'Thursday', 'Friday', 'Saturday'
    ];
    const dayName = fullDayNames[date.getDay()];
    const month = monthNames[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${month} ${day}, ${year}`;
  };

  const handleTodayPress = () => {
    const formattedDate = formatSelectedDate(today);
    onDateSelect(formattedDate);
  };

  return (
    <Modal
      animationType="none"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
      hardwareAccelerated={true}
      statusBarTranslucent={true}
      {...(Platform.OS === 'ios' && {
        presentationStyle: 'overFullScreen',
      })}
    >
      <View style={[styles.datePickerOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.6)' }]}>
        <View style={[styles.datePickerModal, { height: '80%' }]}>
          <View style={styles.datePickerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialIcons name="calendar-today" size={24} color="#2c3e50" />
              <Text style={styles.datePickerTitle}>{title}</Text>
            </View>
            <TouchableOpacity 
              onPress={onClose}
              style={styles.closeButton}
            >
              <MaterialIcons name="close" size={24} color="#7f8c8d" />
            </TouchableOpacity>
          </View>

          <View style={styles.datePickerContent}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity 
                onPress={() => onMonthChange('prev')}
                style={styles.monthNavButton}
              >
                <MaterialIcons name="chevron-left" size={24} color="#7f8c8d" />
              </TouchableOpacity>
              
              <Text style={styles.monthYearText}>
                {monthNames[currentMonth]} {currentYear}
              </Text>
              
              <TouchableOpacity 
                onPress={() => onMonthChange('next')}
                style={styles.monthNavButton}
              >
                <MaterialIcons name="chevron-right" size={24} color="#7f8c8d" />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              <View style={styles.dayNamesRow}>
                {dayNames.map(day => (
                  <Text key={day} style={styles.dayName}>{day}</Text>
                ))}
              </View>
              
              {Array.from({ length: 6 }).map((_, weekIndex) => (
                <View key={weekIndex} style={styles.calendarWeek}>
                  {calendarDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((date, dayIndex) => {
                    const isCurrentMonth = date.getMonth() === currentMonth;
                    const isToday = date.toDateString() === today.toDateString();
                    
                    // Extract date from formatted string and compare properly
                    let isSelected = false;
                    if (selectedDate && isCurrentMonth) {
                      const formattedDateForThisDate = formatSelectedDate(date);
                      isSelected = selectedDate === formattedDateForThisDate;
                    }
                    
                    const isPast = date < today && !isToday;
                    const isDisabled = !isCurrentMonth || (isPast && !allowPastDates);
                    
                    return (
                      <TouchableOpacity
                        key={dayIndex}
                        style={[
                          styles.calendarDay,
                          !isCurrentMonth && styles.otherMonthDay,
                          isToday && styles.todayDay,
                          isSelected && styles.enhancedCalendarDaySelected,
                          isPast && styles.pastDay,
                        ]}
                        onPress={() => {
                          if (!isDisabled) {
                            const formattedDate = formatSelectedDate(date);
                            onDateSelect(formattedDate);
                          }
                        }}
                        disabled={isDisabled}
                      >
                        <Text style={[
                          styles.calendarDayText,
                          !isCurrentMonth && styles.otherMonthDayText,
                          isToday && styles.todayDayText,
                          isSelected && styles.enhancedCalendarDayTextSelected,
                          isPast && styles.pastDayText
                        ]}>
                          {date.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Today Button */}
            {showTodayButton && (
              <TouchableOpacity
                style={{ 
                  backgroundColor: '#3498db', 
                  padding: 12, 
                  borderRadius: 8, 
                  marginVertical: 16, 
                  marginHorizontal: 20, 
                  alignItems: 'center' 
                }}
                onPress={handleTodayPress}
              >
                <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
                  Select Today
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DatePickerModal;
