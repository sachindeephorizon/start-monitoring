import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { SubscriptionService } from '@/features/subscription/subscription.service';

interface PublicPlansScreenProps {
  onBack: () => void;
  onLoginRequest: () => void;
  navigation?: any;
}

const PublicPlansScreen: React.FC<PublicPlansScreenProps> = ({ 
  onBack, 
  onLoginRequest,
  navigation 
}) => {
  const plans = SubscriptionService.getPlans();
  
  // Calculate safe top padding for status bar
  const statusBarHeight = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 0);
  const headerTopPadding = Platform.OS === 'ios' ? statusBarHeight : statusBarHeight + 8;

  const handleBack = () => {
    if (navigation) {
      navigation.goBack();
    } else if (onBack) {
      onBack();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.header, { paddingTop: headerTopPadding }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose a Plan</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>Subscription Plans</Text>
          <Text style={styles.introText}>
            Explore the DeepHorizon plans below. Log in or create an account to purchase a plan and unlock
            in-app protection tools.
          </Text>
        </View>

        <View style={styles.plansContainer}>
          {plans.map((plan, index) => {
            const isPopular = index === 1 || index === 3;
            return (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  isPopular && styles.planCardPopular,
                  plan.billing_cycle === 'yearly' && styles.planCardYearly,
                ]}
              >
                {isPopular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>POPULAR</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.currency}>₹</Text>
                    <Text style={styles.price}>{plan.price.toLocaleString('en-IN')}</Text>
                    <Text style={styles.period}>/{plan.billing_cycle === 'monthly' ? 'month' : 'year'}</Text>
                  </View>
                  {plan.billing_cycle === 'yearly' && (
                    <View style={styles.savingsBadge}>
                      <Text style={styles.savingsText}>Save 2 months</Text>
                    </View>
                  )}
                </View>

                <View style={styles.featuresContainer}>
                  {plan.features.map((feature, featureIndex) => (
                    <View key={`${plan.id}-${featureIndex}`} style={styles.featureRow}>
                      <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.infoCard}>
          <MaterialIcons name="info" size={20} color="#4BA8FF" />
          <Text style={styles.infoText}>
            You'll be able to manage payments and start your free trial after you log in.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.loginButton} onPress={onLoginRequest} activeOpacity={0.8}>
          <Text style={styles.loginButtonText}>Log in / Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  introSection: {
    marginBottom: 24,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  introText: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 22,
  },
  plansContainer: {
    gap: 16,
    marginBottom: 24,
  },
  planCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  planCardPopular: {
    borderColor: '#4BA8FF',
  },
  planCardYearly: {
    borderColor: '#4BA8FF',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
  },
  popularBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planHeader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  planName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
  },
  currency: {
    fontSize: 18,
    color: '#4BA8FF',
    fontWeight: '600',
    marginRight: 2,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  period: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  savingsBadge: {
    marginTop: 8,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  savingsText: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: '600',
  },
  featuresContainer: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    color: '#4a5568',
    marginLeft: 12,
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    flex: 1,
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  loginButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
});

export default PublicPlansScreen;

