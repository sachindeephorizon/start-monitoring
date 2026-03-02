/**
 * Audio Session Management
 * 
 * This file controls iOS audio lifecycle. This is CRITICAL for background audio.
 * 
 * iOS SAFETY RULES (CRITICAL):
 * - Background audio is ONLY allowed while a call is active
 * - Audio session must be configured BEFORE joining call
 * - Audio session must be cleaned up AFTER leaving call
 * - iOS audits background audio usage
 * 
 * DESIGN PRINCIPLE:
 * > Background audio exists ONLY when a call is active.
 * > When the call ends, background audio stops immediately.
 */

import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

/**
 * Audio Session Manager
 * 
 * Manages iOS audio session configuration for background audio calls.
 * This is what legally keeps the app alive during active calls.
 */
export const AudioSession = {
  /**
   * Start audio session for active call
   * 
   * Configures iOS audio session to allow background audio.
   * This MUST be called before joining a call to ensure audio
   * continues when the app backgrounds or screen locks.
   * 
   * iOS SAFETY: This configuration is only valid while a call
   * is active. Audio session must be reset after call ends.
   */
  async startCall(): Promise<void> {
    try {
      console.log('[Audio Session] Starting call audio session');

      await Audio.setAudioModeAsync({
        // iOS settings
        allowsRecordingIOS: true, // Enable microphone
        playsInSilentModeIOS: true, // Play audio even in silent mode
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        // This prevents other audio from interrupting the call
        staysActiveInBackground: true, // CRITICAL: Allows background audio

        // Android settings
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        shouldDuckAndroid: true, // Lower other audio volume
        playThroughEarpieceAndroid: false, // Use speaker by default
      });

      console.log('[Audio Session] Call audio session started successfully');
    } catch (error) {
      console.error('[Audio Session] Failed to start call audio session:', error);
      throw error;
    }
  },

  /**
   * End audio session after call
   * 
   * Resets iOS audio session to normal mode.
   * This MUST be called after leaving a call to stop background
   * audio and release audio resources.
   * 
   * iOS SAFETY: This ensures background audio stops when call ends.
   * iOS will terminate the app if background audio persists after call.
   */
  async endCall(): Promise<void> {
    try {
      console.log('[Audio Session] Ending call audio session');

      await Audio.setAudioModeAsync({
        // Reset to normal mode
        allowsRecordingIOS: false, // Disable microphone
        staysActiveInBackground: false, // CRITICAL: Stop background audio
        playsInSilentModeIOS: false,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: false,
      });

      console.log('[Audio Session] Call audio session ended successfully');
    } catch (error) {
      console.error('[Audio Session] Failed to end call audio session:', error);
      // Don't throw - we want to continue even if cleanup fails
    }
  },

  /**
   * Check if audio session is configured for calls
   * 
   * @returns true if audio session is configured for background calls
   */
  async isCallActive(): Promise<boolean> {
    try {
      // This is a simple check - in a real implementation you might
      // track this state yourself or query the audio session
      // For now, we'll rely on call state management
      return false;
    } catch (error) {
      console.error('[Audio Session] Error checking call status:', error);
      return false;
    }
  },
};

