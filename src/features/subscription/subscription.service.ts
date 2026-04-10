/**
 * Subscription Service (CANONICAL — features/)
 *
 * Core subscription operations. Subscription state is server-owned.
 * The app only reads subscription status and gates features accordingly.
 *
 * Contains: payment processing (iOS StoreKit, Razorpay), plan queries,
 * subscription CRUD, trial status.
 *
 * Consumers: AuthGuard, PublicPlansScreen, SubscriptionPlansScreen,
 * subscription.hooks.
 *
 * NOTE: There is a LEGACY service at @/services/subscription.service that
 * handles family members, video session limits, and is used by
 * useSubscription hook and SubscriptionScreen.
 *
 * TODO: Consolidate @/services/subscription.service into this file to
 * eliminate the naming collision.
 *
 * iOS SAFETY:
 * - Subscription state is server-owned (app never decides validity)
 * - Payment processing and verification happen server-side
 * - App only displays subscription status and gates features
 *
 * DESIGN PRINCIPLE:
 * > The app never decides subscription validity.
 * > The server is the source of truth.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  getUserProfile,
  getUserSubscriptions,
  Frequency,
  SubscriptionStatus as ApiSubscriptionStatus,
  type UserSubscription as ApiUserSubscription,
} from '@/api/auth';
import { initiateUserSubscription } from '@/api/userSubscription';
import { getPlans as getBackendPlans, type BackendPlan } from '@/api/plans';
import {
  Subscription,
  PaymentOrderResult,
  PaymentVerificationResult,
  RazorpayPaymentResponse,
} from './subscription.types';
import { IOSPurchaseService } from './ios-purchase.service';

// SubscriptionPlan interface matching old app
export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'individual' | 'family';
  billing_cycle: 'monthly' | 'yearly';
  price: number;
  currency: string;
  storekitPlanId?: string;
  max_members?: number;
  features: string[];
}

// Plan definitions matching old app structure
const PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_RIADHZ91GxVCUn',
    name: 'Monthly Individual Plan',
    type: 'individual',
    billing_cycle: 'monthly',
    price: 149,
    currency: 'INR',
    features: [
      'Personal safety tracking',
      'Emergency alerts',
      'Unlimited video monitoring',
      'Location sharing'
    ]
  },
  {
    id: 'plan_RIAOwgHa1uhibd',
    name: 'Yearly Individual Plan',
    type: 'individual',
    billing_cycle: 'yearly',
    price: 1699,
    currency: 'INR',
    features: [
      'Personal safety tracking',
      'Emergency alerts',
      'Unlimited video monitoring',
      'Location sharing',
      '2 months free'
    ]
  },
  {
    id: 'plan_RIADmXQMERsApy',
    name: 'Monthly Family plan',
    type: 'family',
    billing_cycle: 'monthly',
    price: 649,
    currency: 'INR',
    max_members: 5,
    features: [
      'Up to 5 family members',
      'Family safety tracking',
      'Emergency alerts',
      'Unlimited video monitoring',
      'Location sharing'
    ]
  },
  {
    id: 'plan_RIAOC4tpe6q41z',
    name: 'Yearly Family Plan',
    type: 'family',
    billing_cycle: 'yearly',
    price: 7199,
    currency: 'INR',
    max_members: 5,
    features: [
      'Up to 5 family members',
      'Family safety tracking',
      'Emergency alerts',
      'Unlimited video monitoring',
      'Location sharing',
      '2 months free'
    ]
  }
];

const ACTIVATION_POLL_ATTEMPTS = 6;
const ACTIVATION_POLL_DELAY_MS = 2000;
let plansCache: SubscriptionPlan[] | null = null;

function toTitleCase(input: string): string {
  return input
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapPlanFeatures(features?: Record<string, unknown>): string[] {
  if (!features || typeof features !== 'object') {
    return [];
  }

  const mapped: string[] = [];
  for (const [key, value] of Object.entries(features)) {
    const label = toTitleCase(key);
    if (value === true) {
      mapped.push(label);
      continue;
    }
    if (value === false || value === null || typeof value === 'undefined') {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) {
        mapped.push(`${label}: ${value.join(', ')}`);
      }
      continue;
    }
    if (typeof value === 'object') {
      mapped.push(label);
      continue;
    }
    mapped.push(`${label}: ${String(value)}`);
  }

  return mapped;
}

function mapBackendPlanType(type: BackendPlan['type']): SubscriptionPlan['type'] {
  if (type === 'FAMILY') return 'family';
  return 'individual';
}

function mapBackendPlanToSubscriptionPlan(plan: BackendPlan): SubscriptionPlan {
  const billingCycle = plan.frequency === 'YEARLY' ? 'yearly' : 'monthly';
  const features = mapPlanFeatures(plan.features);

  return {
    id: plan.id,
    name: plan.name,
    type: mapBackendPlanType(plan.type),
    billing_cycle: billingCycle,
    price: typeof plan.price === 'number' ? plan.price : 0,
    currency: 'INR',
    storekitPlanId: typeof plan.storekitPlanId === 'string' ? plan.storekitPlanId : undefined,
    max_members: plan.noOfUsers && plan.noOfUsers > 1 ? plan.noOfUsers : undefined,
    features: features.length ? features : ['24/7 emergency support', 'Real-time tracking'],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapApiStatusToLocal(status: ApiSubscriptionStatus): Subscription['status'] {
  if (status === ApiSubscriptionStatus.ACTIVE) return 'active';
  return 'expired';
}

function mapApiSubscriptionToLocal(sub: ApiUserSubscription): Subscription {
  const planType = sub.plan?.type === 'FAMILY' ? 'family' : 'individual';
  const billingCycle = sub.plan?.frequency === Frequency.YEARLY ? 'yearly' : 'monthly';

  return {
    id: sub.id,
    user_id: sub.userId,
    plan_id: sub.planId,
    plan_name: sub.plan?.name || 'Plan',
    plan_type: planType,
    billing_cycle: billingCycle,
    price: sub.plan?.price || sub.amount || 0,
    currency: 'INR',
    status: mapApiStatusToLocal(sub.status),
    start_date: new Date(sub.currentPeriodStart).toISOString(),
    end_date: new Date(sub.currentPeriodEnd).toISOString(),
    payment_method: sub.gatewayType,
    payment_id: sub.paymentReference,
    created_at: new Date(sub.createdAt).toISOString(),
    updated_at: new Date(sub.updatedAt).toISOString(),
  };
}

function getLatestActiveSubscription(
  subscriptions: ApiUserSubscription[] | null | undefined
): ApiUserSubscription | null {
  if (!subscriptions?.length) return null;
  const latest = subscriptions.find((s) => s.isLatest) || subscriptions[0];
  if (!latest) return null;

  const isActive =
    latest.status === ApiSubscriptionStatus.ACTIVE &&
    new Date(latest.currentPeriodEnd) > new Date();

  return isActive ? latest : null;
}

/**
 * Subscription Service
 * 
 * Provides methods for subscription operations.
 * All payment processing and verification happens server-side.
 */
