import { useRef, useEffect } from 'react';
import { Animated, Platform } from 'react-native';

interface UseIOSFlickerAnimationOptions {
  isActive: boolean;
  onColorChange?: (colorIndex: number) => void;
}

export const useIOSFlickerAnimation = ({ isActive, onColorChange }: UseIOSFlickerAnimationOptions) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const colorIndexRef = useRef(0);
  const listenerRef = useRef<string | null>(null);
  
  // Emergency colors
  const colors = ['#FF0000', '#0000FF']; // Red, Blue
  
  useEffect(() => {
    if (!isActive) {
      // Stop animation and reset
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      if (listenerRef.current) {
        animatedValue.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
      animatedValue.setValue(0);
      colorIndexRef.current = 0;
      return;
    }

    // Only use Animated on iOS - Android will use the original fast setState method
    if (Platform.OS !== 'ios') {
      return;
    }

    console.log('🎨 Starting iOS Animated flicker (400ms cycles)');
    
    // Set up listener to track color changes
    listenerRef.current = animatedValue.addListener(({ value }) => {
      const newIndex = Math.floor(value) % colors.length;
      if (newIndex !== colorIndexRef.current) {
        colorIndexRef.current = newIndex;
        if (onColorChange) {
          onColorChange(newIndex);
        }
      }
    });

    // Create looping animation - 400ms per color cycle
    animationRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true, // Run on native thread - no JS re-renders!
        }),
        Animated.timing(animatedValue, {
          toValue: 2,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      { iterations: -1 } // Infinite loop
    );

    animationRef.current.start();

    // Cleanup
    return () => {
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      if (listenerRef.current) {
        animatedValue.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [isActive]);

  // Return current color based on animation value
  const getCurrentColor = () => {
    return colors[colorIndexRef.current];
  };

  return {
    animatedValue,
    currentColor: getCurrentColor(),
    colors,
  };
};

