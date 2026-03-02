import { NativeModules } from 'react-native';

export type StreamVideoSdkModule = typeof import('@stream-io/video-react-native-sdk');

let cachedSdk: StreamVideoSdkModule | null = null;
let attemptedLoad = false;

export const hasWebRTCNativeModule = !!NativeModules?.WebRTCModule;

export function loadStreamVideoSdk(): StreamVideoSdkModule | null {
  if (!hasWebRTCNativeModule) {
    return null;
  }

  if (!attemptedLoad) {
    attemptedLoad = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cachedSdk = require('@stream-io/video-react-native-sdk') as StreamVideoSdkModule;
    } catch (error) {
      console.warn('[streamVideoSdkLoader] Failed to load Stream video SDK:', error);
      cachedSdk = null;
    }
  }

  return cachedSdk;
}

export function resetStreamVideoSdkCache(): void {
  cachedSdk = null;
  attemptedLoad = false;
}

