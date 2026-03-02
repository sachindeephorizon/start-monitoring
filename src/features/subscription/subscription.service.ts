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
import { supabase, ensureValidSession } from '@/lib/supabase';
import {
  Subscription,
  PaymentOrderResult,
  PaymentVerificationResult,
  RazorpayPaymentResponse,
} from './subscription.types';
import { SUBSCRIPTION_PLANS } from './subscription.constants';
import { IOSPurchaseService } from './ios-purchase.service';

// SubscriptionPlan interface matching old app
export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'individual' | 'family';
  billing_cycle: 'monthly' | 'yearly';
  price: number;
  currency: string;
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

/**
 * Subscription Service
 * 
 * Provides methods for subscription operations.
 * All payment processing and verification happens server-side.
 */
export const SubscriptionService = {
  // iOS: keep server state in sync with StoreKit entitlements.
  // This prevents users from being incorrectly treated as "trial expired" after a successful App Store purchase
  // (e.g. if the app was killed before verification completed, or the user reinstalls).
  //
  // We rate-limit sync to avoid repeated network calls on startup when multiple screens check entitlement.
  _iosSyncInFlight: null as Promise<void> | null,
  _iosLastSyncAtMs: 0,
  async _maybeSyncIosPurchases(): Promise<void> {
    if (Platform.OS !== 'ios') return;

    const now = Date.now();
    const MIN_INTERVAL_MS = 30_000;
    if (this._iosSyncInFlight) {
      await this._iosSyncInFlight;
      return;
    }
    if (now - this._iosLastSyncAtMs < MIN_INTERVAL_MS) {
      return;
    }

    this._iosLastSyncAtMs = now;
    this._iosSyncInFlight = (async () => {
      try {
        // Sync active StoreKit purchases -> backend (verify_ios_purchase edge function will upsert user_subscriptions)
        await IOSPurchaseService.syncPurchasesWithServer();
      } catch (e) {
        // Non-fatal: we fall back to DB/trial checks
        console.warn('[Subscription Service] iOS entitlement sync failed (non-fatal):', e);
      }
    })();

    try {
      await this._iosSyncInFlight;
    } finally {
      this._iosSyncInFlight = null;
    }
  },

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
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        // iOS: if DB doesn't reflect purchase yet, attempt a one-shot entitlement sync.
        // This is critical for cases where StoreKit shows the subscription (Settings -> Subscriptions)
        // but our backend record isn't created/updated yet.
        if (Platform.OS === 'ios') {
          await this._maybeSyncIosPurchases();
          const { data: synced, error: syncedErr } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!syncedErr && synced) return synced as Subscription;
        }
        return null;
      }

      return data as Subscription;
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
      // Call server function to create Razorpay order
      // The server function should:
      // 1. Create Razorpay order
      // 2. Store order details
      // 3. Return order ID and amount
      const { data, error } = await supabase.functions.invoke('create_razorpay_order', {
        body: { plan, couponCode: opts?.couponCode || null },
      });

      // Edge function may return 200 with success:false for upstream (Razorpay) failures.
      if (data && typeof (data as any).success === 'boolean' && (data as any).success === false) {
        const msg =
          (typeof (data as any).error === 'string' && (data as any).error) ||
          'Failed to create payment order';
        if (__DEV__ && typeof (data as any).details === 'string') {
          console.warn('[Subscription Service] create_razorpay_order details:', (data as any).details);
        }
        return { success: false, error: msg };
      }

      if (error) {
        // Supabase Functions errors often contain useful HTTP context but the default message is generic.
        // Extract best-effort details for actionable debugging (and production support).
        const anyErr = error as any;
        const status =
          typeof anyErr?.context?.status === 'number'
            ? anyErr.context.status
            : typeof anyErr?.context?.response?.status === 'number'
              ? anyErr.context.response.status
              : undefined;
        const bodyText =
          typeof anyErr?.context?.body === 'string'
            ? anyErr.context.body
            : typeof anyErr?.context?.responseText === 'string'
              ? anyErr.context.responseText
              : undefined;

        let serverMessage: string | null = null;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            serverMessage =
              (typeof parsed?.error === 'string' && parsed.error) ||
              (typeof parsed?.message === 'string' && parsed.message) ||
              null;
            // If edge function provides diagnostic details, append a short snippet for dev logs.
            if (__DEV__ && typeof parsed?.details === 'string' && parsed.details) {
              console.warn('[Subscription Service] Edge function details:', parsed.details);
            }
          } catch {
            serverMessage = bodyText.slice(0, 200);
          }
        }

        console.error('[Subscription Service] Failed to create payment order:', {
          name: anyErr?.name,
          message: anyErr?.message,
          status,
          serverMessage,
        });

        if (status === 401) {
          return {
            success: false,
            error: 'Your session has expired. Please log out and log in again, then retry the payment.',
          };
        }
        return {
          success: false,
          error:
            serverMessage ||
            (typeof status === 'number'
              ? `Payment server error (${status}). Please try again.`
              : (error as any).message || 'Failed to create payment order'),
        };
      }

      // For recurring subscriptions we return `subscriptionId`, but we also keep `orderId` as a legacy alias.
      const orderId = data?.subscriptionId || data?.orderId;
      if (!orderId) {
        return {
          success: false,
          error: 'Invalid response from server',
        };
      }

      return {
        success: true,
        orderId: orderId,
        // For subscription checkout, amount is not required, but we keep it for UI / logs.
        amount: typeof data.amount === 'number' ? data.amount : plan.price,
        currency: data.currency || 'INR',
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
    opts?: { prefill?: { email?: string; contact?: string; name?: string } }
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
    opts?: { prefill?: { email?: string; contact?: string; name?: string } }
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
      const RAZORPAY_KEY = String(process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || keyFromExtra || '').trim();

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
      // Subscriptions flow requires subscription id
      if (!paymentResponse.razorpay_subscription_id) {
        return {
          success: false,
          error: 'Missing Razorpay subscription id in payment response',
        };
      }

      // Call server function to verify payment
      // The server function should:
      // 1. Verify Razorpay signature
      // 2. Create/update subscription in database
      // 3. Return subscription details
      const { data, error } = await supabase.functions.invoke('verify_razorpay_payment', {
        body: paymentResponse,
      });

      // Edge function may return 200 with success:false for upstream (Razorpay) failures / pending states.
      if (data && typeof (data as any).success === 'boolean' && (data as any).success === false) {
        const msg =
          (typeof (data as any).error === 'string' && (data as any).error) ||
          'Payment verification failed';
        if (__DEV__ && typeof (data as any).details === 'string') {
          console.warn('[Subscription Service] verify_razorpay_payment details:', (data as any).details);
        }
        return { success: false, error: msg };
      }

      if (error) {
        console.error('[Subscription Service] Payment verification failed:', error);
        return {
          success: false,
          error: error.message || 'Payment verification failed',
        };
      }

      if (!data?.subscription) {
        return {
          success: false,
          error: 'Subscription not activated',
        };
      }

      return {
        success: true,
        subscription: data.subscription as Subscription,
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
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return [];
      }

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data as Subscription[];
    } catch (error) {
      console.error('[Subscription Service] Error getting subscriptions:', error);
      return [];
    }
  },

  /**
   * Get all available subscription plans
   */
  getPlans(): SubscriptionPlan[] {
    return PLANS;
  },

  /**
   * Get plan by ID
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return PLANS.find(plan => plan.id === planId);
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
      const session = await ensureValidSession();
      const user = session?.user || null;
      if (!user) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: 'User not authenticated' };
      }

      // Check for active subscription
      const { data: activeSub } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (activeSub) {
        // User has active subscription, no trial
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }

      // iOS: if DB says no subscription, do a one-shot entitlement sync before concluding trial status.
      // This avoids false "trial expired" when the App Store subscription exists but backend sync lagged.
      if (Platform.OS === 'ios') {
        await this._maybeSyncIosPurchases();
        const { data: activeAfterSync } = await supabase
          .from('user_subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (activeAfterSync) {
          return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
        }
      }

      // Check trial_start_date in mobile_users
      const { data: mobileUser } = await supabase
        .from('mobile_users')
        .select('trial_start_date')
        .eq('id', user.id)
        .maybeSingle();

      if (!mobileUser?.trial_start_date) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }

      const trialStart = new Date(mobileUser.trial_start_date);
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

