/**
 * Assign Safety Check Screen (Family/Group Head)
 *
 * Form screen for the family owner to schedule a safety check for
 * a selected family member. Reuses the same UI primitives as
 * ScheduleCheckInScreen (DatePickerModal, ModernTimePicker, styles)
 * but submits via POST /v1/schedule-checkin/assign.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Alert,
  ScrollView,
  TextInput,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { DatePickerModal } from '@/components/DatePickerModal';
import { ModernTimePicker } from '@/components/ModernTimePicker';
import { styles } from '@/components/modals/CheckInModal.styles';
import { modalStyles } from '@/styles/Modal.styles';
import { CheckInTime, CheckInFrequency } from '@/types/checkin';
import { formatFullDateLabel, parseFullDateLabel } from '@/utils/dateFormat';
import { useSubscription, FamilyMember } from '@/hooks/useSubscription';
import { useAssignedCheckIns } from '@/hooks/useAssignedCheckIns';
import type { CheckinFrequency } from '@/api/schedule-checking';

const formatTime = (time: CheckInTime): string => {
  const hours = time.hours === 0 ? 12 : time.hours > 12 ? time.hours - 12 : time.hours;
  const minutes = time.minutes.toString().padStart(2, '0');
  return `${hours}:${minutes} ${time.period}`;
};

const toApiFrequency = (frequency: CheckInFrequency): CheckinFrequency => {
  switch (frequency) {
    case 'Daily': return 'DAILY';
    case 'Weekly': return 'WEEKLY';
    case 'One-time':
    default: return 'ONE_TIME';
  }
};

const parseDateTime = (time: CheckInTime, date: string): Date | null => {
  try {
    if (!date || !time) return null;
    const parsed = parseFullDateLabel(date);
    if (isNaN(parsed.getTime())) return null;
    let hours = time.hours;
    if (time.period === 'PM' && hours !== 12) hours += 12;
    if (time.period === 'AM' && hours === 12) hours = 0;
    const out = new Date(parsed);
    out.setHours(hours, time.minutes, 0, 0);
    return out;
  } catch {
    return null;
  }
};

export default function AssignSafetyCheckScreen() {
  const navigation = useNavigation<any>();

  const { familyMembers, isFamilyPlanOwner } = useSubscription();
  const { assign, isAssigning } = useAssignedCheckIns();

  // Assignable members: ACTIVE MEMBERs with a userId, excluding the owner (self).
  const assignable: FamilyMember[] = useMemo(() => {
    return (familyMembers || []).filter(
      (m) =>
        m.type === 'MEMBER' &&
        m.status === 'ACTIVE' &&
        m.role !== 'OWNER' &&
        !!(m.userId || m.memberUserId),
    );
  }, [familyMembers]);

  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const [checkInDate, setCheckInDate] = useState<string>(() => formatFullDateLabel(new Date()));
  const [checkInTime, setCheckInTime] = useState<CheckInTime>({ hours: 12, minutes: 0, period: 'PM' });
  const [checkInFrequency, setCheckInFrequency] = useState<CheckInFrequency>('One-time');
  const [remarks, setRemarks] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());

  // Auto-select first assignable if nothing selected yet
  useEffect(() => {
    if (!selectedMember && assignable.length > 0) {
      setSelectedMember(assignable[0]);
    }
  }, [assignable, selectedMember]);

  const handleDateSelect = useCallback((formatted: string) => {
    setCheckInDate(formatted);
    setShowDatePicker(false);
  }, []);

  const handleMonthChange = useCallback((direction: 'prev' | 'next') => {
    setCalendarMonth((prev) => {
      if (direction === 'next') {
        if (prev === 11) { setCalendarYear((y) => y + 1); return 0; }
        return prev + 1;
      }
      if (prev === 0) { setCalendarYear((y) => y - 1); return 11; }
      return prev - 1;
    });
  }, []);

  const handleTimeChange = (hours: number, minutes: number, period: 'AM' | 'PM') => {
    setCheckInTime({ hours, minutes, period });
    setShowTimePicker(false);
  };

  const handleSubmit = async () => {
    if (!selectedMember) {
      Alert.alert('Select Member', 'Please choose the family member to assign this check to.');
      return;
    }
    const targetUserId = selectedMember.userId || selectedMember.memberUserId;
    if (!targetUserId) {
      Alert.alert('Invalid Member', 'This member cannot be assigned a check-in.');
      return;
    }

    const scheduledAt = parseDateTime(checkInTime, checkInDate);
    if (!scheduledAt) {
      Alert.alert('Invalid Date/Time', 'Please select a valid date and time.');
      return;
    }
    if (scheduledAt <= new Date()) {
      Alert.alert('Invalid Time', 'Scheduled time must be in the future.');
      return;
    }

    const result = await assign({
      targetUserId,
      startAt: scheduledAt.toISOString(),
      frequency: toApiFrequency(checkInFrequency),
      remarks: remarks.trim() || undefined,
    });

    if (result) {
      Alert.alert(
        'Safety Check Assigned',
        `A ${checkInFrequency.toLowerCase()} safety check has been assigned to ${selectedMember.name || selectedMember.phone}.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  };

  // Guard (defence-in-depth; entry is gated in the sidebar too)
  if (!isFamilyPlanOwner) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'bottom']}>
        <View style={screenStyles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={screenStyles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={screenStyles.headerTitle}>Assign Safety Check</Text>
          <View style={screenStyles.headerSpacer} />
        </View>
        <View style={screenStyles.emptyWrap}>
          <MaterialIcons name="lock" size={56} color="#bdc3c7" />
          <Text style={screenStyles.emptyTitle}>Only for Family Owners</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'bottom']}>
      <View style={screenStyles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={screenStyles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={screenStyles.headerTitle}>Assign Safety Check</Text>
        <View style={screenStyles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scheduleContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.scheduleDescription}>
          Schedule a safety check for a family member. They'll be prompted to confirm they're safe
          at the scheduled time.
        </Text>

        {/* Member selector */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Family Member</Text>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => {
              if (assignable.length === 0) {
                Alert.alert(
                  'No Members',
                  'You have no active family members to assign a safety check to. Add members from the Family screen first.',
                );
                return;
              }
              setShowMemberPicker(true);
            }}
          >
            <MaterialIcons name="person" size={20} color="#2C3E50" />
            <Text style={styles.dateText}>
              {selectedMember
                ? `${selectedMember.name || 'Member'} • ${selectedMember.phone}`
                : assignable.length === 0
                  ? 'No active members available'
                  : 'Select a member'}
            </Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color="#2C3E50" />
          </TouchableOpacity>
        </View>

        {/* Date */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Date</Text>
          <TouchableOpacity
            style={styles.dateInput}
            onPress={() => {
              const parsed = parseFullDateLabel(checkInDate);
              setCalendarMonth(parsed.getMonth());
              setCalendarYear(parsed.getFullYear());
              setShowDatePicker(true);
            }}
          >
            <MaterialIcons name="event" size={20} color="#2C3E50" />
            <Text style={styles.dateText}>{checkInDate}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color="#2C3E50" />
          </TouchableOpacity>
        </View>

        {/* Time */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Time</Text>
          <TouchableOpacity style={styles.timeInput} onPress={() => setShowTimePicker(true)}>
            <MaterialIcons name="access-time" size={20} color="#7f8c8d" />
            <Text style={styles.timeText}>{formatTime(checkInTime)}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={20} color="#7f8c8d" />
          </TouchableOpacity>
        </View>

        {/* Frequency */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Frequency</Text>
          <View style={styles.frequencyOptions}>
            {(['One-time', 'Daily', 'Weekly'] as const).map((frequency) => (
              <TouchableOpacity
                key={frequency}
                style={styles.frequencyOption}
                onPress={() => setCheckInFrequency(frequency)}
              >
                <View style={[
                  styles.radioButton,
                  checkInFrequency === frequency && styles.radioButtonSelected,
                ]}>
                  {checkInFrequency === frequency && <View style={styles.radioButtonInner} />}
                </View>
                <Text style={styles.frequencyText}>{frequency}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Remarks */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Remarks (optional)</Text>
          <TextInput
            style={[styles.notesInput, { padding: 12, textAlignVertical: 'top', minHeight: 80 }]}
            multiline
            numberOfLines={4}
            placeholder="e.g., Morning safety check"
            placeholderTextColor="#95a5a6"
            value={remarks}
            onChangeText={setRemarks}
            autoCapitalize="sentences"
          />
        </View>

        <TouchableOpacity
          style={[
            styles.scheduleCheckButton,
            (isAssigning || !selectedMember) && styles.scheduleCheckButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isAssigning || !selectedMember}
        >
          <Text style={styles.scheduleCheckButtonText}>
            {isAssigning ? 'Assigning...' : 'Assign Safety Check'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date picker */}
      <DatePickerModal
        visible={showDatePicker}
        title="Select Date"
        selectedDate={checkInDate}
        currentMonth={calendarMonth}
        currentYear={calendarYear}
        onDateSelect={handleDateSelect}
        onClose={() => setShowDatePicker(false)}
        onMonthChange={handleMonthChange}
        allowPastDates={false}
        showTodayButton={true}
        styles={modalStyles}
      />

      {/* Time picker */}
      <ModernTimePicker
        visible={showTimePicker}
        hours={checkInTime.hours}
        minutes={checkInTime.minutes}
        period={checkInTime.period}
        title="Select Time"
        onTimeChange={handleTimeChange}
        onClose={() => setShowTimePicker(false)}
      />

      {/* Member picker modal */}
      <Modal
        visible={showMemberPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMemberPicker(false)}
      >
        <TouchableOpacity
          style={pickerStyles.backdrop}
          activeOpacity={1}
          onPress={() => setShowMemberPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} style={pickerStyles.sheet}>
            <View style={pickerStyles.header}>
              <Text style={pickerStyles.title}>Select Family Member</Text>
              <TouchableOpacity onPress={() => setShowMemberPicker(false)}>
                <MaterialIcons name="close" size={24} color="#7f8c8d" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={assignable}
              keyExtractor={(m) => m.id}
              ItemSeparatorComponent={() => <View style={pickerStyles.separator} />}
              renderItem={({ item }) => {
                const selected = selectedMember?.id === item.id;
                return (
                  <TouchableOpacity
                    style={pickerStyles.row}
                    onPress={() => {
                      setSelectedMember(item);
                      setShowMemberPicker(false);
                    }}
                  >
                    <MaterialIcons
                      name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                      size={22}
                      color={selected ? '#4BA8FF' : '#95a5a6'}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={pickerStyles.name}>{item.name || 'Member'}</Text>
                      <Text style={pickerStyles.phone}>{item.phone}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={pickerStyles.emptyText}>No assignable members.</Text>
              }
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '500',
    color: '#2C3E50',
    textAlign: 'center',
  },
  headerSpacer: { width: 32 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { marginTop: 12, fontSize: 18, fontWeight: '600', color: '#2C3E50' },
});

const pickerStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#2C3E50' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  separator: { height: 1, backgroundColor: '#ECEFF1', marginLeft: 16 },
  name: { fontSize: 16, color: '#2C3E50', fontWeight: '500' },
  phone: { fontSize: 13, color: '#7f8c8d', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#95a5a6', padding: 24 },
});
