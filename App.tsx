/**
 * DeepHorizon Security App - Main Entry Point
 * 
 * This is the root component of the application. It sets up:
 * - Navigation
 * - Context providers
 * - Error boundaries
 * - Global app initialization
 * 
 * iOS SAFETY: This component runs in the main thread and does not
 * perform any background operations. All background work is handled
 * by native modules (location, notifications, etc.)
 */

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View, LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Suppress harmless iOS simulator noise (CoreAudio, HALC) from the log output.
// These come from the Mac audio subsystem and never appear on real devices.
LogBox.ignoreLogs([
  'HALC_ProxyObjectMap',
  'CoreAudio',
]);

// Initialize required polyfills
import 'react-native-get-random-values';

// Register background location tracking task
// This MUST be imported at the app entry point for the task to be registered
// iOS SAFETY: This file defines the background task that runs when iOS
// delivers location updates. It runs without React, without UI, without timers.
import './src/features/tracking/tracking.task';

// Navigation
import { RootNavigator } from '@/navigation/RootNavigator';

// Core auth system (new implementation)
import { AuthProvider, useAuth } from '@/core/auth';
import { BootGuard } from '@/core/boot/boot.guard';
import { AppStateProvider } from '@/context/AppStateContext';

// Push notifications
import { setupNotificationHandlers, setupNotificationChannels } from '@/core/notifications';
import { useNotificationRouting, usePushNotifications } from '@/core/notifications';
import { useLiveLocationPublisher } from '@/core/location/useLiveLocationPublisher';

// iOS In-App Purchase
import { IOSPurchaseService } from '@/features/subscription/ios-purchase.service';
import { Platform } from 'react-native';

// Keep the native splash visible until we decide the app is ready.
// This eliminates the "blink then black spinner" in preview/production builds.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Notification Setup Component
 * 
 * Sets up push notifications inside AuthProvider context.
 * This component must be inside AuthProvider because usePushNotifications uses useAuth.
 */
function NotificationSetup() {
  usePushNotifications();
  return null;
}

function LiveLocationSetup() {
  useLiveLocationPublisher();
  return null;
}

function NativeSplashGate({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [layoutDone, setLayoutDone] = useState(false);

  const bootTerminal = useMemo(() => {
    return auth.appState === 'ready' || auth.appState === 'unauthenticated' || auth.appState === 'error';
  }, [auth.appState]);

  const onLayoutRootView = useCallback(() => {
    setLayoutDone(true);
  }, []);

  useEffect(() => {
    if (!bootTerminal || !layoutDone) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [bootTerminal, layoutDone]);

  return (
    <View style={styles.container} onLayout={onLayoutRootView}>
      {children}
    </View>
  );
}

/**
 * Root App Component
 * 
 * Sets up navigation, context providers, and global app state.
 * 
 * iOS SAFETY: Notification handlers are set up here to ensure they're
 * registered before any notifications arrive (including cold-start).
 */
export default function App() {
  // Setup notification handlers (must be called early)
  useEffect(() => {
    setupNotificationHandlers();
    setupNotificationChannels();
  }, []);

  // Initialize iOS StoreKit connection
  useEffect(() => {
    if (Platform.OS === 'ios') {
      IOSPurchaseService.initialize().catch((error) => {
        console.error('[App] Failed to initialize iOS StoreKit:', error);
      });

      // Cleanup on unmount
      return () => {
        IOSPurchaseService.close().catch((error) => {
          console.error('[App] Failed to close iOS StoreKit:', error);
        });
      };
    }
  }, []);

  // Setup notification routing (handles taps on notifications)
  // This doesn't use useAuth, so it can be called here
  useNotificationRouting();

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AppStateProvider>
          <AuthProvider>
            <NotificationSetup />
            <LiveLocationSetup />
            <NativeSplashGate>
              <BootGuard>
                <RootNavigator />
              </BootGuard>
            </NativeSplashGate>
            <StatusBar style="light" />
          </AuthProvider>
        </AppStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
