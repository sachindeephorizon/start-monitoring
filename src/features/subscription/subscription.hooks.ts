/**
 * Subscription Hooks
 * 
 * React hooks for subscription functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { SubscriptionService } from './subscription.service';
import {
  Subscription,
  PaymentVerificationResult,
} from './subscription.types';
import type { SubscriptionPlan } from './subscription.service';

/**
 * Hook for subscription operations
 * 
 * Provides methods to check subscription status and process payments.
 * 
 * @returns Subscription state and methods
 */
export function useSubscription() {
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load current subscription
   */
  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const currentSubscription = await SubscriptionService.getCurrentSubscription();
      setSubscription(currentSubscription);
    } catch (err: any) {
      console.error('[Subscription Hook] Error loading subscription:', err);
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load subscription on mount
   */
  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  /**
   * Purchase subscription
   * 
   * Platform-aware: Uses StoreKit on iOS, Razorpay on Android.
   * 
   * @param plan Subscription plan to purchase
   * @returns Payment verification result
   */
  const purchaseSubscription = useCallback(
    async (
      plan: SubscriptionPlan,
      opts?: { couponCode?: string; prefill?: { email?: string; contact?: string; name?: string } }
    ): Promise<PaymentVerificationResult> => {
      setLoading(true);
      setError(null);

      try {
        // iOS: Use StoreKit directly (no order creation needed)
        if (Platform.OS === 'ios') {
          console.log('[Subscription Hook] Processing iOS purchase');
          const paymentResult = await SubscriptionService.processPayment(
            '', // No order ID needed for iOS
            0,  // No amount needed for iOS
            '', // No currency needed for iOS
            plan
          );

          // Refresh subscription if payment successful
          if (paymentResult.success && paymentResult.subscription) {
            setSubscription(paymentResult.subscription);
          }

          return paymentResult;
        }

        // Android: Use Razorpay (create order first)
        // Step 1: Create payment order on server
        const orderResult = await SubscriptionService.createPaymentOrder(plan, {
          couponCode: opts?.couponCode,
        });

        if (!orderResult.success || !orderResult.orderId) {
          return {
            success: false,
            error: orderResult.error || 'Failed to create payment order',
          };
        }

        // Step 2: Process payment with Razorpay
        const paymentResult = await SubscriptionService.processPayment(
          orderResult.orderId,
          orderResult.amount!,
          orderResult.currency!,
          plan,
          { prefill: opts?.prefill }
        );

        // Step 3: Refresh subscription if payment successful
        if (paymentResult.success && paymentResult.subscription) {
          setSubscription(paymentResult.subscription);
        }

        return paymentResult;
      } catch (err: any) {
        console.error('[Subscription Hook] Error purchasing subscription:', err);
        const errorMessage = err.message || 'Failed to purchase subscription';
        setError(errorMessage);
        return {
          success: false,
          error: errorMessage,
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Refresh subscription status
   */
  const refreshSubscription = useCallback(() => {
    loadSubscription();
  }, [loadSubscription]);

  return {
    loading,
    subscription,
    error,
    hasActiveSubscription: subscription !== null,
    purchaseSubscription,
    refreshSubscription,
  };
}

