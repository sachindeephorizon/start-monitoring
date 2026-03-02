/**
 * Audio Session Configuration
 *
 * Ensures audio session is configured correctly for calls.
 * Uses expo-av for audio mode configuration.
 */

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { Platform } from 'react-native';

// Lazy load expo-keep-awake for Expo Go compatibility
let KeepAwake: any = null;
try {
  KeepAwake = require('expo-keep-awake');
} catch (error) {
  console.warn('[audioSession] expo-keep-awake not available (Expo Go mode):', error);
}

/**
 * Configure audio session for calls
 * This must be called BEFORE connecting to Stream audio or starting mic capture
 */
export async function configureAudioSession(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    // Keep screen awake during calls (only if available)
    if (Platform.OS === 'ios' && KeepAwake?.activateKeepAwakeAsync) {
      try {
        await KeepAwake.activateKeepAwakeAsync();
      } catch (error) {
        if (__DEV__) {
          console.warn('[audioSession] Keep-awake activation failed (non-critical):', error);
        }
      }
    }

    if (__DEV__) {
      console.log('🎧 Audio session configured');
    }
  } catch (err) {
    console.warn('⚠️ Audio setup error:', err);
    // Don't throw - allow call to continue even if audio setup fails
  }
}

/**
 * Activate audio session (alias for configureAudioSession)
 */
export async function activateAudioSession(): Promise<void> {
  return configureAudioSession();
}

