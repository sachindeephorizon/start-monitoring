import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  StatusBar,
  TextInput,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { TABLES } from '@/lib/supabase';
import { SubscriptionService } from '@/features/subscription/subscription.service';
import type { SubscriptionPlan } from '@/features/subscription/subscription.service';
import { IOSPurchaseService } from '@/features/subscription/ios-purchase.service';
import { AuthService } from '@/core/auth/auth.service';
import { PaymentModal } from '@/components/modals/PaymentModal';
import { UserInfoModal } from '@/components/modals/UserInfoModal';
import { useSubscription } from '@/hooks/useSubscription';
import { useSubscription as useSubscriptionPurchase } from '@/features/subscription/subscription.hooks';
import PoliciesScreen from './PoliciesScreen';
// Import native module directly to avoid bundling issues with wrapper
import { presentSubscriptionStoreViewWithGroupID } from '@/features/subscription/SubscriptionStoreView.native';

interface SubscriptionPlansScreenProps {
  navigation?: any;
  onSelectPlan?: (plan: SubscriptionPlan) => void;
  onBack?: () => void;
  selectedPlanId?: string | null; // Plan ID that was selected before signup
  isAuthenticated?: boolean;
  onRequestLogin?: () => void;
}

const SubscriptionPlansScreen: React.FC<SubscriptionPlansScreenProps> = ({
  navigation,
  onSelectPlan,
  onBack,
  selectedPlanId,
  isAuthenticated,
  onRequestLogin,
}) => {
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState<boolean>(false); // Track if subscription is processing
  const [restoring, setRestoring] = useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [localAuthState, setLocalAuthState] = useState<boolean | null>(null);
  const [couponCode, setCouponCode] = useState<string>('');
  const [showCouponInput, setShowCouponInput] = useState<boolean>(false);
  const [showPaymentSuccessModal, setShowPaymentSuccessModal] = useState(false);
  const [paymentSuccessPlanName, setPaymentSuccessPlanName] = useState<string>('');
  const pendingSuccessRef = React.useRef<{ planName: string } | null>(null);
  const [trialStatus, setTrialStatus] = useState<{
    isTrialActive: boolean;
    daysRemaining: number;
    trialEndDate: Date | null;
  } | null>(null);
  const iosMajorVersion = Platform.OS === 'ios' ? parseInt(String(Platform.Version), 10) : 0;

  // Get subscription refresh function
  const { refresh: refreshSubscription, subscription } = useSubscription();
  
  // Get iOS purchase function (only used on iOS)
  const { purchaseSubscription } = useSubscriptionPurchase();
  
  // Calculate safe top padding for status bar
  const statusBarHeight = Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 0);
  const headerTopPadding = Platform.OS === 'ios' ? statusBarHeight : statusBarHeight + 8;
  
  const plans = SubscriptionService.getPlans();
  const guestMode = isAuthenticated === false || (typeof isAuthenticated === 'undefined' && localAuthState === false);

  const showSuccessWhenActive = React.useCallback(() => {
    const pending = pendingSuccessRef.current;
    if (!pending) return;
    if (AppState.currentState !== 'active') return;
    pendingSuccessRef.current = null;
    setPaymentSuccessPlanName(pending.planName);
    setShowPaymentSuccessModal(true);
  }, []);

  // Android: Razorpay UPI can background the app; show success UI only after returning foreground.
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        showSuccessWhenActive();
      }
    });
    return () => sub.remove();
  }, [showSuccessWhenActive]);

  React.useEffect(() => {
    let mounted = true;
    if (typeof isAuthenticated === 'boolean') {
      setLocalAuthState(isAuthenticated);
      return () => {
        mounted = false;
      };
    }

    const checkAuth = async () => {
      try {
        const user = await AuthService.getCurrentUser();
        if (mounted) {
          setLocalAuthState(!!user);
        }
      } catch (error) {
        console.warn('⚠️ Unable to determine auth state:', error);
        if (mounted) {
          setLocalAuthState(null);
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  // Load trial status for authenticated users without subscription
  React.useEffect(() => {
    const loadTrialStatus = async () => {
      // Only load trial status if user is authenticated and has no subscription
      if (!guestMode && !subscription) {
        try {
          const status = await SubscriptionService.getTrialStatus();
          setTrialStatus({
            isTrialActive: status.isTrialActive,
            daysRemaining: status.daysRemaining,
            trialEndDate: status.trialEndDate,
          });
        } catch (error) {
          console.error('Error loading trial status:', error);
          setTrialStatus(null);
        }
      } else {
        setTrialStatus(null);
      }
    };

    loadTrialStatus();
  }, [guestMode, subscription]);

  // Auto-select plan if coming from signup flow (Flow 2)
  React.useEffect(() => {
    if (selectedPlanId) {
      const plan = SubscriptionService.getPlan(selectedPlanId);
      if (plan) {
        console.log('📋 Plan pre-selected after signup:', plan.name, plan.id);
        setSelectedPlan(plan);

        // Auto-trigger payment if user is logged in
        const checkUserAndProceed = async () => {
          // Wait longer to ensure auth state is fully updated after signup
          console.log('⏳ Waiting for auth state to update after signup...');
          await new Promise(resolve => setTimeout(resolve, 1200));

          const user = await AuthService.getCurrentUser();

          if (user) {
            // User is logged in after signup, proceed to payment automatically
            console.log('✅ User logged in after signup, initiating payment for:', plan.name);
            console.log('💳 User email:', user.email);
            await initiatePayment(plan, {
              // Phone-auth users often have no Supabase auth email.
              // We store the profile email in auth metadata as `profile_email`.
              email: (user.profileEmail || user.email || '').trim(),
              name: user.name || 'User',
              phone: user.phone || '',
            });
          } else {
            console.log('⚠️ User not logged in yet after signup');
            console.log('📝 Plan is selected and ready - user can click "Select Plan" to proceed');
            // User might need to verify email first or login
            // Keep plan selected so they can manually trigger payment when ready
          }
        };
        checkUserAndProceed();
      } else {
        console.warn('⚠️ Plan not found for ID:', selectedPlanId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanId]);

  // Handle plan card tap - just selects the plan visually
  const handlePlanCardPress = (plan: SubscriptionPlan) => {
    console.log('📱 Plan card tapped:', plan.name, plan.id);
    setSelectedPlan(plan);
  };

  // Handle Subscribe button - triggers payment flow
  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (!plan) {
      Alert.alert('Select a Plan', 'Please select a plan first.');
      return;
    }

    try {
      console.log('📱 Subscribe button pressed for plan:', plan.name, plan.id);
      setLoading(true);

      console.log('🔐 Checking user authentication...');
      const user = await AuthService.getCurrentUser();

      console.log('👤 User status:', user ? 'Logged in' : 'Not logged in');

      if (user) {
        // User is logged in → Go directly to payment (Flow 1 after signup)
        console.log('✅ User logged in, initiating payment...');
        await initiatePayment(plan, {
          // Phone-auth users often have no Supabase auth email.
          // We store the profile email in auth metadata as `profile_email`.
          email: (user.profileEmail || user.email || '').trim(),
          name: user.name || 'User',
          phone: user.phone || '',
        });
      } else {
        setLoading(false);
        // User not logged in → Redirect to signup first (Flow 2)
        console.log('⚠️ User not logged in, redirecting to signup...');
        if (onSelectPlan) {
          onSelectPlan(plan);
        }

        if (onRequestLogin) {
          Alert.alert(
            'Login required',
            'Please log in using the button below the plans to continue with your purchase.'
          );
          return;
        }

        if (onSelectPlan) {
          return;
        } else {
          // If no callback, show user info modal for guest checkout
          console.log('📝 Showing user info modal for guest checkout...');
          setShowUserInfoModal(true);
        }
      }
    } catch (error: any) {
      console.error('❌ Error in handleSelectPlan:', error);
      setLoading(false);
      Alert.alert(
        'Error',
        `Failed to process plan selection: ${error.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const handleUserInfoSubmit = async (userInfo: { email: string; name: string; phone: string }) => {
    if (!selectedPlan) return;

    setShowUserInfoModal(false);
    await initiatePayment(selectedPlan, userInfo);
  };

  const initiatePayment = async (
    plan: SubscriptionPlan,
    userInfo: { email: string; name: string; phone: string }
  ) => {
    // iOS: Use StoreKit directly (In-App Purchase)
    if (Platform.OS === 'ios') {
      try {
        console.log('[SubscriptionPlansScreen] Processing iOS purchase for plan:', plan.id);
        setLoading(true);
        
        const result = await purchaseSubscription(plan);
        
        setLoading(false);
        
        if (result.success && result.subscription) {
          // Refresh subscription status
          await refreshSubscription();
          
          Alert.alert(
            'Purchase Successful',
            'Your subscription has been activated successfully!',
            [
              {
                text: 'OK',
                onPress: () => {
                  if (navigation) {
                    navigation.goBack();
                  } else if (onBack) {
                    onBack();
                  }
                }
              }
            ]
          );
        } else {
          // Only show error if user didn't cancel
          if (result.error && !result.error.includes('cancelled') && !result.error.includes('cancel')) {
            Alert.alert('Purchase Failed', result.error || 'Failed to complete purchase');
          }
        }
      } catch (error: any) {
        setLoading(false);
        console.error('[SubscriptionPlansScreen] iOS purchase error:', error);
        Alert.alert('Purchase Error', error.message || 'An error occurred during purchase');
      }
      return;
    }

    try {
      if (Platform.OS !== 'android') {
        throw new Error('External payments are not available on iOS. Please use Apple In‑App Purchase.');
      }

      console.log('💳 Initiating Razorpay subscription...', { plan: plan.name, userInfo });

      setSelectedPlan(plan);
      setLoading(true);

      // Get current user (must be authenticated to attach subscription server-side)
      const user = await AuthService.getCurrentUser();
      const userId = user?.id || null;
      if (!userId) {
        setLoading(false);
        Alert.alert('Login Required', 'Please log in to purchase a subscription.', [{ text: 'OK' }]);
        return;
      }

      // Fetch email from profile if not provided in userInfo
      let finalEmail = userInfo.email?.trim() || user?.email?.trim() || '';
      let finalName = userInfo.name?.trim() || user?.name?.trim() || '';
      let finalPhone = userInfo.phone?.trim() || user?.phone?.trim() || '';

      // If still missing, fetch from mobile_users profile
      if ((!finalEmail || !finalPhone) && userId) {
        try {
          const { data: profile } = await supabase
            .from(TABLES.MOBILE_USERS)
            .select('email, name, phone')
            .eq('id', userId)
            .single();

          if (profile) {
            finalEmail = finalEmail || profile.email || '';
            finalName = finalName || profile.name || '';
            finalPhone = finalPhone || profile.phone || '';
          }
        } catch (error) {
          console.warn('Could not fetch profile for payment prefill:', error);
        }
      }

      if (!plan.id) {
        Alert.alert('Error', 'Plan ID is missing. Please select a plan again.');
        return;
      }

      if (!finalEmail) {
        Alert.alert(
          'Email Required',
          'Please complete your profile with an email address before making a payment.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (!finalPhone) {
        Alert.alert(
          'Phone Required',
          'Please complete your profile with a phone number before making a payment.',
          [{ text: 'OK' }]
        );
        return;
      }

      if (!finalName) {
        finalName = 'User';
      }

      const result = await purchaseSubscription(plan, {
        couponCode: couponCode.trim().toUpperCase() || undefined,
        prefill: {
          email: finalEmail,
          contact: finalPhone,
          name: finalName,
        },
      });

      if (result.success && result.subscription) {
        await refreshSubscription();
        // Razorpay Checkout often closes without a visible success prompt (especially for UPI intents).
        // Show a reliable in-app success UI once the app returns to foreground.
        pendingSuccessRef.current = { planName: plan.name };
        showSuccessWhenActive();
        return;
      }

      // User cancelled or SDK reported cancellation
      if (result.error && (result.error.toLowerCase().includes('cancel') || result.error.toLowerCase().includes('cancelled'))) {
        return;
      }

      if (result.error) {
        Alert.alert('Payment Failed', result.error || 'Payment could not be completed. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ Payment initiation error:', error);
      Alert.alert('Payment Error', error?.message || 'Failed to initiate payment. Please try again.', [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    setPaymentUrl(null);
    setSelectedPlan(null);
    
    // Refresh subscription state to reflect the new subscription
    try {
      await refreshSubscription();
      console.log('✅ Subscription refreshed in handlePaymentSuccess');
    } catch (error) {
      console.warn('⚠️ Failed to refresh subscription:', error);
    }
    
    // Navigation is handled in the payment success alert callback
    // This function is called after the alert is dismissed
  };

  const handlePaymentFailure = (error: string) => {
    setShowPaymentModal(false);
    setPaymentUrl(null);
    Alert.alert(
      'Payment Failed',
      error || 'Payment could not be processed. Please try again.',
      [{ text: 'OK' }]
    );
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation) {
      // Since SubscriptionScreen uses replace() to navigate here,
      // going back will skip SubscriptionScreen and go to the previous screen (e.g., Profile)
      navigation.goBack();
    }
  };

  const renderPlanCard = (plan: SubscriptionPlan, index: number) => {
    const isPopular = index === 1 || index === 3; // Mark yearly plans as popular
    const isSelected = selectedPlan?.id === plan.id;

    return (
      <TouchableOpacity
        key={plan.id}
        style={[
          styles.planCard,
          isSelected && styles.planCardSelected,
          isPopular && styles.planCardPopular
        ]}
        onPress={() => handlePlanCardPress(plan)}
        activeOpacity={0.7}
      >
        {isPopular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>POPULAR</Text>
          </View>
        )}

        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.autoRenewLabel}>Auto-Renewable Subscription</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.currency}>₹</Text>
            <Text style={styles.price}>{plan.price.toLocaleString('en-IN')}</Text>
            <Text style={styles.period}>/{plan.billing_cycle === 'monthly' ? 'month' : 'year'}</Text>
          </View>
          <Text style={styles.subscriptionLength}>
            Subscription Length: {plan.billing_cycle === 'monthly' ? '1 Month' : '1 Year'}
          </Text>
          {plan.billing_cycle === 'yearly' && (
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>Save 2 months</Text>
            </View>
          )}
        </View>

        <View style={styles.featuresContainer}>
          {plan.features.map((feature, idx) => (
            <View key={idx} style={styles.featureRow}>
              <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
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

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.contentContainer,
          // Android: add extra bottom padding so the last controls are reachable
          // even with gesture nav / soft home bar.
          Platform.OS === 'android' ? { paddingBottom: Math.max(insets.bottom, 16) + 48 } : null,
        ]}
        nestedScrollEnabled={Platform.OS === 'android'}
        keyboardShouldPersistTaps={Platform.OS === 'android' ? 'handled' : undefined}
      >
        <View style={styles.introSection}>
          <Text style={styles.introTitle}>Select Your Safety Plan</Text>
          <Text style={styles.introText}>
            Choose the plan that best fits your needs. All plans include 24/7 emergency support and real-time tracking.
          </Text>
        </View>

        {/* Trial Status Banner - Show for authenticated users without subscription */}
        {!guestMode && !subscription && trialStatus && (
          <View style={styles.trialBanner}>
            <MaterialIcons name="timer" size={24} color="#4BA8FF" />
            <View style={styles.trialBannerContent}>
              <Text style={styles.trialBannerTitle}>
                {trialStatus.isTrialActive 
                  ? `7-Day Free Trial Active` 
                  : '7-Day Free Trial Ended'}
              </Text>
              <Text style={styles.trialBannerText}>
                {trialStatus.isTrialActive 
                  ? `${trialStatus.daysRemaining} day${trialStatus.daysRemaining !== 1 ? 's' : ''} remaining in your free trial`
                  : 'Your free trial has ended. Subscribe to continue using all features.'}
              </Text>
            </View>
          </View>
        )}

        {/* Coupon Code Section - Android only (Razorpay) */}
        {Platform.OS === 'android' && (
          <View style={styles.couponSection}>
            {!showCouponInput ? (
              <TouchableOpacity
                style={styles.couponToggleButton}
                onPress={() => setShowCouponInput(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons name="local-offer" size={20} color="#4BA8FF" />
              <Text style={styles.couponToggleText}>Have a coupon code?</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.couponInputContainer}>
                <TextInput
                  style={styles.couponInput}
                  placeholder="Enter coupon code (e.g., INTERNAL57, INTERNAL58)"
                  placeholderTextColor="#9CA3AF"
                  value={couponCode}
                  onChangeText={(text) => {
                    // Convert to uppercase as user types (backend expects uppercase)
                    setCouponCode(text.toUpperCase().trim());
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={20}
                />
                <TouchableOpacity
                  style={styles.couponCloseButton}
                  onPress={() => {
                    setShowCouponInput(false);
                    setCouponCode('');
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
              {/* Coupon Info */}
              {couponCode.trim() && (
                <View style={styles.couponInfoContainer}>
                  <MaterialIcons name="info-outline" size={16} color="#4BA8FF" />
                  <Text style={styles.couponInfoText}>
                    {couponCode.trim() === 'INTERNAL57' 
                      ? 'INTERNAL57: 57% off Individual Yearly Plan (₹1,639 → ₹699)'
                      : couponCode.trim() === 'INTERNAL58'
                      ? 'INTERNAL58: 58% off Family Yearly Plan (₹7,139 → ₹2,999)'
                      : 'Coupon will be validated by the payment system. Valid only for yearly plans.'}
                  </Text>
                </View>
              )}
            </>
          )}
          </View>
        )}

        <View style={styles.plansContainer}>
          {plans.map((plan, index) => renderPlanCard(plan, index))}
        </View>

        {/* Required Links: Privacy Policy and Terms of Use (EULA) - App Store Requirement */}
        {/* These must be visible and accessible BEFORE the Subscribe button */}
        <View style={styles.legalLinksSection}>
          <Text style={styles.legalLinksTitle}>Legal Information</Text>
          
          <TouchableOpacity
            style={styles.legalLinkItem}
            onPress={() => {
              if (navigation) {
                navigation.navigate('Policies');
              } else {
                setShowPoliciesModal(true);
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="privacy-tip" size={20} color="#4BA8FF" />
            <Text style={styles.legalLinkText}>Privacy Policy</Text>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.legalLinkItem}
            onPress={async () => {
              // Open Apple's Standard EULA in system browser
              const eulaUrl = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
              try {
                const canOpen = await Linking.canOpenURL(eulaUrl);
                if (canOpen) {
                  await Linking.openURL(eulaUrl);
                } else {
                  Alert.alert('Error', 'Unable to open Terms of Use. Please try again.');
                }
              } catch (error) {
                console.error('Error opening Terms of Use:', error);
                Alert.alert('Error', 'Unable to open Terms of Use. Please try again.');
              }
            }}
            activeOpacity={0.7}
          >
            <MaterialIcons name="description" size={20} color="#4BA8FF" />
            <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Subscribe Button - iOS 17.0+ uses native SubscriptionStoreView, others use custom flow */}
        {!guestMode && (
          <TouchableOpacity
            style={[
              styles.subscribeButton,
              (loading || (Platform.OS !== 'ios' && !selectedPlan)) && styles.subscribeButtonDisabled
            ]}
            onPress={async () => {
              // iOS 17.0+: Use Apple's native SubscriptionStoreView (includes all required info)
              if (Platform.OS === 'ios') {
                const iosVersion = parseInt(Platform.Version as string, 10);
                if (iosVersion >= 17) {
                  try {
                    setLoading(true);
                    // Use Apple's native SubscriptionStoreView
                    // This automatically includes Privacy Policy, Terms of Use, pricing, etc.
                    // Call native module directly to avoid import/bundling issues
                    await presentSubscriptionStoreViewWithGroupID();
                  } catch (error: any) {
                    console.error('❌ Error presenting native subscription store:', error);
                    // IMPORTANT: do NOT fall back to the custom paywall on iOS 17+ (App Review requirement).
                    Alert.alert('Error', 'Unable to load subscription options. Please try again.');
                  } finally {
                    setLoading(false);
                  }
                  return;
                }
              }
              
              // Fallback: Custom subscription flow for older iOS versions and Android
              if (!selectedPlan) {
                Alert.alert('Select a Plan', 'Please select a plan first.');
                return;
              }

              try {
                await handleSelectPlan(selectedPlan);
              } catch (error: any) {
                console.error('❌ Unhandled error in handleSelectPlan:', error);
                setLoading(false);
                Alert.alert('Error', 'Failed to process subscription. Please try again.');
              }
            }}
            disabled={loading || (Platform.OS !== 'ios' && !selectedPlan)}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.subscribeButtonText}>
                {Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 17
                  ? 'Buy a Plan'
                  : 'Subscribe'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Show message when no plan is selected */}
        {!guestMode && !selectedPlan && !(Platform.OS === 'ios' && parseInt(Platform.Version as string, 10) >= 17) && (
          <View style={styles.selectPlanPrompt}>
            <MaterialIcons name="info-outline" size={20} color="#4BA8FF" />
            <Text style={styles.selectPlanPromptText}>
              Select a plan above to continue
            </Text>
          </View>
        )}

        {guestMode && onRequestLogin && (
          <View style={styles.loginCtaContainer}>
            <Text style={styles.loginCtaTitle}>Ready to subscribe?</Text>
            <Text style={styles.loginCtaText}>
              Log in or create an account to purchase a plan. Once you’re signed in, we’ll take you right back here.
            </Text>
            <TouchableOpacity
              style={styles.loginCtaButton}
              onPress={onRequestLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.loginCtaButtonText}>Log in to Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoSection}>
          <MaterialIcons name="info" size={20} color="#4BA8FF" />
          <Text style={styles.infoText}>
            {Platform.OS === 'ios' 
              ? 'Subscriptions are managed through your Apple ID. Cancel anytime in Settings → App Store → Subscriptions.'
              : 'All plans include a 7-day free trial. Cancel anytime before your trial ends.'}
          </Text>
        </View>

        {/* Restore purchases (App Store requirement) */}
        {Platform.OS === 'ios' && !guestMode && (
          <TouchableOpacity
            style={[styles.restoreButton, (restoring || loading) && styles.restoreButtonDisabled]}
            disabled={restoring || !!loading}
            activeOpacity={0.7}
            onPress={async () => {
              try {
                setRestoring(true);
                const restored = await IOSPurchaseService.restorePurchases();
                await refreshSubscription();
                Alert.alert(
                  'Restore Purchases',
                  restored.length > 0
                    ? 'Your subscription was restored successfully.'
                    : 'No active subscription was found for your Apple ID.',
                  [{ text: 'OK' }]
                );
              } catch (e: any) {
                console.error('[SubscriptionPlansScreen] Restore purchases failed:', e);
                Alert.alert(
                  'Restore Purchases',
                  e?.message || 'Failed to restore purchases. Please try again.',
                  [{ text: 'OK' }]
                );
              } finally {
                setRestoring(false);
              }
            }}
          >
            {restoring ? (
              <ActivityIndicator size="small" color="#4BA8FF" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* User Info Modal */}
      <UserInfoModal
        visible={showUserInfoModal}
        onClose={() => {
          setShowUserInfoModal(false);
          setSelectedPlan(null);
        }}
        onSubmit={handleUserInfoSubmit}
      />

      {/* Payment Modal with WebView */}
      <PaymentModal
        visible={showPaymentModal}
        plan={selectedPlan}
        paymentUrl={paymentUrl}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentUrl(null);
          setSelectedPlan(null);
        }}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentFailure={handlePaymentFailure}
      />

      {/* Policies Modal */}
      <Modal
        visible={showPoliciesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPoliciesModal(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8f9fa' }} edges={['top', 'bottom']}>
          <View style={[styles.modalHeader, { paddingTop: headerTopPadding }]}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowPoliciesModal(false)}
            >
              <MaterialIcons name="close" size={24} color="#2C3E50" />
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Policies</Text>
            <View style={styles.placeholder} />
          </View>
          <PoliciesScreen navigation={{ goBack: () => setShowPoliciesModal(false) }} />
        </SafeAreaView>
      </Modal>

      {/* Payment success (Android) */}
      <Modal
        visible={showPaymentSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaymentSuccessModal(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={64} color="#10B981" />
            </View>
            <Text style={styles.successTitle}>Payment Successful</Text>
            <Text style={styles.successText}>
              {paymentSuccessPlanName
                ? `Your ${paymentSuccessPlanName} subscription is now active.`
                : 'Your subscription is now active.'}
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              activeOpacity={0.8}
              onPress={() => {
                setShowPaymentSuccessModal(false);
                handlePaymentSuccess();
                if (navigation) {
                  navigation.navigate('Home');
                } else if (onBack) {
                  onBack();
                }
              }}
            >
              <Text style={styles.successButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
    flexGrow: 1,
  },
  introSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  introText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4BA8FF',
  },
  trialBannerContent: {
    flex: 1,
    marginLeft: 12,
  },
  trialBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  trialBannerText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  couponSection: {
    marginBottom: 20,
    marginTop: 8,
  },
  couponToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4BA8FF',
    borderStyle: 'dashed',
  },
  couponToggleText: {
    fontSize: 14,
    color: '#4BA8FF',
    fontWeight: '500',
    marginLeft: 8,
  },
  couponInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  couponInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  couponCloseButton: {
    padding: 4,
  },
  couponInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    gap: 8,
  },
  couponInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#1565C0',
    lineHeight: 16,
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
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  planCardSelected: {
    borderColor: '#4BA8FF',
    backgroundColor: '#f0f8ff',
  },
  planCardPopular: {
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
    marginBottom: 8,
    textAlign: 'center',
  },
  autoRenewLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4BA8FF',
    marginBottom: 8,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subscriptionLength: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
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
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#4a5568',
    marginLeft: 12,
    flex: 1,
  },
  selectButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  selectButtonSelected: {
    backgroundColor: '#4BA8FF',
  },
  selectButtonText: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '600',
  },
  selectButtonTextSelected: {
    color: '#ffffff',
  },
  selectButtonDisabled: {
    opacity: 0.6,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  restoreButton: {
    alignSelf: 'center',
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4BA8FF',
    backgroundColor: '#ffffff',
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreButtonDisabled: {
    opacity: 0.6,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4BA8FF',
  },
  policiesLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  policiesLinkText: {
    fontSize: 16,
    color: '#1f2937',
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
  legalLinksSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  legalLinksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  legalLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  legalLinkText: {
    fontSize: 15,
    color: '#4BA8FF',
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
    textDecorationLine: 'underline',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  successButton: {
    width: '100%',
    backgroundColor: '#4BA8FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  successButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  loginCtaContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  loginCtaTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  loginCtaText: {
    fontSize: 15,
    color: '#4a5568',
    lineHeight: 22,
    marginBottom: 16,
  },
  loginCtaButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  loginCtaButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  subscribeButton: {
    backgroundColor: '#4BA8FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  subscribeButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  selectPlanPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 16,
  },
  selectPlanPromptText: {
    fontSize: 14,
    color: '#1565C0',
    marginLeft: 8,
    fontWeight: '500',
  },
});

export default SubscriptionPlansScreen;

