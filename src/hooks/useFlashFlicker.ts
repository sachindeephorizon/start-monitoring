import { useRef, useEffect } from 'react';
import { Platform } from 'react-native';

interface UseFlashFlickerOptions {
  isActive: boolean;
  onFlashlightControl?: (enabled: boolean) => void;
  cameraPermission?: { granted: boolean } | boolean | null;
}

export const useFlashFlicker = ({
  isActive,
  onFlashlightControl,
  cameraPermission = null,
}: UseFlashFlickerOptions) => {
  const isOnRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Keep latest callback in a ref so the interval/cleanup never uses a stale closure
  const controlRef = useRef(onFlashlightControl);
  controlRef.current = onFlashlightControl;

  // Platform-specific intervals - iOS synced to 400ms color rhythm, Android unchanged
  const flashInterval = Platform.OS === 'ios' ? 400 : 200;

  useEffect(() => {
    if (!isActive || !controlRef.current) {
      // Clear interval and turn off flashlight when inactive
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      controlRef.current?.(false);
      isOnRef.current = false;
      console.log(`🔦 Flashlight off (inactive)`);
      return;
    }

    if (!cameraPermission) {
      console.warn('🚫 Flashlight not activated: camera permission not granted');
      return;
    }

    // Handle both boolean and object permission formats
    const hasPermission = typeof cameraPermission === 'boolean'
      ? cameraPermission
      : cameraPermission?.granted === true;

    if (!hasPermission) {
      console.warn('🚫 Flashlight not activated: camera permission not granted');
      return;
    }

    // Start flashlight flicker immediately when active
    console.log(`🔦 Starting flashlight flicker (${Platform.OS}: ${flashInterval}ms)`);

    // Start immediately with flashlight ON
    isOnRef.current = true;
    controlRef.current(true);
    console.log(`🔦 Flash: ON (immediate start)`);

    intervalRef.current = setInterval(() => {
      isOnRef.current = !isOnRef.current;
      controlRef.current?.(isOnRef.current);
    }, flashInterval);

    // Cleanup function
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      controlRef.current?.(false);
      isOnRef.current = false;
    };
  }, [isActive, cameraPermission, flashInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      controlRef.current?.(false);
    };
  }, []);

  return isOnRef.current;
};

