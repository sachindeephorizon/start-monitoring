/**
 * RootNavigator
 *
 * Authoritative navigation switch based on `AppBootState`.
 * The app must never render the Main flow unless auth + profile hydration completed at least once.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { navigationRef, replayPendingNavigation } from '@/navigation/navigationRef';
import { AuthNavigator } from '@/navigation/AuthNavigator';
import { MainNavigator } from '@/navigation/MainNavigator';
import { useAuth } from '@/core/auth';
import { AuthGuard } from '@/core/auth/AuthGuard';
import FatalErrorScreen from '@/screens/FatalErrorScreen';
import AnimatedStartupScreen from '@/components/startup/AnimatedStartupScreen';
import type { RootStackParamList } from '@/types';

const Stack = createStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const auth = useAuth();

  switch (auth.appState) {
    case 'booting':
    case 'authenticating':
    case 'hydrating_profile':
      return <AnimatedStartupScreen subtitle="Starting DeepHorizon..." />;

    case 'error':
      return <FatalErrorScreen />;

    case 'unauthenticated':
    case 'ready':
      return (
        <NavigationContainer ref={navigationRef} onReady={replayPendingNavigation}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
            }}
          >
            {auth.appState === 'ready' ? (
              <Stack.Screen name="Main">
                {() => (
                  <AuthGuard>
                    <MainNavigator />
                  </AuthGuard>
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Auth" component={AuthNavigator} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
      );
  }
}
