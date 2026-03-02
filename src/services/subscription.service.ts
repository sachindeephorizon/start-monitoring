/**
 * LEGACY Subscription Service (src/services/)
 *
 * Contains: subscription CRUD, family members, trial status, plan definitions,
 * video session limits.
 *
 * Consumers: useSubscription hook, SubscriptionScreen, subscriptionAccess util,
 * ManageSubscriptionModal.
 *
 * NOTE: There is a SEPARATE service at @/features/subscription/subscription.service
 * that handles payment processing (iOS StoreKit, Razorpay), plan definitions,
 * and subscription queries for AuthGuard and payment screens.
 *
 * TODO: Consolidate both services into @/features/subscription/ to eliminate
 * naming collision and reduce confusion. The features/ version should be
 * the canonical location.
 */
import { supabase, ensureValidSession } from '@/lib/supabase';
import { AuthService } from '@/core/auth/auth.service';
import { Platform } from 'react-native';
import { apiBaseUrl } from '@/config/environment';

// Video/audio call session limits have been removed.
// Access is gated by subscription/trial status only.

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

export interface FamilyMember {
  id: string;
  subscription_id: string;
  phone: string;
  name?: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  activated_at?: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: 'active' | 'expired' | 'cancelled';
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export class SubscriptionService {
  // iOS: keep server state in sync with Apple subscription changes (cancel/reactivate)
  // without relying solely on App Store Server Notifications timing.
  private static _iosStatusSyncInFlight: Promise<void> | null = null;
  private static _iosLastStatusSyncAtMs = 0;

  static async syncIosSubscriptionStatus(force: boolean = false): Promise<void> {
    if (Platform.OS !== 'ios') return;

    const now = Date.now();
    const MIN_INTERVAL_MS = 20_000;
    if (!force && now - this._iosLastStatusSyncAtMs < MIN_INTERVAL_MS) return;
    if (this._iosStatusSyncInFlight) {
      await this._iosStatusSyncInFlight;
      return;
    }

    this._iosLastStatusSyncAtMs = now;
    this._iosStatusSyncInFlight = (async () => {
      try {
        await supabase.functions.invoke('sync_ios_subscription_status', { body: {} });
      } catch (e) {
        // Non-fatal: UI will still show last-known DB state
        console.warn('[SubscriptionService] iOS status sync failed (non-fatal):', e);
      }
    })();

    try {
      await this._iosStatusSyncInFlight;
    } finally {
      this._iosStatusSyncInFlight = null;
    }
  }

  private static getSessionUserPhone(sessionUser: any): string | null {
    const meta = (sessionUser?.user_metadata || {}) as any;
    const phone =
      sessionUser?.phone ||
      meta?.phone ||
      meta?.phone_number ||
      meta?.phoneNumber ||
      null;
    return phone ? String(phone) : null;
  }

  // Development emails that bypass subscription checks
  static readonly DEVELOPMENT_EMAILS: string[] = [
    // Removed sidhantmedhi8@gmail.com - no longer bypassing subscription checks
    // 'testuser@gmail.com', // Keep testuser if needed, or remove
  ];

  // Available subscription plans (using real plan IDs from payment system)
  static readonly PLANS: SubscriptionPlan[] = [
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
   * Get all available subscription plans
   */
  static getPlans(): SubscriptionPlan[] {
    return this.PLANS;
  }

  /**
   * Get plan by ID
   */
  static getPlan(planId: string): SubscriptionPlan | undefined {
    return this.PLANS.find(plan => plan.id === planId);
  }

  /**
   * Robustly detect whether a subscription should be treated as a family plan.
   *
   * Why: UI currently gates Family features on `currentPlan.type === 'family'`.
   * If backend plan_id changes (or isn't in the hardcoded list), `currentPlan` becomes null
   * even when the subscription is active. We infer family-ness by presence of any
   * `family_members` row referencing this subscription id.
   */
  static async isFamilySubscription(subscriptionId: string): Promise<boolean> {
    if (!subscriptionId) return false;
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('id')
        .eq('subscription_id', subscriptionId)
        .limit(1)
        .maybeSingle();

      if (error && (error as any).code !== 'PGRST116') {
        return false;
      }
      return !!data?.id;
    } catch {
      return false;
    }
  }

  static getFallbackPlan(planId: string, type: 'individual' | 'family'): SubscriptionPlan {
    return {
      id: planId || 'unknown',
      name: type === 'family' ? 'Family Plan' : 'Individual Plan',
      type,
      billing_cycle: 'monthly',
      price: 0,
      currency: 'INR',
      max_members: type === 'family' ? 5 : undefined,
      features: [],
    };
  }

  /**
   * Fetch subscription via dashboard proxy (when direct Supabase is unreachable).
   * Returns same shape as getUserSubscription().
   */
  private static async _getUserSubscriptionViaProxy(
    accessToken: string
  ): Promise<{ subscription: UserSubscription | null; error: string | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${apiBaseUrl}/api/mobile/subscription`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn('[SubscriptionService] Proxy fetch error:', res.status);
        return { subscription: null, error: `Proxy error: ${res.status}` };
      }

      const json = await res.json();
      const data = json?.data || json;
      const subscription = data?.subscription ?? null;
      if (subscription) {
        console.log('[SubscriptionService] Subscription fetched via dashboard proxy');
      }
      return { subscription, error: null };
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.warn('[SubscriptionService] Proxy fetch failed:', e?.message);
      return { subscription: null, error: e?.message || 'Proxy fetch failed' };
    }
  }

  /**
   * Fetch trial status via dashboard proxy.
   * Returns same shape as getTrialStatus().
   */
  private static async _getTrialStatusViaProxy(
    accessToken: string
  ): Promise<{ isTrialActive: boolean; trialEndDate: Date | null; daysRemaining: number; error: string | null }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8_000);
    try {
      const res = await fetch(`${apiBaseUrl}/api/mobile/subscription`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: `Proxy error: ${res.status}` };
      }

      const json = await res.json();
      const data = json?.data || json;
      const trial = data?.trialStatus;

      if (trial) {
        console.log('[SubscriptionService] Trial status fetched via dashboard proxy');
        return {
          isTrialActive: !!trial.isTrialActive,
          trialEndDate: trial.trialEndDate ? new Date(trial.trialEndDate) : null,
          daysRemaining: typeof trial.daysRemaining === 'number' ? trial.daysRemaining : 0,
          error: null,
        };
      }

      // If subscription exists in proxy response, trial is not active
      if (data?.subscription) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }

      return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
    } catch (e: any) {
      clearTimeout(timeoutId);
      return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: e?.message || 'Proxy fetch failed' };
    }
  }

  /**
   * Direct Supabase subscription fetch (extracted for timeout wrapping).
   */
  private static async _getUserSubscriptionDirect(
    sessionUser: any
  ): Promise<{ subscription: UserSubscription | null; error: string | null }> {
    // iOS-only fast path: avoid AuthService.getCurrentUser() (which queries mobile_users)
    // and avoid extra debug queries. This reduces the chance of iOS request stalls.
    if (Platform.OS === 'ios') {
      if (!sessionUser?.id) {
        throw new Error('User not authenticated');
      }

      // Direct subscription
      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', sessionUser.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      if (subscription) {
        return { subscription, error: null };
      }

      // Family membership via phone from session metadata (no mobile_users read)
      const phone = this.getSessionUserPhone(sessionUser);
      if (phone) {
        const { data: member, error: memberErr } = await supabase
          .from('family_members')
          .select('*')
          .eq('phone', phone)
          .eq('is_active', true)
          .maybeSingle();

        if (memberErr && memberErr.code !== 'PGRST116') {
          return { subscription: null, error: null };
        }

        if (member?.subscription_id) {
          const { data: familySubscription, error: familyError } = await supabase
            .from('user_subscriptions')
            .select('*')
            .eq('id', member.subscription_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (familyError && familyError.code !== 'PGRST116') {
            return { subscription: null, error: null };
          }

          if (familySubscription) {
            return { subscription: familySubscription, error: null };
          }
        }
      }

      return { subscription: null, error: null };
    }

    // Non-iOS path
    const user = await AuthService.getCurrentUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    if (__DEV__) {
      console.log('Getting subscription for user:', user.id, user.email);
    }

    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (__DEV__) {
        console.error('Error fetching active subscription:', {
          code: (error as any).code,
          message: (error as any).message,
          details: (error as any).details,
          hint: (error as any).hint
        });
      }
      if (error.code !== 'PGRST116') {
        throw error;
      }
    }

    if (subscription) {
      if (__DEV__) console.log('Found direct subscription:', subscription.id, 'plan:', subscription.plan_id);
      return { subscription, error: null };
    }

    if (__DEV__) console.log('No direct subscription found, checking family membership...');

    const phone = user.phone || this.getSessionUserPhone(sessionUser);
    if (phone) {
      const { hasAccess, member } = await this.checkFamilyAccess(phone);

      if (hasAccess && member) {
        if (__DEV__) console.log('User is a family member, fetching family subscription...');
        const { data: familySubscription, error: familyError } = await supabase
          .from('user_subscriptions')
          .select('*')
          .eq('id', member.subscription_id)
          .eq('status', 'active')
          .maybeSingle();

        if (familyError && familyError.code !== 'PGRST116') {
          if (__DEV__) console.error('Error fetching family subscription:', familyError);
          return { subscription: null, error: null };
        }

        if (familySubscription) {
          if (__DEV__) console.log('Found family subscription:', familySubscription.id, 'plan:', familySubscription.plan_id);
          return { subscription: familySubscription, error: null };
        }
      } else {
        if (__DEV__) console.log('User is not a family member or no access');
      }
    } else {
      if (__DEV__) console.log('User has no phone number set');
    }

    if (__DEV__) console.log('No subscription found');
    return { subscription: null, error: null };
  }

  /**
   * Get user's current subscription
   * Also checks if user is a family member and returns the family subscription.
   * Proxy-first: uses dashboard API (always reachable via Vercel), falls back to direct Supabase.
   */
  static async getUserSubscription(): Promise<{ subscription: UserSubscription | null; error: string | null }> {
    try {
      const session = await ensureValidSession();
      const sessionUser = session?.user || null;
      const accessToken = (session as any)?.access_token;

      // Proxy-first: dashboard API is always reachable via Vercel
      if (accessToken) {
        const proxyResult = await this._getUserSubscriptionViaProxy(accessToken);
        if (!proxyResult.error) {
          return proxyResult;
        }
        console.warn('[SubscriptionService] Proxy failed, falling back to direct Supabase:', proxyResult.error);
      }

      // Fallback: try direct Supabase
      return await this._getUserSubscriptionDirect(sessionUser);
    } catch (error: any) {
      console.error('Error fetching user subscription:', error);
      return { subscription: null, error: error.message };
    }
  }

  /**
   * Direct Supabase trial status fetch (extracted for timeout wrapping).
   */
  private static async _getTrialStatusDirect(
    user: any
  ): Promise<{ isTrialActive: boolean; trialEndDate: Date | null; daysRemaining: number; error: string | null }> {
    // iOS-only: avoid calling getUserSubscription() here (it can be expensive and recursive).
    // Just check active subscription directly.
    if (Platform.OS === 'ios') {
      const { data: activeSub, error: subCheckErr } = await supabase
        .from('user_subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      // Throw on network errors so proxy fallback can trigger
      if (subCheckErr && subCheckErr.code !== 'PGRST116') {
        throw subCheckErr;
      }
      if (activeSub) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }
    } else {
      const { subscription } = await this.getUserSubscription();
      if (subscription) {
        return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: null };
      }
    }

    // Get trial start date from mobile_users table (first login date)
    const { data: mobileUser, error: mobileUserError } = await supabase
      .from('mobile_users')
      .select('trial_start_date')
      .eq('id', user.id)
      .single();

    // Throw on network errors so proxy fallback can trigger
    // (PGRST116 = "no rows" which is expected for new users)
    if (mobileUserError && mobileUserError.code !== 'PGRST116') {
      const errMsg = String(mobileUserError.message || '').toLowerCase();
      if (errMsg.includes('abort') || errMsg.includes('network') || errMsg.includes('fetch') || errMsg.includes('timeout')) {
        throw mobileUserError;
      }
    }

    let trialStartDate: Date;
    const now = new Date();

    if (mobileUserError || !mobileUser) {
      const createdAt = (user as any).created_at ? new Date((user as any).created_at) : now;
      trialStartDate = createdAt;
      console.log('⚠️ Mobile user profile not found, using account creation date as trial start:', createdAt);
    } else if (!mobileUser.trial_start_date) {
      const createdAt = (user as any).created_at ? new Date((user as any).created_at) : now;
      trialStartDate = createdAt;
      console.log('⚠️ Trial start date not set, using account creation date as fallback:', createdAt);
    } else {
      trialStartDate = new Date(mobileUser.trial_start_date);
      console.log('✅ Using stored trial start date:', trialStartDate);
    }

    const trialEndDate = new Date(trialStartDate);
    trialEndDate.setDate(trialEndDate.getDate() + 7);

    const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isTrialActive = daysRemaining > 0;

    return {
      isTrialActive,
      trialEndDate,
      daysRemaining: Math.max(0, daysRemaining),
      error: null,
    };
  }

  /**
   * Get trial status and end date for users without subscription.
   * Falls back to dashboard proxy when direct Supabase is unreachable.
   */
  static async getTrialStatus(): Promise<{
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

      // Check if user is a development account (bypass trial check)
      if (user.email && this.DEVELOPMENT_EMAILS.includes(user.email.toLowerCase())) {
        return { isTrialActive: true, trialEndDate: null, daysRemaining: Infinity, error: null };
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first: dashboard API is always reachable via Vercel
      if (accessToken) {
        const proxyResult = await this._getTrialStatusViaProxy(accessToken);
        if (!proxyResult.error) {
          return proxyResult;
        }
        console.warn('[SubscriptionService] Trial proxy failed, falling back to direct Supabase:', proxyResult.error);
      }

      // Fallback: try direct Supabase
      return await this._getTrialStatusDirect(user);
    } catch (error: any) {
      console.error('Error checking trial status:', error);
      return { isTrialActive: false, trialEndDate: null, daysRemaining: 0, error: error.message };
    }
  }

  /**
   * Check if user has active subscription
   */
  static async hasActiveSubscription(): Promise<{ hasAccess: boolean; error: string | null }> {
    try {
      // Check if user is a development account (bypass subscription)
      // iOS-only reliability: prefer local session user (no network) to avoid hanging getUser calls.
      const session = await ensureValidSession();
      const user = session?.user || null;
      const isDeveloperAccount = user?.email && this.DEVELOPMENT_EMAILS.includes(user.email.toLowerCase());
      
      if (isDeveloperAccount) {
        console.log('Development account detected - bypassing subscription check');
        // Still return true for access, but we'll check subscription in getUserSubscription
        return { hasAccess: true, error: null };
      }

      const { subscription } = await this.getUserSubscription();
      
      if (!subscription) {
        // iOS-only: we already checked family in getUserSubscription() fast path, so skip extra calls.
        if (Platform.OS !== 'ios') {
        // Check if user is a family member (by phone number)
        const profile = await AuthService.getCurrentUser();
        if (profile?.phone) {
          const { hasAccess: familyAccess } = await this.checkFamilyAccess(profile.phone);
          if (familyAccess) {
            console.log('User has access via family plan');
            return { hasAccess: true, error: null };
            }
          }
        }
        
        // Check if trial is still active
        const { isTrialActive } = await this.getTrialStatus();
        return { hasAccess: isTrialActive, error: null };
      }

      // Check if subscription is expired
      const now = new Date();
      const endDate = new Date(subscription.end_date);
      
      if (endDate < now) {
        if (Platform.OS !== 'ios') {
        // Even if subscription expired, check if user is a family member
        const profile = await AuthService.getCurrentUser();
        if (profile?.phone) {
          const { hasAccess: familyAccess } = await this.checkFamilyAccess(profile.phone);
          if (familyAccess) {
            console.log('User has access via family plan (expired subscription)');
            return { hasAccess: true, error: null };
            }
          }
        }
        return { hasAccess: false, error: null };
      }

      return { hasAccess: true, error: null };
    } catch (error: any) {
      console.error('Error checking subscription access:', error);
      return { hasAccess: false, error: error.message };
    }
  }

  /**
   * Check if phone number is part of a family plan
   */
  static async checkFamilyAccess(phone: string): Promise<{ hasAccess: boolean; member: FamilyMember | null; error: string | null }> {
    try {
      const { data: member, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('phone', phone)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!member) {
        return { hasAccess: false, member: null, error: null };
      }

      // Check if the subscription is active
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select('status, end_date')
        .eq('id', member.subscription_id)
        .eq('status', 'active')
        .maybeSingle();

      if (subError) throw subError;

      if (!subscription) {
        return { hasAccess: false, member: null, error: null };
      }

      // Check if subscription is expired
      const now = new Date();
      const endDate = new Date(subscription.end_date);
      
      if (endDate < now) {
        return { hasAccess: false, member: null, error: null };
      }

      return { hasAccess: true, member, error: null };
    } catch (error: any) {
      console.error('Error checking family access:', error);
      return { hasAccess: false, member: null, error: error.message };
    }
  }

  /**
   * Add family member to subscription
   */
  static async addFamilyMember(phone: string, name?: string, email?: string): Promise<{ member: FamilyMember | null; error: string | null }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's active family subscription
      const { subscription } = await this.getUserSubscription();
      if (!subscription) {
        throw new Error('No active family subscription found');
      }

      const plan = this.getPlan(subscription.plan_id);
      if (!plan || plan.type !== 'family') {
        throw new Error('Subscription is not a family plan');
      }

      // Check current member count
      const { data: existingMembers, error: countError } = await supabase
        .from('family_members')
        .select('id')
        .eq('subscription_id', subscription.id)
        .eq('is_active', true);

      if (countError) throw countError;

      if (existingMembers && existingMembers.length >= (plan.max_members || 5)) {
        throw new Error('Maximum family members limit reached');
      }

      // Check if phone already exists
      const { data: existingMember, error: checkError } = await supabase
        .from('family_members')
        .select('id')
        .eq('phone', phone)
        .eq('is_active', true)
        .single();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      if (existingMember) {
        throw new Error('Phone number already registered as family member');
      }

      // Add new family member
      const { data: member, error } = await supabase
        .from('family_members')
        .insert({
          subscription_id: subscription.id,
          phone,
          name,
          email,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      return { member, error: null };
    } catch (error: any) {
      console.error('Error adding family member:', error);
      return { member: null, error: error.message };
    }
  }

  /**
   * Remove family member
   */
  static async removeFamilyMember(memberId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // First get the user's subscription to verify ownership
      const { subscription } = await this.getUserSubscription();
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Then remove the family member (only if they belong to user's subscription)
      const { error } = await supabase
        .from('family_members')
        .update({ is_active: false })
        .eq('id', memberId)
        .eq('subscription_id', subscription.id);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error removing family member:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get family members for current user
   * Optimized: Accept optional subscription_id to avoid extra API call
   */
  static async getFamilyMembers(subscriptionId?: string): Promise<{ members: FamilyMember[]; error: string | null }> {
    try {
      let subscription_id = subscriptionId;

      // If subscription_id not provided, get it from user's subscription
      if (!subscription_id) {
        const user = await AuthService.getCurrentUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        const { subscription } = await this.getUserSubscription();
        if (!subscription) {
          return { members: [], error: null };
        }
        subscription_id = subscription.id;
      }

      // Get family members directly using subscription_id (single optimized query)
      const { data: members, error } = await supabase
        .from('family_members')
        .select('id, subscription_id, phone, name, email, is_active, created_at, activated_at')
        .eq('subscription_id', subscription_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { members: members || [], error: null };
    } catch (error: any) {
      console.error('Error fetching family members:', error);
      return { members: [], error: error.message };
    }
  }

  /**
   * Create subscription (for payment integration)
   */
  static async createSubscription(planId: string, autoRenew: boolean = true): Promise<{ subscription: UserSubscription | null; error: string | null }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const plan = this.getPlan(planId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      // Calculate dates accurately
      // Use a single timestamp to ensure consistency
      const now = new Date();
      const startDate = new Date(now);
      
      // Calculate end date based on billing cycle
      // Use proper date arithmetic to avoid month-end edge cases
      let endDate: Date;
      if (plan.billing_cycle === 'monthly') {
        // Add 1 month: handle month-end edge cases properly
        endDate = new Date(now);
        const currentMonth = endDate.getMonth();
        const currentYear = endDate.getFullYear();
        const nextMonth = currentMonth + 1;
        
        // If next month would be > 11, roll over to next year
        if (nextMonth > 11) {
          endDate.setFullYear(currentYear + 1);
          endDate.setMonth(0); // January
        } else {
          endDate.setMonth(nextMonth);
        }
        
        // Ensure we don't go past the last day of the target month
        // (e.g., Jan 31 + 1 month should be Feb 28/29, not Mar 3)
        const lastDayOfTargetMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        endDate.setDate(Math.min(currentDay, lastDayOfTargetMonth));
      } else {
        // Add 1 year: handle leap year edge cases
        endDate = new Date(now);
        endDate.setFullYear(endDate.getFullYear() + 1);
        
        // Handle Feb 29 edge case: if current date is Feb 29 and next year is not a leap year,
        // set to Feb 28
        if (now.getMonth() === 1 && now.getDate() === 29) {
          const nextYear = endDate.getFullYear();
          const isLeapYear = (nextYear % 4 === 0 && nextYear % 100 !== 0) || (nextYear % 400 === 0);
          if (!isLeapYear) {
            endDate.setDate(28);
          }
        }
      }
      
      // Validate dates
      if (endDate <= startDate) {
        throw new Error('Invalid subscription end date calculation');
      }
      
      console.log('📅 Subscription date calculation:', {
        planId: planId,
        planName: plan.name,
        billingCycle: plan.billing_cycle,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        durationDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      });

      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_id: planId,
          status: 'active',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: autoRenew
        })
        .select()
        .single();

      if (error) throw error;

      return { subscription, error: null };
    } catch (error: any) {
      console.error('Error creating subscription:', error);
      return { subscription: null, error: error.message };
    }
  }

  /**
   * Cancel subscription (disable auto-renewal)
   */
  static async cancelSubscription(): Promise<{ success: boolean; error: string | null }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { subscription } = await this.getUserSubscription();
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Disable auto-renewal instead of canceling immediately
      // This allows the user to continue using the service until the end date
      const { error } = await supabase
        .from('user_subscriptions')
        .update({ 
          auto_renew: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update subscription plan (change plan)
   */
  static async updateSubscriptionPlan(newPlanId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const user = await AuthService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const plan = this.getPlan(newPlanId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      const { subscription } = await this.getUserSubscription();
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Calculate new end date based on remaining time and new plan's billing cycle
      const now = new Date();
      const currentEndDate = new Date(subscription.end_date);
      const remainingTime = currentEndDate.getTime() - now.getTime();
      const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));

      // Calculate new end date based on new plan's billing cycle
      // Use proper date arithmetic to avoid month-end edge cases
      let newEndDate: Date;
      if (plan.billing_cycle === 'monthly') {
        // Add 1 month from now
        newEndDate = new Date(now);
        const currentMonth = newEndDate.getMonth();
        const currentYear = newEndDate.getFullYear();
        const nextMonth = currentMonth + 1;
        
        if (nextMonth > 11) {
          newEndDate.setFullYear(currentYear + 1);
          newEndDate.setMonth(0);
        } else {
          newEndDate.setMonth(nextMonth);
        }
        
        // Handle month-end edge cases
        const lastDayOfTargetMonth = new Date(newEndDate.getFullYear(), newEndDate.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        newEndDate.setDate(Math.min(currentDay, lastDayOfTargetMonth));
      } else {
        // Add 1 year from now
        newEndDate = new Date(now);
        newEndDate.setFullYear(newEndDate.getFullYear() + 1);
        
        // Handle Feb 29 edge case
        if (now.getMonth() === 1 && now.getDate() === 29) {
          const nextYear = newEndDate.getFullYear();
          const isLeapYear = (nextYear % 4 === 0 && nextYear % 100 !== 0) || (nextYear % 400 === 0);
          if (!isLeapYear) {
            newEndDate.setDate(28);
          }
        }
      }

      // If there's remaining time from the current subscription, add it to the new end date
      // This ensures users don't lose paid time when switching plans
      if (remainingDays > 0) {
        newEndDate = new Date(newEndDate.getTime() + remainingTime);
      }
      
      console.log('📅 Plan change date calculation:', {
        oldPlanId: subscription.plan_id,
        newPlanId: newPlanId,
        oldEndDate: currentEndDate.toISOString(),
        remainingDays: remainingDays,
        newEndDate: newEndDate.toISOString()
      });

      const { error } = await supabase
        .from('user_subscriptions')
        .update({ 
          plan_id: newPlanId,
          end_date: newEndDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true, error: null };
    } catch (error: any) {
      console.error('Error updating subscription plan:', error);
      return { success: false, error: error.message };
    }
  }

}
