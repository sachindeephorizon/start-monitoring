import { useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import { useIOSFlickerAnimation } from './useIOSFlickerAnimation';

interface UseColorFlickerOptions {
  colors: string[];
  isActive: boolean;
}

export const useColorFlicker = ({ colors, isActive }: UseColorFlickerOptions) => {
  const [color, setColor] = useState(colors[0]);
  const indexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const colorsRef = useRef(colors);
  
  // Update colors ref when colors change
  useEffect(() => {
    colorsRef.current = colors;
  }, [colors]);
  
  // Use iOS native animation for iOS, fast setState for Android
  const { currentColor: iosAnimatedColor } = useIOSFlickerAnimation({
    isActive: isActive && Platform.OS === 'ios',
    onColorChange: (colorIndex) => {
      // Update color when iOS animation changes
      const newColor = colorsRef.current[colorIndex % colorsRef.current.length];
      setColor(newColor);
      console.log(`🎨 iOS Animated Color: ${newColor}`);
    },
  });

  useEffect(() => {
    if (!isActive) {
      // Clear interval and reset to first color when inactive
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setColor(colorsRef.current[0]);
      indexRef.current = 0;
      console.log(`🔴 Color reset to: ${colorsRef.current[0]} (inactive)`);
      return;
    }

    // On iOS, use the native animation (handled above)
    if (Platform.OS === 'ios') {
      console.log('🍎 Using iOS native animation for color flicker');
      return;
    }

    // On Android, use fast setState intervals (unchanged)
    const interval = 150; // Fast Android intervals maintained
    console.log(`🤖 Starting Android color flicker (${interval}ms)`);
    
    intervalRef.current = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % colorsRef.current.length;
      const newColor = colorsRef.current[indexRef.current];
      setColor(newColor);
      console.log(`🎨 Android Color: ${newColor} (index: ${indexRef.current})`);
    }, interval);

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]); // ONLY depend on isActive - use colorsRef.current for colors

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return color;
};

