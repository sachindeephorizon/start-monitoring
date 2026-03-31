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
}) => {
  // 🔥 FOREGROUND ONLY: Simple, reliable countdown that always updates in foreground
  const [displaySeconds, setDisplaySeconds] = useState(10);
  const deadlineRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDisplayedSecondsRef = useRef<number>(10);
  const modalVisibleRef = useRef(false);
  
  // Initialize countdown when emergency modal opens
  useEffect(() => {
    // Track modal visibility to prevent re-initialization
    const wasVisible = modalVisibleRef.current;
    modalVisibleRef.current = visible && isEmergency;
    
    if (!visible || !isEmergency) {
      // Cleanup when modal closes
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      deadlineRef.current = null;
      setDisplaySeconds(10);
      lastDisplayedSecondsRef.current = 10;
      return;
    }
    
    // Only initialize once when modal first opens
    if (wasVisible) {
      // Modal already open, just update deadline if it changed
      if (emergencyDeadlineMs && emergencyDeadlineMs > Date.now() && emergencyDeadlineMs !== deadlineRef.current) {
        deadlineRef.current = emergencyDeadlineMs;
        const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
        setDisplaySeconds(remaining);
        lastDisplayedSecondsRef.current = remaining;
        console.log('[PasskeyModal] Deadline updated:', emergencyDeadlineMs, 'Remaining:', remaining);
      }
      return;
    }
    
    // 🔥 FOREGROUND ONLY: Set deadline when emergency modal first opens
    if (emergencyDeadlineMs && emergencyDeadlineMs > Date.now()) {
      deadlineRef.current = emergencyDeadlineMs;
      console.log('[PasskeyModal] Using provided deadline:', emergencyDeadlineMs, 'Current time:', Date.now());
    } else if (emergencyCountdown !== undefined && emergencyCountdown > 0) {
      deadlineRef.current = Date.now() + (emergencyCountdown * 1000);
      console.log('[PasskeyModal] Calculated deadline from countdown:', deadlineRef.current);
    } else {
      deadlineRef.current = Date.now() + (10 * 1000); // Default 10 seconds
      console.log('[PasskeyModal] Using default 10 second deadline:', deadlineRef.current);
    }
    
    // Set initial display value
    const initialSeconds = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
    setDisplaySeconds(initialSeconds);
    lastDisplayedSecondsRef.current = initialSeconds;
    console.log('[PasskeyModal] Initial countdown seconds:', initialSeconds);
    
    // 🔥 FOREGROUND ONLY: Start countdown interval - updates every 100ms
    // This ensures smooth countdown and immediate UI updates in foreground
    if (!intervalRef.current) {
      console.log('[PasskeyModal] Starting countdown interval with deadline:', deadlineRef.current);
      intervalRef.current = setInterval(() => {
        // Only update when app is in foreground
        if (AppState.currentState !== 'active') {
          return;
        }
        
        if (!deadlineRef.current) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return;
        }
        
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((deadlineRef.current - now) / 1000));
        
        // Update display only when seconds value changes
        if (remaining !== lastDisplayedSecondsRef.current) {
          lastDisplayedSecondsRef.current = remaining;
          setDisplaySeconds(remaining);
          console.log('[PasskeyModal] Countdown updated:', remaining, 'seconds remaining');
        }
        
        // Stop when expired
        if (remaining <= 0) {
          console.log('[PasskeyModal] Countdown expired');
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      }, 100); // Update every 100ms for smooth countdown
    }

    // Cleanup on unmount — prevent interval from firing on unmounted component
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    // CRITICAL: Do NOT include `emergencyCountdown` in deps.
    // HomeScreen updates it every 100ms (10→9→8…), which re-triggers this effect,
    // clears the internal interval via cleanup, then returns early (wasVisible=true)
    // without restarting it → countdown freezes at 9.
    // The modal drives its own countdown from `emergencyDeadlineMs` (absolute timestamp).
    // `emergencyCountdown` is only used as a fallback for initial setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isEmergency, emergencyDeadlineMs]);

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
                  enteredPasskey.length === 4 && passkeyModalStyles.passkeySubmitButtonActive,
                  isEmergency && { backgroundColor: '#CC0022' }
                ]}
                onPress={onSubmit}
                disabled={enteredPasskey.length !== 4 || isLoading}
                accessible={true}
                accessibilityLabel={isEmergency ? "Cancel emergency" : "Verify passkey"}
                accessibilityRole="button"
                accessibilityState={{ disabled: enteredPasskey.length !== 4 || isLoading }}
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
