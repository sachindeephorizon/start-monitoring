/**
 * Main Application Navigator
 * 
 * Handles navigation for the main app screens after authentication.
 * Uses a stack navigator only - no bottom tabs.
 * All navigation is done through the SlideMenu.
 */

import React, { useEffect } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '@/navigation/navigationRef';
import { Platform } from 'react-native';

// Import actual screens
import HomeScreen from '@/screens/HomeScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import HistoryScreen from '@/screens/HistoryScreen';
import SubscriptionScreen from '@/screens/SubscriptionScreen';
import SubscriptionPlansScreen from '@/screens/SubscriptionPlansScreen';
import FamilyScreen from '@/screens/FamilyScreen';
import EmergencyContactsScreen from '@/screens/EmergencyContactsScreen';
import TrialExpiredScreen from '@/screens/TrialExpiredScreen';
import PoliciesScreen from '@/screens/PoliciesScreen';
import CheckInScreen from '@/screens/CheckInScreen';
import ChatScreen from '@/screens/ChatScreen';
import EmergencyScreen from '@/screens/EmergencyScreen';

const Stack = createStackNavigator();

export type MainStackParamList = {
  Home: undefined;
  Profile: undefined;
  History: undefined;
  Subscription: undefined;
  SubscriptionPlans: undefined;
  Family: undefined;
  EmergencyContacts: undefined;
  TrialExpired: undefined;
  Policies: undefined;
  Emergency: { emergencyId?: string };
  CheckIn: { checkInId?: string };
  Chat: { chatRequestId: string };
  // TODO: Add these when screens are implemented
  // Tracking: { sessionId?: string };
  // VideoCall: { sessionId: string; roomCode: string };
  // AudioCall: { sessionId: string; roomCode: string };
  // Booking: { bookingId?: string };
};

const NAVIGATE_TO_PLANS_KEY = '@navigate_to_subscription_plans';

/**
 * Main Stack Navigator
 * All screens accessible via SlideMenu
 */
export function MainNavigator() {
  // Check if we need to navigate to SubscriptionPlans on mount
  useEffect(() => {
    const checkAndNavigate = async () => {
      try {
        const shouldNavigate = await AsyncStorage.getItem(NAVIGATE_TO_PLANS_KEY);
        if (shouldNavigate === 'true') {
          // Clear the flag
          await AsyncStorage.removeItem(NAVIGATE_TO_PLANS_KEY);
          // IMPORTANT:
          // MainNavigator is mounted under the Root navigator's "Main" screen.
          // Using useNavigation() here would target the parent (Root) navigator,
          // which does NOT have a "SubscriptionPlans" route — causing:
          // "The action 'NAVIGATE' with payload { name: 'SubscriptionPlans' } was not handled..."
          //
          // So we route via the root `navigationRef` into the "Main" stack.
          setTimeout(() => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('Main' as any, { screen: 'SubscriptionPlans' });
            } else {
              // If not ready yet, put the flag back so we can try again on next mount.
              AsyncStorage.setItem(NAVIGATE_TO_PLANS_KEY, 'true').catch(() => {});
            }
          }, 100);
        }
      } catch (error) {
        console.error('Error checking navigation flag:', error);
      }
    };

    checkAndNavigate();
  }, []);

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
      initialRouteName="Home"
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen 
        name="SubscriptionPlans" 
        component={SubscriptionPlansScreen}
        // Android: use normal card presentation (better gestures/scroll, avoids modal overlays).
        // iOS: modal is fine for a paywall-like screen.
        options={Platform.OS === 'ios' ? { presentation: 'modal' } : undefined}
      />
      <Stack.Screen name="Family" component={FamilyScreen} />
      <Stack.Screen name="EmergencyContacts" component={EmergencyContactsScreen} />
      <Stack.Screen name="TrialExpired">
        {({ navigation }: any) => (
          <TrialExpiredScreen
            navigation={navigation}
            onSubscribe={() => {
              navigation.navigate('SubscriptionPlans');
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen name="Policies" component={PoliciesScreen} />
      <Stack.Screen name="CheckIn" component={CheckInScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Emergency" component={EmergencyScreen} />
    </Stack.Navigator>
  );
}


