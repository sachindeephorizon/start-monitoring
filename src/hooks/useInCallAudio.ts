/**
 * Hook for managing in-call audio routing
 * 
 * Handles audio route configuration for calls (speaker/earpiece)
 */

// Lazy load InCallManager to prevent native module access before bridge is ready
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager');
} catch (error) {
  console.warn('[useInCallAudio] InCallManager not available (non-critical):', error);
}

import { useEffect, useRef, useCallback } from 'react';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

/**
 * Audio route configuration function
 */
async function configureAudioRoute(route: 'speaker' | 'earpiece', mode: 'audio' | 'video' | 'audio_call') {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: route === 'earpiece',
    });

    if (!InCallManager || typeof InCallManager.start !== 'function') {
      console.warn('[useInCallAudio] InCallManager not available, skipping in-call audio configuration');
      return;
    }

    const mediaMode = mode === 'audio_call' ? 'audio' : mode;
    InCallManager.start({ media: mediaMode });

    // Audio calls: default earpiece, but allow explicit speaker routing (UX fix).
    if (mode === 'audio_call' || mode === 'audio') {
      const wantsSpeaker = route === 'speaker';
      console.log('[useInCallAudio] Configuring for audio call route:', wantsSpeaker ? 'SPEAKER' : 'EARPIECE');
      if (InCallManager?.setForceSpeakerphoneOn) {
        InCallManager.setForceSpeakerphoneOn(wantsSpeaker);
      }
      try {
        if (InCallManager?.setSpeakerphoneOn) {
          InCallManager.setSpeakerphoneOn(wantsSpeaker);
        }
      } catch (err) {
        console.warn('[useInCallAudio] Failed to set speakerphone:', err);
      }
      try {
        if (InCallManager?.setMicrophoneMute) {
          InCallManager.setMicrophoneMute(false);
        }
      } catch (err) {
        console.warn('[useInCallAudio] Failed to unmute microphone:', err);
      }
    } else {
      // For video calls, use speaker as requested
      if (InCallManager?.setForceSpeakerphoneOn) {
        InCallManager.setForceSpeakerphoneOn(route === 'speaker');
      }
      try {
        if (InCallManager?.setSpeakerphoneOn) {
          InCallManager.setSpeakerphoneOn(route === 'speaker');
        }
      } catch (err) {
        console.warn('[useInCallAudio] Failed to set speakerphone:', err);
      }
    }

    if (InCallManager?.setKeepScreenOn) {
      InCallManager.setKeepScreenOn(true);
    }
    console.log(`🔈 Audio routed to ${route}`);
  } catch (err) {
    console.warn('Audio route change failed:', err);
  }
}

export function useInCallAudio(active: boolean, useSpeaker = true, mode: 'audio' | 'video' | 'audio_call' = 'video') {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const setAudioRoute = useCallback((route: 'speaker' | 'earpiece', mode: 'audio' | 'video' | 'audio_call') => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      configureAudioRoute(route, mode).catch((err) => {
        console.warn('[useInCallAudio] Audio route configuration failed:', err);
      });
    }, 500);
  }, []);

  useEffect(() => {
    if (active) {
      console.log('[useInCallAudio] Activating audio routing, mode:', mode);

      // For audio calls, default to earpiece unless the UI explicitly requests speaker.
      const route =
        mode === 'audio_call' || mode === 'audio'
          ? useSpeaker
            ? 'speaker'
            : 'earpiece'
          : useSpeaker
            ? 'speaker'
            : 'earpiece';
      setAudioRoute(route, mode);
    } else {
      console.log('[useInCallAudio] Deactivating audio routing');
      if (InCallManager?.setKeepScreenOn) {
        InCallManager.setKeepScreenOn(false);
      }
      if (InCallManager?.stop) {
        InCallManager.stop();
      }
    }

    return () => {
      console.log('[useInCallAudio] Cleaning up audio routing');

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (InCallManager?.setKeepScreenOn) {
        InCallManager.setKeepScreenOn(false);
      }
      if (InCallManager?.stop) {
        InCallManager.stop();
      }
    };
  }, [active, useSpeaker, mode, setAudioRoute]);
}
