import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './StartMonitoringButton.styles';

interface StartMonitoringButtonProps {
  onPress: () => void;
  isMonitoringActive?: boolean;
  isDisabled?: boolean;
  showNewBadge?: boolean;
}

const StartMonitoringButton: React.FC<StartMonitoringButtonProps> = ({
  onPress,
  isMonitoringActive = false,
  isDisabled = false,
  showNewBadge = true,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View
      style={[
        styles.monitoringButtonContainer,
        { transform: [{ scale: scaleAnim }] },
      ]}
    >
      <TouchableOpacity
        style={styles.newMonitoringButton}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled || isMonitoringActive}
        activeOpacity={0.85}
        accessible={true}
        accessibilityLabel="Start Monitoring. AI watches over you during trips"
        accessibilityRole="button"
        accessibilityHint="Tap to start AI trip monitoring"
      >
        <View style={styles.monitoringIconContainer}>
          <MaterialIcons name="auto-awesome" size={22} color="#ffffff" />
        </View>
        <View style={styles.monitoringTextContainer}>
          <View style={styles.monitoringTitleRow}>
            <Text style={styles.monitoringMainText}>
              {isMonitoringActive ? 'Monitoring Active' : 'Start Monitoring'}
            </Text>
      
          </View>
        </View>
        <View style={styles.monitoringArrow}>
          <MaterialIcons
            name="keyboard-arrow-right"
            size={20}
            color="#ffffff"
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default StartMonitoringButton;
