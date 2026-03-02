import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingScreenProps {
  onGetStarted: () => void;
  onShowLogin: () => void;
  onShowPlans?: () => void;
}

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'safety',
    title: 'Personal Safety, Simplified',
    subtitle: 'Emergency response, siren, and real-time chat with trained agents — always one tap away.',
    image: require('../../assets/Logo-T.png'),
  },
  {
    key: 'tracking',
    title: 'Track Me On The Go',
    subtitle: 'Share location with timed check-ins. If a check-in is missed, agents get alerted immediately.',
    image: require('../../assets/Logo-T.png'),
  },
  {
    key: 'monitor',
    title: 'Secure Video Monitoring',
    subtitle: 'Start a protected video session so agents can assist you visually in critical moments.',
    image: require('../../assets/Logo-T.png'),
  },
];

export function OnboardingScreen({ onGetStarted, onShowLogin, onShowPlans }: OnboardingScreenProps) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  const handleNext = () => {
    if (index < SLIDES.length - 1) {
      setIndex(idx => idx + 1);
      listRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      onGetStarted();
    }
  };

  const listRef = useRef<ScrollView | null>(null);

  const dots = useMemo(() => SLIDES.map((_, i) => i), []);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={onShowLogin}>
          <Text style={styles.loginLink}>Log in</Text>
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(idx);
        }}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide) => (
          <View key={slide.key} style={[styles.slide, { width }]}> 
            <View style={styles.illustration}>
              <Image source={slide.image} style={styles.illustrationImage} resizeMode="contain" />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.subtitle}>{slide.subtitle}</Text>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={styles.dotsContainer}>
        {dots.map((d, i) => (
          <View key={d} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.ctaRow}>
        {onShowPlans && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onShowPlans}>
            <Text style={styles.secondaryButtonText}>View Plans</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[
            styles.primaryButton, 
            !onShowPlans && styles.primaryButtonFull
          ]} 
          onPress={handleNext}
        >
          <Text style={styles.primaryButtonText}>{index < SLIDES.length - 1 ? 'Next' : 'Get Started'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandLogo: { width: 40, height: 40 },
  loginLink: { color: '#3498db', fontSize: 16, fontWeight: '600' },
  slide: { alignItems: 'center', paddingHorizontal: 24 },
  illustration: { height: 240, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  illustrationImage: { width: 180, height: 180 },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  dotsContainer: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d0d7de' },
  dotActive: { backgroundColor: '#3498db' },
  ctaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginLeft: 12,
  },
  primaryButtonFull: {
    flex: 0,
    marginLeft: 0,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: { 
    paddingVertical: 16, 
    paddingHorizontal: 20, 
    alignItems: 'center',
    flex: 1,
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '500',
  },
});

