/**
 * Subscription Constants
 * 
 * Constants for subscription plans, pricing, and features.
 * 
 * iOS SAFETY: UI wording follows App Store guidelines for real-world services.
 */

import {
  SubscriptionPlanId,
  SubscriptionPlanDetails,
  SubscriptionFeatures,
} from './subscription.types';

/**
 * Subscription features available in all plans
 */
export const PLAN_FEATURES: SubscriptionFeatures = {
  tracking: true,
  emergency: true,
  checkins: true,
  chat: true,
  audio_calls: true,
  video_calls: true,
  bodyguard_booking: true,
  video_sessions_per_month: Infinity, // Unlimited — no session limits
};

/**
 * Subscription plan details
 * 
 * These match the plans defined in the PRD.
 * Prices are in INR (Indian Rupees).
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlanId, SubscriptionPlanDetails> = {
  individual_monthly: {
    id: 'individual_monthly',
    name: 'Monthly Individual Plan',
    type: 'individual',
    billingCycle: 'monthly',
    price: 149,
    currency: 'INR',
    features: PLAN_FEATURES,
    description: 'Personal safety tracking and emergency response',
  },
  individual_yearly: {
    id: 'individual_yearly',
    name: 'Yearly Individual Plan',
    type: 'individual',
    billingCycle: 'yearly',
    price: 1699,
    currency: 'INR',
    features: PLAN_FEATURES,
    description: 'Personal safety tracking and emergency response (2 months free)',
  },
  family_monthly: {
    id: 'family_monthly',
    name: 'Monthly Family Plan',
    type: 'family',
    billingCycle: 'monthly',
    price: 649,
    currency: 'INR',
    features: PLAN_FEATURES,
    description: 'Safety protection for up to 5 family members',
  },
  family_yearly: {
    id: 'family_yearly',
    name: 'Yearly Family Plan',
    type: 'family',
    billingCycle: 'yearly',
    price: 7199,
    currency: 'INR',
    features: PLAN_FEATURES,
    description: 'Safety protection for up to 5 family members (2 months free)',
  },
};

/**
 * Plan IDs used in database and payment gateway
 * 
 * These map to the plan_id field in user_subscriptions table.
 */
export const PLAN_IDS: Record<SubscriptionPlanId, string> = {
  individual_monthly: 'plan_individual_monthly',
  individual_yearly: 'plan_individual_yearly',
  family_monthly: 'plan_family_monthly',
  family_yearly: 'plan_family_yearly',
};

/**
 * UI Labels (App Store Compliant)
 * 
 * These labels use wording that complies with App Store guidelines
 * for real-world services (security, emergency, safety services).
 * 
 * ❌ DO NOT use: "Buy subscription", "Monthly plan", "Digital service"
 * ✅ DO use: "Activate safety service", "Security plan", "Emergency protection"
 */
export const UI_LABELS = {
  activateButton: 'Activate Safety Service',
  securityPlan: 'Security Plan',
  emergencyProtection: 'Emergency Protection Service',
  activateNow: 'Activate Now',
  selectPlan: 'Select Security Plan',
  currentPlan: 'Active Security Service',
  subscriptionRequired: 'Safety service subscription required',
};

