import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { useColorFlicker } from './useColorFlicker';
import { useFlashFlicker } from './useFlashFlicker';

interface UseIOSCompatibleSirenOptions {
  onFlashlightControl?: (enabled: boolean) => void;
  cameraPermission?: boolean;
}

export const useIOSCompatibleSiren = (options: UseIOSCompatibleSirenOptions = {}) => {
  const { onFlashlightControl, cameraPermission = false } = options;

  // Simple state
  const [isActive, setIsActive] = useState(false);
  const [soundLoaded, setSoundLoaded] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const activeRef = useRef(false);
  const isCleanedUpRef = useRef(false);

  // Emergency colors (red and blue)
  const emergencyColors = ['#FF0000', '#0000FF'];

  // Use the color flicker hook (iOS uses native animation, Android uses fast setState)
  const bgColor = useColorFlicker({
    isActive,
    colors: emergencyColors,
  });

  // Use the flashlight flicker hook (synced to 400ms on iOS, 200ms on Android)
  const flashIsOn = useFlashFlicker({
    isActive,
    onFlashlightControl,
    cameraPermission,
  });

  // Load sound asset on mount using expo-av Audio.Sound
  useEffect(() => {
    const loadAudio = async () => {
      try {
        console.log('[useIOSCompatibleSiren] Loading siren sound...');

        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/siren.mp3'),
          { isLooping: true, shouldPlay: false }
        );

        if (isCleanedUpRef.current) {
          // Component unmounted during load
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        setSoundLoaded(true);
        console.log('[useIOSCompatibleSiren] Siren sound loaded');
      } catch (error) {
        console.error('[useIOSCompatibleSiren] Siren sound loading failed:', error);
      }
    };

    loadAudio();

    return () => {
      isCleanedUpRef.current = true;
      const sound = soundRef.current;
      if (sound) {
        sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // Start siren
  const startSiren = useCallback(async () => {
    if (activeRef.current) return;

    try {
      console.log('[useIOSCompatibleSiren] Starting siren...');
      activeRef.current = true;
      setIsActive(true);

      const sound = soundRef.current;
      if (soundLoaded && sound && !isCleanedUpRef.current) {
        try {
          await sound.setPositionAsync(0);
          await sound.playAsync();
          console.log('[useIOSCompatibleSiren] Siren sound started');
        } catch (soundError: any) {
          const errorMsg = String(soundError?.message || soundError || '');
          if (!errorMsg.includes('already released') && !errorMsg.includes('shared object')) {
            console.warn('[useIOSCompatibleSiren] Siren sound failed to start:', soundError);
          }
        }
      } else {
        console.warn('[useIOSCompatibleSiren] Siren audio not ready:', { soundLoaded, hasSound: !!sound, isCleanedUp: isCleanedUpRef.current });
      }
    } catch (error) {
      console.error('[useIOSCompatibleSiren] Failed to start siren:', error);
      activeRef.current = false;
      setIsActive(false);
    }
  }, [soundLoaded]);

  // Stop siren
  const stopSiren = useCallback(async () => {
    if (!activeRef.current) return;

    try {
      console.log('[useIOSCompatibleSiren] Stopping siren...');
      activeRef.current = false;
      setIsActive(false);

      const sound = soundRef.current;
      if (sound && !isCleanedUpRef.current) {
        try {
          await sound.stopAsync();
          console.log('[useIOSCompatibleSiren] Siren sound stopped');
        } catch (soundError: any) {
          const errorMsg = String(soundError?.message || soundError || '');
          if (!errorMsg.includes('already released') && !errorMsg.includes('shared object')) {
            console.warn('[useIOSCompatibleSiren] Siren sound failed to stop:', soundError);
          }
        }
      }
    } catch (error) {
      console.error('[useIOSCompatibleSiren] Failed to stop siren:', error);
    }
  }, []);

  // Toggle siren
  const toggleSiren = useCallback(async () => {
    if (activeRef.current) {
      await stopSiren();
    } else {
      await startSiren();
    }
  }, [startSiren, stopSiren]);

  return {
    isActive,
    bgColor,
    flashIsOn,
    soundLoaded,
    startSiren,
    stopSiren,
    toggleSiren,
  };
};
