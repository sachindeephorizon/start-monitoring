import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './EmergencyButton.styles';

interface EmergencyButtonProps {
  onPressIn: () => void;
  onPressOut: () => void;
  isEmergencyActive?: boolean; // Prop to track emergency state
}

const EmergencyButton: React.FC<EmergencyButtonProps> = ({
  onPressIn: handlePressIn,
  onPressOut: handlePressOut,
  isEmergencyActive = false,
}) => {
  const insets = useSafeAreaInsets();

  // Animation for press progress
  const pressProgress = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timer on unmount to prevent firing on unmounted component
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    };
  }, []);

  // Reset progress bar when emergency is cancelled
  useEffect(() => {
    if (!isEmergencyActive) {
      // Emergency was cancelled - reset the progress bar
      if (pressTimerRef.current) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
      Animated.timing(pressProgress, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
  }, [isEmergencyActive, pressProgress, scaleAnim]);

  const onPressIn = () => {
    // Start progress animation
    Animated.timing(pressProgress, {
      toValue: 1,
      duration: 3000, // 3 seconds
      useNativeDriver: false,
    }).start();
    
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
    
    // Set timer to trigger after 3 seconds
    // Once triggered, it will fire even if user releases
    pressTimerRef.current = setTimeout(() => {
      handlePressIn();
      // Clear the timer reference after triggering
      pressTimerRef.current = null;
    }, 3000);
  };

  const onPressOut = () => {
    // Don't clear timer - let it complete even if user releases
    // The timer will fire after 3 seconds regardless of release
    if (pressTimerRef.current) {
      // Timer still running - user released early, but timer continues
      // Keep the progress bar visible to show timer is still counting
      // Only reset the scale animation
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      // Timer already fired - emergency was triggered, reset everything
      Animated.timing(pressProgress, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }
    handlePressOut();
  };

  const progressWidth = pressProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.emergencyButtonContainer,
        {
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      <TouchableOpacity
        style={styles.newEmergencyButton}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.85}
        accessible={true}
        accessibilityLabel="Emergency button. Press and hold for 3 seconds to request assistance"
        accessibilityRole="button"
        accessibilityHint="Press and hold for 3 seconds to trigger emergency response"
      >
        {/* Progress Bar Background */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: '#c0392b',
              width: progressWidth,
              borderRadius: 30,
            }
          ]}
        />

        <View style={styles.emergencyIconContainer}>
          <MaterialIcons name="warning" size={20} color="#ffffff" />
        </View>
        <View style={styles.emergencyTextContainer}>
          <Text style={styles.emergencyMainText}>EMERGENCY</Text>
          <Text style={styles.emergencySubText}>Press and hold for assistance</Text>
        </View>
        <View style={styles.emergencyArrow}>
          <MaterialIcons name="keyboard-arrow-right" size={20} color="#ffffff" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default EmergencyButton;

