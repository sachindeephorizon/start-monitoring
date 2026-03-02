/**
 * Authentication Navigator
 * 
 * Handles navigation for authentication-related screens:
 * - OnboardingScreen (first-time user introduction)
 * - AuthScreen (with 2Factor OTP and Email/Password)
 * - Policies
 * 
 * This navigator is shown when the user is not authenticated.
 */

import React, { useState, useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { AuthScreen } from '@/screens/AuthScreen';
import PoliciesScreen from '@/screens/PoliciesScreen';
import PublicPlansScreen from '@/screens/PublicPlansScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/core/auth';

const Stack = createStackNavigator();

export type AuthStackParamList = {
  Onboarding: undefined;
  Login: undefined;
  Policies: undefined;
  PublicPlans: undefined;
};

const ONBOARDING_COMPLETED_KEY = 'deephorizon.onboarding.completed';

export function AuthNavigator() {
  const auth = useAuth();
  const [initialRoute, setInitialRoute] = useState<'Onboarding' | 'Login' | null>(null);
  const [loading, setLoading] = useState(true);

  // Check if onboarding has been completed
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        /**
         * IMPORTANT (production behavior):
         * AuthNavigator is only mounted when the user is unauthenticated (see `App.tsx`).
         * We should NOT clear onboarding state in this situation.
         *
         * Onboarding should be shown once per install (or until the user completes it),
         * not every time the user is logged out or if auth is temporarily unavailable.
         */
        const completed = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
        setInitialRoute(completed === 'true' ? 'Login' : 'Onboarding');
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        // On error, default to Onboarding
        setInitialRoute('Onboarding');
      } finally {
        setLoading(false);
      }
    };

    checkOnboardingStatus();
  }, [auth.status]);

  // Mark onboarding as completed
  const markOnboardingCompleted = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch (error) {
      console.error('Error marking onboarding as completed:', error);
    }
  };

  // Don't render navigator until we know the initial route
  if (loading || initialRoute === null) {
    return null; // Will be handled by App.tsx loading state
  }

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Onboarding">
        {({ navigation }) => (
          <OnboardingScreen
            onGetStarted={async () => {
              await markOnboardingCompleted();
              navigation.replace('Login', { defaultToSignUp: true, defaultAuthMode: 'phone' });
            }}
            onShowLogin={async () => {
              await markOnboardingCompleted();
              navigation.replace('Login', { defaultToSignUp: false });
            }}
            onShowPlans={() => {
              navigation.navigate('PublicPlans');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Login">
        {({ navigation, route }: any) => (
          <AuthScreen
            onShowOnboarding={() => {
              navigation.navigate('Onboarding');
            }}
            onNavigateToPlans={() => {
              navigation.navigate('PublicPlans');
            }}
            onSignupSuccess={(fromPlanSelection) => {
              // Signup success is handled by auth state change
              // The app will automatically navigate to Main navigator
            }}
            defaultToSignUp={route?.params?.defaultToSignUp || false}
            defaultAuthMode={route?.params?.defaultAuthMode}
            comingFromPlanSelection={!!route?.params?.selectedPlanId}
            navigation={navigation}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Policies" component={PoliciesScreen} />
      <Stack.Screen name="PublicPlans">
        {({ navigation }: any) => (
          <PublicPlansScreen
            navigation={navigation}
            onBack={() => {
              navigation.goBack();
            }}
            onLoginRequest={() => {
              navigation.navigate('Login', { defaultToSignUp: true });
            }}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}