export const SubscriptionService = {
  /**
   * Get current active subscription for user
   * 
   * Retrieves the current active subscription from the database.
   * Server is the source of truth - app only reads this.
   * 
   * @returns Current subscription, or null if none exists
   */
  async getCurrentSubscription(): Promise<Subscription | null> {
    try {
      const subscriptions = await getUserSubscriptions();
      const active = getLatestActiveSubscription(subscriptions);
      return active ? mapApiSubscriptionToLocal(active) : null;
    } catch (error) {
      console.error('[Subscription Service] Error getting current subscription:', error);
      return null;
    }
  },

  /**
   * Check if user has active subscription
   * 
   * @returns true if user has active subscription
   */
  async hasActiveSubscription(): Promise<boolean> {
    const subscription = await this.getCurrentSubscription();
    return subscription !== null;
  },

  /**
   * Create Razorpay payment order
   * 
   * Creates a payment order on the server for the selected plan.
   * Server creates the Razorpay order and returns order details.
   * 
   * @param plan Subscription plan to purchase
   * @returns Payment order result with order ID and amount
   */
  async createPaymentOrder(
    plan: SubscriptionPlan,
    opts?: { couponCode?: string }
  ): Promise<PaymentOrderResult> {
    try {
      if (Platform.OS === 'android') {
        const me = await getUserProfile();
        const userId = (me as any)?.id || (me as any)?.userId || null;

        if (!userId) {
          return {
            success: false,
            error: 'User not authenticated',
          };
        }

        const initiated = await initiateUserSubscription({
          userId: String(userId),
          planId: plan.id,
          type: 'PAID',
          gatewayType: 'RAZORPAY',
          offerCode: opts?.couponCode,
        });

        if (!initiated.paymentRequired) {
          return {
            success: false,
            error: 'No payment required for this subscription type',
          };
        }

        const payload = initiated.paymentGatewayPayload;
        if (!payload?.subscriptionId || !payload?.keyId) {
          return {
            success: false,
            error: 'Invalid payment payload from backend',
          };
        }

        return {
          success: true,
          orderId: payload.subscriptionId,
          amount: typeof payload.amount === 'number' ? payload.amount : plan.price,
          currency: payload.currency || 'INR',
          keyId: payload.keyId,
          localSubscriptionId: initiated.id,
          gatewaySubscriptionId: payload.subscriptionId,
        };
      }

      return {
        success: false,
        error: 'Direct payment order creation is only enabled for Android backend flow.',
      };
    } catch (error: any) {
      console.error('[Subscription Service] Error creating payment order:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Process payment (platform-aware)
   * 
   * Routes to iOS StoreKit on iOS, Razorpay on Android.
   * 
   * @param orderId Payment order ID (for Razorpay only)
   * @param amount Payment amount (for Razorpay only)
   * @param currency Payment currency (for Razorpay only)
   * @param plan Subscription plan being purchased
   * @returns Payment verification result
   */
  async processPayment(
    orderId: string,
    amount: number,
    currency: string,
    plan: SubscriptionPlan,
    opts?: {
      prefill?: { email?: string; contact?: string; name?: string };
      keyId?: string;
      localSubscriptionId?: string;
    }
  ): Promise<PaymentVerificationResult> {
    // iOS: Use StoreKit
    if (Platform.OS === 'ios') {
      return await this.processIOSPayment(plan);
    }

    // Android: Use Razorpay
    return await this.processRazorpayPayment(orderId, amount, currency, plan, opts);
  },

  /**
   * Process iOS payment using StoreKit
   * 
   * @param plan Subscription plan being purchased
   * @returns Payment verification result
   */
  async processIOSPayment(
    plan: SubscriptionPlan
  ): Promise<PaymentVerificationResult> {
    try {
      console.log('[Subscription Service] Processing iOS payment for plan:', plan.id);
      return await IOSPurchaseService.purchaseSubscription(plan);
    } catch (error: any) {
      console.error('[Subscription Service] iOS payment failed:', error);
      return {
        success: false,
        error: error.message || 'iOS payment failed',
      };
    }
  },

  /**
   * Process Razorpay payment (Android)
   * 
   * Opens Razorpay checkout and processes payment.
   * Payment verification happens server-side.
   * 
   * @param orderId Razorpay order ID
   * @param amount Payment amount
   * @param currency Payment currency
   * @param plan Subscription plan being purchased
   * @returns Payment verification result
   */
  async processRazorpayPayment(
    orderId: string,
    amount: number,
    currency: string,
    plan: SubscriptionPlan,
    opts?: {
      prefill?: { email?: string; contact?: string; name?: string };
      keyId?: string;
      localSubscriptionId?: string;
    }
  ): Promise<PaymentVerificationResult> {
    try {
      if (Platform.OS !== 'android') {
        return {
          success: false,
          error: 'Razorpay payments are only available on Android',
        };
      }

      // Get Razorpay key from environment/config
      // This should be stored securely (e.g., in environment variables)
      const extra = (Constants?.expoConfig?.extra as any) || {};
      const keyFromExtra = typeof extra?.razorpayKeyId === 'string' ? extra.razorpayKeyId : '';
      const keyFromBackend = typeof opts?.keyId === 'string' ? opts.keyId.trim() : '';
      const RAZORPAY_KEY = String(keyFromBackend || process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || keyFromExtra || '').trim();

      if (!RAZORPAY_KEY) {
        return {
          success: false,
          error:
            'Razorpay key not configured. Set EXPO_PUBLIC_RAZORPAY_KEY_ID and rebuild the Android app.',
        };
      }

      // Razorpay checkout: subscription mandate (recurring billing)
      const subscriptionId = orderId; // legacy parameter name in app
      const prefill = opts?.prefill || {};

      const options = {
        description: `Subscription: ${plan.name}`,
        image: undefined, // Add app logo if available
        currency: currency,
        key: RAZORPAY_KEY,
        name: 'DeepHorizon Security',
        subscription_id: subscriptionId,
        prefill: {
          email: prefill.email || '',
          contact: prefill.contact || '',
          name: prefill.name || '',
        },
        theme: { color: '#000000' },
      };

      // Dynamic import so iOS bundles don't load/attempt to link Razorpay at runtime
      const RazorpayModule = await import('react-native-razorpay');
      const RazorpayCheckout: any = (RazorpayModule as any).default || RazorpayModule;
      if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
        return {
          success: false,
          error: 'Razorpay module not available',
        };
      }

      const paymentResponse = await RazorpayCheckout.open(options);

      // Payment successful - verify with server
      // Server must verify Razorpay signature server-side
      const verificationResult = await this.verifyPayment({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_subscription_id: paymentResponse.razorpay_subscription_id,
        razorpay_order_id: paymentResponse.razorpay_order_id, // optional/legacy
        razorpay_signature: paymentResponse.razorpay_signature,
        plan,
      });

      return verificationResult;
    } catch (error: any) {
      // User cancelled or payment failed
      if (error?.code === 'BAD_REQUEST_ERROR' || error?.code === 'NETWORK_ERROR') {
        return {
          success: false,
          error: 'Payment cancelled or failed',
        };
      }

      console.error('[Subscription Service] Error processing payment:', error);
      return {
        success: false,
        error: error.message || 'Payment processing failed',
      };
    }
  },

  /**
   * Verify payment with server
   * 
   * Sends payment response to server for verification.
   * Server verifies Razorpay signature and activates subscription.
   * 
   * @param paymentResponse Razorpay payment response
   * @param plan Subscription plan
   * @returns Payment verification result with activated subscription
   */
  async verifyPayment(
    paymentResponse: RazorpayPaymentResponse & { plan: SubscriptionPlan }
  ): Promise<PaymentVerificationResult> {
    try {
      if (Platform.OS === 'android') {
        for (let attempt = 1; attempt <= ACTIVATION_POLL_ATTEMPTS; attempt++) {
          const subscriptions = await getUserSubscriptions();
          const active = getLatestActiveSubscription(subscriptions);

          if (active) {
            return {
              success: true,
              subscription: mapApiSubscriptionToLocal(active),
            };
          }

          if (attempt < ACTIVATION_POLL_ATTEMPTS) {
            await sleep(ACTIVATION_POLL_DELAY_MS);
          }
        }

        return {
          success: false,
          error: 'Payment received. Subscription is activating. Please wait a moment and refresh.',
        };
      }

      return {
        success: false,
        error: 'Payment verification is handled via backend webhook polling flow.',
      };
    } catch (error: any) {
      console.error('[Subscription Service] Error verifying payment:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Get all subscriptions for user (including inactive)
   * 
   * @returns Array of subscriptions
   */
  async getAllSubscriptions(): Promise<Subscription[]> {
    try {
      const subscriptions = await getUserSubscriptions();
      return (subscriptions || []).map(mapApiSubscriptionToLocal);
    } catch (error) {
      console.error('[Subscription Service] Error getting subscriptions:', error);
      return [];
    }
  },

  /**
   * Fetch plans from backend and update in-memory cache.
   * Falls back to hardcoded plans if backend fetch fails.
   */
  async fetchPlans(): Promise<SubscriptionPlan[]> {
    try {
      const backendPlans = await getBackendPlans();
      const paidPlans = backendPlans.filter((p) => !p.isDefault);
      const sourcePlans = paidPlans.length > 0 ? paidPlans : backendPlans;

      if (!sourcePlans.length) {
        plansCache = PLANS;
        return plansCache;
      }

      plansCache = sourcePlans.map(mapBackendPlanToSubscriptionPlan);
      return plansCache;
    } catch (error) {
      console.warn('[Subscription Service] Failed to fetch plans from backend, using fallback:', error);
      plansCache = PLANS;
      return plansCache;
    }
  },

  /**
   * Get all available subscription plans
   */
  getPlans(): SubscriptionPlan[] {
    return plansCache ?? PLANS;
  },

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    const plans = plansCache ?? PLANS;
    return plans.find(plan => plan.id === planId);
  },

  /**
   * Get trial status and end date for users without subscription
   */
  async getTrialStatus(): Promise<{ 
    isTrialActive: boolean; 
    trialEndDate: Date | null; 
    daysRemaining: number;
    error: string | null 
  }> {
    try {
      const me = await getUserProfile();
      const userId = (me as any)?.id || (me as any)?.userId || null;
      if (!userId) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: 'User not authenticated' };
      }

      // Check for active subscription
      const subscriptions = await getUserSubscriptions();
      const activeSub = getLatestActiveSubscription(subscriptions);

      if (activeSub) {
        // User has active subscription, no trial
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }

      const trialStartRaw =
        (me as any)?.trial_start_date ||
        (me as any)?.trialStartDate ||
        null;

      if (!trialStartRaw) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }

      const trialStart = new Date(String(trialStartRaw));
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + 7); // 7-day trial
      const now = new Date();
      const isTrialActive = now < trialEnd;
      const daysRemaining = isTrialActive ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

      return { 
        isTrialActive, 
        trialEndDate: trialEnd, 
        daysRemaining,
        error: null 
      };
    } catch (error: any) {
      console.error('Error getting trial status:', error);
      return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: error.message };
    }
  },
};

