import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/core/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigationRef } from '@/navigation/navigationRef';

interface TrialExpiredScreenProps {
  navigation?: any;
  onSubscribe?: () => void;
  onLogout?: () => void;
}

const TrialExpiredScreen: React.FC<TrialExpiredScreenProps> = ({
  navigation,
  onSubscribe,
  onLogout
}) => {
  const { signOut } = useAuth();

  const goToSubscriptionPlans = async () => {
    // Prefer explicit callback when provided (e.g., AuthGuard / navigators).
    if (onSubscribe) {
      onSubscribe();
      return;
    }

    // Best-effort immediate navigation.
    try {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Main' as any, { screen: 'SubscriptionPlans' });
        return;
      }
    } catch (e) {
      // continue to other fallbacks
    }

    try {
      if (navigation?.navigate) {
        navigation.navigate('SubscriptionPlans');
        return;
      }
    } catch (e) {
      // continue
    }

    // Fallback: set flag for MainNavigator to pick up when ready.
    AsyncStorage.setItem('@navigate_to_subscription_plans', 'true').catch((error) => {
      console.error('Error setting navigation flag:', error);
    });
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Use the context's signOut (not AuthService.signOut) to ensure:
              // 1. logoutFenceRef is set (blocks recovery attempts)
              // 2. UI state clears immediately (appState → unauthenticated)
              // 3. Works even when network is unavailable
              await signOut();
              if (onLogout) {
                onLogout();
              }
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconContainer}>
          <MaterialIcons name="lock" size={80} color="#e74c3c" />
        </View>

        <Text style={styles.title}>7-Day Trial Ended</Text>
        
        <Text style={styles.subtitle}>
          Subscribe to use all the features
        </Text>

        <View style={styles.messageContainer}>
          <Text style={styles.message}>
            Your free trial period has ended. To continue enjoying all the premium features of DeepHorizon Security, please subscribe to one of our plans.
          </Text>
        </View>

        <View style={styles.featuresContainer}>
          <Text style={styles.featuresTitle}>What you'll get:</Text>
          <View style={styles.featureItem}>
            <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
            <Text style={styles.featureText}>24/7 Emergency Support</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
            <Text style={styles.featureText}>Real-time Location Tracking</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
            <Text style={styles.featureText}>Video Monitoring Sessions</Text>
          </View>
          <View style={styles.featureItem}>
            <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
            <Text style={styles.featureText}>Family Plan Options</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.subscribeButton}
          onPress={() => {
            void goToSubscriptionPlans();
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.subscribeButtonText}>Buy a Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <MaterialIcons name="logout" size={20} color="#6b7280" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#6b7280',
    marginBottom: 32,
    textAlign: 'center',
  },
  messageContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    width: '100%',
    borderLeftWidth: 4,
    borderLeftColor: '#4BA8FF',
  },
  message: {
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
    textAlign: 'center',
  },
  featuresContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    width: '100%',
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
  },
  subscribeButton: {
    backgroundColor: '#4BA8FF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  logoutButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});

export default TrialExpiredScreen;











