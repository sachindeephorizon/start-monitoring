import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './MonitoringActiveBanner.styles';

interface MonitoringActiveBannerProps {
  onPress: () => void;
  elapsedLabel: string;
  contextLabel: string;
}

const MonitoringActiveBanner: React.FC<MonitoringActiveBannerProps> = ({
  onPress,
  elapsedLabel,
  contextLabel,
}) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <TouchableOpacity
      style={styles.wrapper}
      onPress={onPress}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`Monitoring active. ${contextLabel}. Tap to view dashboard`}
    >
      <LinearGradient
        colors={['#052e16', '#14532d']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <View style={styles.left}>
          <Animated.View style={[styles.pulseDot, { transform: [{ scale: pulse }] }]} />
          <View>
            <Text style={styles.title}>Monitoring Active · {elapsedLabel}</Text>
            <Text style={styles.sub}>{contextLabel}</Text>
          </View>
        </View>
        <View style={styles.right}>
          <Text style={styles.viewText}>View</Text>
          <MaterialIcons name="chevron-right" size={18} color="#22c55e" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

export default MonitoringActiveBanner;
