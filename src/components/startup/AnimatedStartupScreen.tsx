import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';

type Props = { subtitle?: string };

export default function AnimatedStartupScreen({ subtitle = 'Loading secure session...' }: Props) {
  const logoScale = useSharedValue(0.88);
  const logoOpacity = useSharedValue(0);
  const logoFloat = useSharedValue(0);
  const textOpacity = useSharedValue(0);

  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    textOpacity.value = withDelay(200, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));

    logoFloat.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }, { translateY: logoFloat.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={logoStyle}>
        <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      <Animated.View style={textStyle}>
        <Text style={styles.title}>DeepHorizon</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#05070B', alignItems: 'center', justifyContent: 'center' },
  logo: { width: 96, height: 96, borderRadius: 20 },
  title: { marginTop: 20, color: '#EAF4FF', fontSize: 28, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center' },
  subtitle: { marginTop: 8, color: '#8FA6C0', fontSize: 13 },
});
