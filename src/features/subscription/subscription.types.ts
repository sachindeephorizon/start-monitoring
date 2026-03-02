/**
 * Subscription Types
 * 
 * Type definitions for subscription and payment functionality.
 * 
 * iOS SAFETY: Subscription state is server-owned. The app only reads
 * subscription status and gates features accordingly. Payment processing
 * and verification happen server-side.
 */

/**
 * Subscription plan types
 * 
 * These match the plan IDs used in the database and payment gateway.
 */
export type SubscriptionPlanId =
  | 'individual_monthly'
  | 'individual_yearly'
  | 'family_monthly'
  | 'family_yearly';

/**
 * Subscription status values
 * 
 * These match the database schema.
 */
export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'expired'
  | 'trial';

/**
 * Subscription billing cycle
 */
export type BillingCycle = 'monthly' | 'yearly';

/**
 * Subscription plan type
 */
export type PlanType = 'individual' | 'family';

/**
 * Subscription record from database
 */
export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  plan_type?: PlanType;
  billing_cycle?: BillingCycle;
  price: number;
  currency: string;
  status: SubscriptionStatus;
  trial_start_date?: string;
  trial_end_date?: string;
  start_date: string;
  end_date?: string;
  renewal_date?: string;
  payment_method?: string;
  payment_id?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Subscription plan details
 */
export interface SubscriptionPlanDetails {
  id: SubscriptionPlanId;
  name: string;
  type: PlanType;
  billingCycle: BillingCycle;
  price: number;
  currency: string;
  features: SubscriptionFeatures;
  description?: string;
}

/**
 * Subscription features
 * 
 * Defines which features are available in a subscription.
 * Currently all plans have the same features.
 */
export interface SubscriptionFeatures {
  tracking: boolean;
  emergency: boolean;
  checkins: boolean;
  chat: boolean;
  audio_calls: boolean;
  video_calls: boolean;
  bodyguard_booking: boolean;
  video_sessions_per_month?: number; // Number of video sessions allowed per month
}

/**
 * Payment order creation result
 */
export interface PaymentOrderResult {
  success: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

/**
 * Payment verification result
 */
export interface PaymentVerificationResult {
  success: boolean;
  subscription?: Subscription;
  error?: string;
}

/**
 * Razorpay payment response
 * 
 * Structure of response from Razorpay SDK
 */
export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_signature: string;
  // Orders flow (one-time payments)
  razorpay_order_id?: string;
  // Subscriptions flow (mandate / recurring)
  razorpay_subscription_id?: string;
}

