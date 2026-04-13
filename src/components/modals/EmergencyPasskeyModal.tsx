import React, { useEffect, useState, useRef } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  Animated,
  ScrollView,
  AppState
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { passkeyModalStyles } from '@/styles/PasskeyModal.styles';

export interface EmergencyPasskeyModalProps {
  visible: boolean;
  onSubmit: () => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  iconColor?: string;
  overlayColor?: string;
  modalStyle?: any;
  titleStyle?: any;
  isEmergency?: boolean;
  emergencyCountdown?: number;
  emergencyDeadlineMs?: number;
  enteredPasskey: string;
  onPasskeyChange: (passkey: string) => void;
  isLoading?: boolean;
  shakeAnimation?: Animated.Value;
  helperText?: string;
  isSubmitDisabled?: boolean;
}

export const EmergencyPasskeyModal: React.FC<EmergencyPasskeyModalProps> = ({
  visible,
  onSubmit,
  onClose,
  title = "Security Check-In",
  subtitle = "Verification required",
  icon = "security",
  iconColor = "#2c3e50",
  overlayColor,
  modalStyle,
  titleStyle,
  isEmergency = false,
  emergencyCountdown,
  emergencyDeadlineMs,
  enteredPasskey,
  onPasskeyChange,
  isLoading = false,
  shakeAnimation,
  helperText,
  isSubmitDisabled = false,
}) => {
  // 🔥 FOREGROUND ONLY: Simple, reliable countdown that always updates in foreground
  const [displaySeconds, setDisplaySeconds] = useState(10);
  const deadlineRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastDisplayedSecondsRef = useRef<number>(10);
  const modalVisibleRef = useRef(false);
  
  // Stable ref for the countdown interval tick so the interval closure
  // always reads the latest deadline without needing to be recreated.
  const startCountdownInterval = useRef(() => {
    if (intervalRef.current) return; // already running

    intervalRef.current = setInterval(() => {
      if (AppState.currentState !== 'active') return;

      if (!deadlineRef.current) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));

      if (remaining !== lastDisplayedSecondsRef.current) {
        lastDisplayedSecondsRef.current = remaining;
        setDisplaySeconds(remaining);
      }

      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 100);
  }).current;

  // Initialize deadline when emergency modal opens; keep interval alive across re-renders.
  useEffect(() => {
    if (!visible || !isEmergency) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      deadlineRef.current = null;
      setDisplaySeconds(10);
      lastDisplayedSecondsRef.current = 10;
      modalVisibleRef.current = false;
      return;
    }

    const wasVisible = modalVisibleRef.current;
    modalVisibleRef.current = true;

    // Set / update the deadline
    if (!wasVisible) {
      // First open — pick the best deadline source
      if (emergencyDeadlineMs && emergencyDeadlineMs > Date.now()) {
        deadlineRef.current = emergencyDeadlineMs;
      } else if (emergencyCountdown !== undefined && emergencyCountdown > 0) {
        deadlineRef.current = Date.now() + emergencyCountdown * 1000;
      } else {
        deadlineRef.current = Date.now() + 10 * 1000;
      }
    } else if (
      emergencyDeadlineMs &&
      emergencyDeadlineMs > Date.now() &&
      emergencyDeadlineMs !== deadlineRef.current
    ) {
      // Already open but deadline changed (e.g. server hydration) — update it
      deadlineRef.current = emergencyDeadlineMs;
    }

    // Sync display to current deadline
    const initialSeconds = Math.max(0, Math.ceil((deadlineRef.current! - Date.now()) / 1000));
    setDisplaySeconds(initialSeconds);
    lastDisplayedSecondsRef.current = initialSeconds;

    // Ensure the interval is running — this is the key fix: the effect cleanup
    // from a previous run may have cleared the interval, so always restart it.
    startCountdownInterval();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // CRITICAL: Do NOT include `emergencyCountdown` in deps.
    // The flow provider updates it every 100ms (10→9→8…) which would re-trigger
    // this effect on every tick. The modal drives its own countdown from
    // `emergencyDeadlineMs` (absolute timestamp); `emergencyCountdown` is only
    // used as a fallback for the initial setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isEmergency, emergencyDeadlineMs, startCountdownInterval]);

  const handleNumberPress = (number: number) => {
    if (enteredPasskey.length < 4) {
      onPasskeyChange(enteredPasskey + number.toString());
    }
  };

  const handleDeletePress = () => {
    onPasskeyChange(enteredPasskey.slice(0, -1));
  };

  const overlayStyle = overlayColor 
    ? [passkeyModalStyles.passkeyOverlay, { backgroundColor: overlayColor }]
    : passkeyModalStyles.passkeyOverlay;

  const modalViewStyle = [
    passkeyModalStyles.passkeyModal,
    modalStyle,
    shakeAnimation && {
      transform: [{ translateX: shakeAnimation }]
    }
  ];

  const finalTitleStyle = titleStyle ? [passkeyModalStyles.passkeyTitle, titleStyle] : passkeyModalStyles.passkeyTitle;
  const keypadRows: Array<Array<number | null>> = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [null, 0, null],
  ];
  const submitDisabled = enteredPasskey.length !== 4 || isLoading || isSubmitDisabled;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={isEmergency ? () => {} : onClose}
      presentationStyle="overFullScreen"
      // 🔥 FOREGROUND ONLY: Prevent modal from being backgrounded
      hardwareAccelerated={true}
    >
      <SafeAreaView style={overlayStyle} edges={['top', 'right', 'bottom', 'left']}>
        <View style={{ flex: 1 }}>
          <Animated.View style={modalViewStyle}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={true}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
            >
            <View style={passkeyModalStyles.passkeyHeader}>
              <MaterialIcons name={icon} size={48} color={iconColor} />
              <Text style={finalTitleStyle}>{title}</Text>
              <Text style={passkeyModalStyles.passkeySubtitle}>{subtitle}</Text>
            </View>

            <View style={passkeyModalStyles.passkeyContent}>
            {isEmergency && (
              <View style={passkeyModalStyles.emergencyCountdownContainer}>
                <Text style={passkeyModalStyles.emergencyCountdownText} key={`countdown-text-${displaySeconds}`}>
                  {displaySeconds}
                </Text>
                <Text style={passkeyModalStyles.emergencyCountdownLabel}>
                  seconds to cancel
                </Text>
              </View>
            )}

            <Text style={passkeyModalStyles.passkeyLabel}>
              {isEmergency 
                ? "Enter your security passkey to cancel emergency:" 
                : "Enter your security passkey:"
              }
            </Text>
            
            <View style={passkeyModalStyles.passkeyInputContainer}>
              <View
                style={passkeyModalStyles.passkeyDisplay}
                accessible={true}
                accessibilityLabel={`Passkey entry, ${enteredPasskey.length} of 4 digits entered`}
                accessibilityRole="text"
              >
                {[0, 1, 2, 3].map((index) => (
                  isEmergency ? (
                    <View 
                      key={index} 
                      style={[
                        passkeyModalStyles.passkeyDot, 
                        enteredPasskey.length > index && passkeyModalStyles.passkeyDotFilled
                      ]} 
                    />
                  ) : (
                    <View key={index} style={passkeyModalStyles.passkeyDigit}>
                      <Text style={passkeyModalStyles.passkeyDigitText}>
                        {enteredPasskey[index] ? '●' : ''}
                      </Text>
                    </View>
                  )
                ))}
              </View>
            </View>

            <View style={passkeyModalStyles.passkeyKeypad}>
              {keypadRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={passkeyModalStyles.passkeyKeypadRow}>
                  {row.map((number, columnIndex) => {
                    if (number === null) {
                      return <View key={`spacer-${rowIndex}-${columnIndex}`} style={passkeyModalStyles.passkeyKeySpacer} />;
                    }

                    return (
                      <TouchableOpacity
                        key={number}
                        style={isEmergency ? passkeyModalStyles.passkeyKeyButton : passkeyModalStyles.passkeyKey}
                        onPress={() => handleNumberPress(number)}
                        accessible={true}
                        accessibilityLabel={`Number ${number}`}
                        accessibilityRole="button"
                      >
                        <Text style={passkeyModalStyles.passkeyKeyText}>{number}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={passkeyModalStyles.passkeyActions}>
              <TouchableOpacity
                style={passkeyModalStyles.passkeyDeleteButton}
                onPress={handleDeletePress}
                accessible={true}
                accessibilityLabel="Delete last digit"
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="backspace" size={24} color="#7f8c8d" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  passkeyModalStyles.passkeySubmitButton,
                  enteredPasskey.length === 4 && !isSubmitDisabled && passkeyModalStyles.passkeySubmitButtonActive,
                  isEmergency && { backgroundColor: '#CC0022' }
                ]}
                onPress={onSubmit}
                disabled={submitDisabled}
                accessible={true}
                accessibilityLabel={isEmergency ? "Cancel emergency" : "Verify passkey"}
                accessibilityRole="button"
                accessibilityState={{ disabled: submitDisabled }}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={passkeyModalStyles.passkeySubmitText}>
                    {isEmergency ? "CANCEL EMERGENCY" : "Verify"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={passkeyModalStyles.passkeyDemo}>
              {helperText ? (
                <Text style={passkeyModalStyles.passkeyTimeout}>
                  {helperText}
                </Text>
              ) : null}
              <Text style={[
                passkeyModalStyles.passkeyTimeout,
                isEmergency && { color: '#CC0022' }
              ]}>
                {isEmergency
                  ? "Emergency services will be contacted automatically"
                  : "Auto-timeout in 30 seconds"
                }
              </Text>
            </View>
            </View>
            </ScrollView>
          </Animated.View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

export default EmergencyPasskeyModal;
