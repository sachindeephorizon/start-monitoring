/**
 * iOS In-App Purchase Service
 * 
 * Handles StoreKit purchases for iOS subscriptions.
 * Uses react-native-iap for StoreKit integration.
 * 
 * iOS SAFETY:
 * - All purchases go through Apple's StoreKit
 * - Receipt verification happens server-side
 * - Subscription state is server-owned
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { Purchase, ProductSubscription } from 'react-native-iap';
import { getUserProfile, type UserSubscription as ApiUserSubscription } from '@/api/auth';
import { getPlans, type BackendPlan } from '@/api/plans';
import { initiateUserSubscription, confirmIosSubscription } from '@/api/userSubscription';
import { PaymentVerificationResult, Subscription as AppSubscription } from './subscription.types';

type ReactNativeIapModule = typeof import('react-native-iap');

let iapModulePromise: Promise<ReactNativeIapModule> | null = null;

async function getIapModule(): Promise<ReactNativeIapModule> {
  if (Platform.OS !== 'ios') {
    throw new Error('react-native-iap is only available on iOS');
  }
  if (!iapModulePromise) {
    iapModulePromise = import('react-native-iap');
  }
  return iapModulePromise;
}

// IMPORTANT: Do NOT import SubscriptionPlan from subscription.types.ts here.
// That file defines SubscriptionPlan as a string union (e.g. 'individual_monthly'),
// but this purchase flow needs the full plan object with an `id`.
export type SubscriptionPlanInput = {
  id: string;
  name: string;
  type: 'individual' | 'family';
  billing_cycle: 'monthly' | 'yearly';
  price: number;
  currency: string;
  storekitPlanId?: string;
  features: string[];
  max_members?: number;
};

/**
 * Mapping of plan IDs to App Store Connect product IDs
 * 
 * These product IDs must be created in App Store Connect and match exactly.
 * Format: com.deephorizon.security.[plan_id].v1
 */
export const IOS_PRODUCT_IDS: Record<string, string> = {
  // Individual Monthly: plan_RIADHZ91GxVCUn
  'plan_RIADHZ91GxVCUn': 'com.deephorizon.security.individual.monthly.v1',
  
  // Individual Yearly: plan_RIAOwgHa1uhibd
  'plan_RIAOwgHa1uhibd': 'com.deephorizon.security.individual.yearly.v1',
  
  // Family Monthly: plan_RIADmXQMERsApy
  'plan_RIADmXQMERsApy': 'com.deephorizon.security.family.monthly.v1',
  
  // Family Yearly: plan_RIAOC4tpe6q41z
  'plan_RIAOC4tpe6q41z': 'com.deephorizon.security.family.yearly.v1',
};

/**
 * Reverse mapping: App Store product ID -> plan ID
 */
const PRODUCT_ID_TO_PLAN_ID: Record<string, string> = Object.entries(IOS_PRODUCT_IDS).reduce(
  (acc, [planId, productId]) => {
    acc[productId] = planId;
    return acc;
  },
  {} as Record<string, string>
);

const PLAN_META_BY_PLAN_ID: Record<
  string,
  Omit<SubscriptionPlanInput, 'id'> & { id?: never }
> = {
  plan_RIADHZ91GxVCUn: {
    name: 'Monthly Individual Plan',
    type: 'individual',
    billing_cycle: 'monthly',
    price: 149,
    currency: 'INR',
    features: [],
  },
  plan_RIAOwgHa1uhibd: {
    name: 'Yearly Individual Plan',
    type: 'individual',
    billing_cycle: 'yearly',
    price: 1699,
    currency: 'INR',
    features: [],
  },
  plan_RIADmXQMERsApy: {
    name: 'Monthly Family plan',
    type: 'family',
    billing_cycle: 'monthly',
    price: 649,
    currency: 'INR',
    max_members: 5,
    features: [],
  },
  plan_RIAOC4tpe6q41z: {
    name: 'Yearly Family Plan',
    type: 'family',
    billing_cycle: 'yearly',
    price: 7199,
    currency: 'INR',
    max_members: 5,
    features: [],
  },
};

function getPlanMeta(planId: string): SubscriptionPlanInput | null {
  const meta = PLAN_META_BY_PLAN_ID[planId];
  if (!meta) return null;
  return { id: planId, ...meta };
}

const shortId = (value?: string | null): string => {
  if (!value) return 'n/a';
  const v = String(value);
  if (v.length <= 10) return v;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
};

const iosPurchaseLog = (step: string, details?: Record<string, unknown>) => {
  const ts = new Date().toISOString();
  if (details) {
    console.log(`[iOS Purchase][${ts}][${step}]`, details);
    return;
  }
  console.log(`[iOS Purchase][${ts}][${step}]`);
};

function mapBackendPlanToSubscriptionPlanInput(plan: BackendPlan): SubscriptionPlanInput {
  return {
    id: plan.id,
    name: plan.name,
    type: plan.type === 'FAMILY' ? 'family' : 'individual',
    billing_cycle: plan.frequency === 'YEARLY' ? 'yearly' : 'monthly',
    price: typeof plan.price === 'number' ? plan.price : 0,
    currency: 'INR',
    storekitPlanId: typeof plan.storekitPlanId === 'string' ? plan.storekitPlanId : undefined,
    max_members: typeof plan.noOfUsers === 'number' && plan.noOfUsers > 1 ? plan.noOfUsers : undefined,
    features: [],
  };
}

function mapApiSubscriptionToAppSubscription(sub: ApiUserSubscription): AppSubscription {
  const statusRaw = String(sub.status || '').toUpperCase();
  const mappedStatus: AppSubscription['status'] =
    statusRaw === 'ACTIVE' ? 'active' : statusRaw === 'CANCELED' ? 'cancelled' : 'expired';

  return {
    id: sub.id,
    user_id: sub.userId,
    plan_id: sub.planId,
    plan_name: sub.plan?.name || 'Plan',
    plan_type: sub.plan?.type === 'FAMILY' ? 'family' : 'individual',
    billing_cycle: sub.plan?.frequency === 'YEARLY' ? 'yearly' : 'monthly',
    price: sub.billedAmount || sub.amount || sub.plan?.price || 0,
    currency: 'INR',
    status: mappedStatus,
    start_date: new Date(sub.currentPeriodStart as any).toISOString(),
    end_date: new Date(sub.currentPeriodEnd as any).toISOString(),
    payment_method: 'ios_storekit',
    payment_id: sub.paymentReference,
    created_at: new Date(sub.createdAt as any).toISOString(),
    updated_at: new Date(sub.updatedAt as any).toISOString(),
  };
}

async function getCurrentUserId(): Promise<string | null> {
  try {
    const me = await getUserProfile();
    const userId = (me as any)?.id || (me as any)?.userId || null;
    return userId ? String(userId) : null;
  } catch {
    return null;
  }
}

async function resolvePlanByProductId(productId: string): Promise<SubscriptionPlanInput | null> {
  if (!productId) return null;

  try {
    const plans = await getPlans();
    const backendPlan = plans.find((p) => p?.storekitPlanId === productId);
    if (backendPlan) {
      return mapBackendPlanToSubscriptionPlanInput(backendPlan);
    }
  } catch {
    // Fallback to static mapping below.
  }

  const planId = PRODUCT_ID_TO_PLAN_ID[productId];
  return planId ? getPlanMeta(planId) : null;
}

/**
 * iOS Purchase Service
 * 
 * Handles all iOS StoreKit operations.
 */
export const IOSPurchaseService = {
  /**
   * Fetch subscription products from StoreKit in a version-tolerant way.
   * react-native-iap v14+ supports `fetchProducts({ skus, type: 'subs' })`,
   * but some environments (or adapters) behave better with `getSubscriptions({ skus })`.
   */
  async fetchSubscriptionProducts(skus: string[]): Promise<ProductSubscription[]> {
    if (Platform.OS !== 'ios') return [];

    const uniqSkus = Array.from(new Set((skus || []).filter(Boolean)));
    if (uniqSkus.length === 0) return [];

    // Ensure StoreKit connection exists (idempotent).
    try {
      const { initConnection } = await getIapModule();
      await initConnection();
    } catch {
      // If init fails here, downstream calls will likely fail too, but keep it non-fatal for better diagnostics.
    }

    const iap = await getIapModule();
    const results: any[] = [];

    // Preferred path for subscriptions (many setups return richer data here).
    try {
      const getSubs = (iap as any).getSubscriptions;
      if (typeof getSubs === 'function') {
        const res = await getSubs({ skus: uniqSkus });
        if (Array.isArray(res)) results.push(...res);
      }
    } catch (e) {
      console.warn('[iOS Purchase] getSubscriptions failed (non-fatal):', e);
    }

    // Fallback path for v14 "fetchProducts".
    try {
      const fetch = (iap as any).fetchProducts;
      if (typeof fetch === 'function') {
        const res = await fetch({ skus: uniqSkus, type: 'subs' });
        if (Array.isArray(res)) results.push(...res);
      }
    } catch (e) {
      console.warn('[iOS Purchase] fetchProducts failed (non-fatal):', e);
    }

    // Normalize + de-dupe by product identifier.
    // react-native-iap returns `id` for Product objects (including subs),
    // but some codepaths historically used `productId`. Support both.
    const byId = new Map<string, any>();
    for (const p of results) {
      const pid = (p as any)?.id ?? (p as any)?.productId;
      if (typeof pid === 'string' && pid.trim()) {
        byId.set(pid, p);
      }
    }
    return Array.from(byId.values()) as ProductSubscription[];
  },

  /**
   * Initialize StoreKit connection
   * 
   * Must be called before any purchase operations.
   * Should be called on app startup.
   */
  async initialize(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      const { initConnection } = await getIapModule();
      await initConnection();
      console.log('[iOS Purchase] StoreKit connection initialized');
    } catch (error) {
      console.error('[iOS Purchase] Failed to initialize StoreKit:', error);
      throw error;
    }
  },

  /**
   * Close StoreKit connection
   * 
   * Should be called when app closes or when done with purchases.
   */
  async close(): Promise<void> {
    if (Platform.OS !== 'ios') {
      return;
    }

    try {
      const { endConnection } = await getIapModule();
      await endConnection();
      console.log('[iOS Purchase] StoreKit connection closed');
    } catch (error) {
      console.error('[iOS Purchase] Failed to close StoreKit:', error);
    }
  },

  /**
   * Get available subscription products from App Store
   * 
   * Fetches product information from App Store Connect.
   * 
   * @returns Array of available subscription products
   */
  async getAvailableProducts(): Promise<ProductSubscription[]> {
    if (Platform.OS !== 'ios') {
      return [];
    }

    try {
      const productIds = Object.values(IOS_PRODUCT_IDS);
      const subs = await this.fetchSubscriptionProducts(productIds);
      console.log('[iOS Purchase] Available subscription products:', subs);
      return subs;
    } catch (error) {
      console.error('[iOS Purchase] Failed to get products:', error);
      return [];
    }
  },

  /**
   * Purchase subscription using StoreKit
   * 
   * Initiates purchase flow through Apple's StoreKit.
   * 
   * @param plan Subscription plan to purchase
   * @returns Payment verification result
   */
  async purchaseSubscription(
    plan: SubscriptionPlanInput
  ): Promise<PaymentVerificationResult> {
    iosPurchaseLog('purchase:start', {
      platform: Platform.OS,
      isDevice: Device.isDevice,
      iosVersion: Platform.OS === 'ios' ? Platform.Version : undefined,
      planId: plan?.id,
      storekitPlanId: plan?.storekitPlanId || null,
    });

    if (Platform.OS !== 'ios') {
      return {
        success: false,
        error: 'iOS purchase service only works on iOS',
      };
    }

    try {
      const userId = await getCurrentUserId();
      if (!userId) {
        iosPurchaseLog('purchase:missing-user');
        return {
          success: false,
          error: 'User not authenticated',
        };
      }

      iosPurchaseLog('purchase:user-resolved', {
        userId: shortId(userId),
      });

      const initiated = await initiateUserSubscription({
        userId,
        planId: plan.id,
        type: 'PAID',
        gatewayType: 'IOS',
      });

      const localSubscriptionId = String(
        initiated?.paymentGatewayPayload?.localSubscriptionId || initiated?.id || ''
      ).trim();

      const productId = String(
        initiated?.paymentGatewayPayload?.productId ||
          (typeof plan.storekitPlanId === 'string' ? plan.storekitPlanId : '') ||
          IOS_PRODUCT_IDS[plan.id] ||
          ''
      ).trim();

      iosPurchaseLog('purchase:initiate-response', {
        initiatedId: shortId(String((initiated as any)?.id || '')),
        localSubscriptionId: shortId(localSubscriptionId),
        productId,
        paymentGatewayType: (initiated as any)?.paymentGatewayPayload?.gatewayType || null,
      });
      
      if (!productId) {
        return {
          success: false,
          error: `No App Store product ID found for plan: ${plan.id}`,
        };
      }

      if (!localSubscriptionId) {
        return {
          success: false,
          error: "Missing local subscription id from backend initiate response",
        };
      }

      // Ensure StoreKit is ready (safe to call multiple times).
      try {
        const { initConnection } = await getIapModule();
        await initConnection();
      } catch (e) {
        console.warn('[iOS Purchase] initConnection failed (will continue):', e);
      }

      console.log('[iOS Purchase] Starting purchase for product:', productId);

      // Set up purchase listener BEFORE requesting purchase
      let purchaseResolve: ((value: { success: boolean; error?: string; purchase?: Purchase }) => void) | null = null;
      let purchaseReject: ((error: any) => void) | null = null;
      
      const purchasePromise = new Promise<{ success: boolean; error?: string; purchase?: Purchase }>((resolve, reject) => {
        purchaseResolve = resolve;
        purchaseReject = reject;
      });

      // Set up purchase listeners (react-native-iap v14 is event-based)
      const { purchaseUpdatedListener, purchaseErrorListener, requestPurchase, finishTransaction } = await getIapModule();

      const purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          if (purchase.productId !== productId) {
            return;
          }

          console.log('[iOS Purchase] Purchase updated:', {
            productId: purchase.productId,
            purchaseState: (purchase as any).purchaseState,
            transactionId: (purchase as any).transactionId,
            id: (purchase as any).id,
          });

          // PurchaseState in react-native-iap v14: 'pending' | 'purchased' | 'unknown'
          // On iOS: purchaseUpdatedListener fires only for verified StoreKit transactions.
          // The `purchaseState` field is Android-specific; on iOS it may arrive as
          // 'purchased' (if OpenIAP sets it) or 'unknown' (Nitro C++ default when absent).
          // Accept any non-pending state on iOS as a successful purchase.
          const state = (purchase as any).purchaseState as 'pending' | 'purchased' | 'unknown' | undefined;
          const isSuccessfulOnIOS = Platform.OS === 'ios' && state !== 'pending';
          const isSuccessfulOnAndroid = Platform.OS !== 'ios' && state === 'purchased';

          if (isSuccessfulOnIOS || isSuccessfulOnAndroid) {
            purchaseUpdateSubscription.remove();
            purchaseErrorSubscription.remove();
            if (purchaseResolve) {
              purchaseResolve({ success: true, purchase });
            }
          } else if (state === 'unknown') {
            // Android only: 'unknown' state means a genuine payment failure
            purchaseUpdateSubscription.remove();
            purchaseErrorSubscription.remove();
            if (purchaseResolve) {
              purchaseResolve({ success: false, error: 'Purchase failed', purchase });
            }
          }
          // pending -> keep waiting (deferred / parental approval)
        } catch (e) {
          purchaseUpdateSubscription.remove();
          purchaseErrorSubscription.remove();
          if (purchaseReject) {
            purchaseReject(e);
          } else if (purchaseResolve) {
            purchaseResolve({ success: false, error: 'Purchase listener error' });
          }
        }
      });

      const purchaseErrorSubscription = purchaseErrorListener((error: any) => {
        console.error('[iOS Purchase] Purchase error event:', error);
        purchaseUpdateSubscription.remove();
        purchaseErrorSubscription.remove();
        if (purchaseResolve) {
          const code = error?.code;
          if (code === 'E_USER_CANCELLED' || code === 'userCancel') {
            purchaseResolve({ success: false, error: 'Purchase cancelled by user' });
            return;
          }
          // Common for subscriptions: user already owns an active subscription.
          // Treat this as a "restore/sync required" signal instead of a hard failure.
          if (code === 'already-owned') {
            purchaseResolve({ success: false, error: 'already-owned' });
            return;
          }
          purchaseResolve({ success: false, error: error?.message || 'Purchase failed' });
        }
      });

      // Request purchase through StoreKit (v14 uses requestPurchase with type 'subs')
      try {
        // Production: pass appAccountToken (UUID) so App Store Server Notifications can reliably map
        // renewals/cancellations back to the correct backend user.
        const appAccountToken = userId && userId.length >= 32 ? userId : undefined;

        iosPurchaseLog('purchase:requestPurchase', {
          productId,
          hasAppAccountToken: Boolean(appAccountToken),
        });

        await requestPurchase({
          type: 'subs',
          request: {
            apple: {
              sku: productId,
              andDangerouslyFinishTransactionAutomatically: false,
              ...(appAccountToken ? { appAccountToken } : null),
            },
          },
        } as any);
      } catch (error: any) {
        purchaseUpdateSubscription.remove();
        purchaseErrorSubscription.remove();
        if (error?.code === 'already-owned') {
          console.warn('[iOS Purchase] requestPurchase already-owned -> syncing purchases');
          const synced = await this.syncPurchasesWithServer();
          if (synced) {
            return { success: true, subscription: synced };
          }
          return {
            success: false,
            error:
              'You already have an active subscription, but we could not sync it right now. Please try again from “Restore Purchases”.',
          };
        }
        if (error.code === 'E_USER_CANCELLED' || error.code === 'userCancel') {
          return {
            success: false,
            error: 'Purchase cancelled by user',
          };
        }
        throw error;
      }

      // Wait for purchase to complete (with timeout)
      const timeoutPromise = new Promise<{ success: boolean; error?: string; purchase?: Purchase }>((resolve) => {
        setTimeout(() => {
          purchaseUpdateSubscription.remove();
          purchaseErrorSubscription.remove();
          resolve({
            success: false,
            error: 'Purchase timeout',
            purchase: undefined,
          });
        }, 60000);
      });

      const purchaseResult = await Promise.race([purchasePromise, timeoutPromise]);

      iosPurchaseLog('purchase:listener-result', {
        success: purchaseResult.success,
        error: purchaseResult.error || null,
        hasPurchase: Boolean(purchaseResult.purchase),
      });

      if (!purchaseResult.success || !purchaseResult.purchase) {
        // Production-ready behavior: if StoreKit says it's already owned, sync entitlements instead
        // of leaving the user stuck with an error.
        if (purchaseResult.error === 'already-owned') {
          console.warn('[iOS Purchase] already-owned -> syncing purchases');
          const synced = await this.syncPurchasesWithServer();
          if (synced) {
            return { success: true, subscription: synced };
          }
          return {
            success: false,
            error:
              'You already have an active subscription, but we could not sync it right now. Please try again from “Restore Purchases”.',
          };
        }
        return {
          success: false,
          error: purchaseResult.error || 'Purchase failed',
        };
      }

      const purchase = purchaseResult.purchase;

      // Always finish transaction to clear StoreKit queue (even if verification fails)
      try {
        await finishTransaction({ purchase, isConsumable: false });
      } catch (finishError) {
        console.warn('[iOS Purchase] Failed to finish transaction (non-fatal):', finishError);
      }

      // Production-ready verification strategy:
      // Prefer StoreKit 2 Signed Transaction JWS (works in Xcode StoreKit testing AND real devices),
      // and verify it server-side using Apple's JWKS.
      // Fallback to classic receipt only if JWS cannot be obtained.
      let transactionJws: string | null = null;
      let receipt: string | null = null;

      try {
        const { getTransactionJwsIOS } = await getIapModule();
        // RN-IAP expects productId here.
        transactionJws = (await (getTransactionJwsIOS as any)(productId)) ?? null;
        if (transactionJws) {
          console.log('[iOS Purchase] ✅ Obtained StoreKit transaction JWS for verification');
        }
      } catch (e) {
        console.warn('[iOS Purchase] getTransactionJwsIOS failed (will try receipt):', e);
      }

      if (!transactionJws) {
        try {
          // Dynamically import to avoid bundler/type issues across builds
          const { getReceiptDataIOS, getReceiptIOS } = await getIapModule();
          receipt = (await (getReceiptDataIOS as any)()) ?? null;
          if (!receipt) {
            receipt = await (getReceiptIOS as any)();
          }
        } catch (e) {
          console.warn('[iOS Purchase] Failed to read receipt data:', e);
        }
      }

      // In production we require at least one verifiable artifact.
      // In Xcode StoreKit testing, receipts often aren't available, so JWS is the correct path.
      if (!transactionJws && !receipt) {
        const isSimulatorLike = !Device.isDevice;
        iosPurchaseLog('purchase:verification-artifact-missing', {
          isSimulatorLike,
          productId,
        });
        return {
          success: false,
          error: isSimulatorLike
            ? 'Unable to obtain receipt in StoreKit testing. Ensure the scheme has a StoreKit Configuration file and retry.'
            : 'Unable to obtain App Store verification data. Please try again.',
        };
      }

      iosPurchaseLog('purchase:verification-artifact-ready', {
        hasTransactionJws: Boolean(transactionJws),
        hasReceipt: Boolean(receipt),
        transactionId: shortId(String((purchase as any).transactionId || (purchase as any).id || '')),
      });

      // Verify purchase with server
      const verificationResult = await this.verifyPurchase(
        {
          receipt,
          transactionJws,
        },
        (purchase as any).transactionId || (purchase as any).id || '',
        productId,
        plan,
        localSubscriptionId,
        userId
      );

      return verificationResult;
    } catch (error: any) {
      iosPurchaseLog('purchase:exception', {
        message: error?.message || 'unknown',
        code: error?.code || null,
      });
      console.error('[iOS Purchase] Purchase failed:', error);

      // Handle user cancellation
      if (error.code === 'E_USER_CANCELLED' || error.code === 'userCancel') {
        return {
          success: false,
          error: 'Purchase cancelled by user',
        };
      }

      return {
        success: false,
        error: error.message || 'Purchase failed',
      };
    }
  },

  /**
   * Sync existing StoreKit purchases to the backend (production-critical).
   *
   * Used for:
   * - "already-owned" errors
   * - reinstall/new device
   * - keeping DB in sync with StoreKit entitlements
   *
   * Returns the most recent activated subscription if any.
   */
  async syncPurchasesWithServer(): Promise<AppSubscription | null> {
    if (Platform.OS !== 'ios') return null;

    try {
      const userId = await getCurrentUserId();
      if (!userId) return null;

      iosPurchaseLog('sync:start', {
        userId: shortId(userId),
        isDevice: Device.isDevice,
      });

      // Ensure StoreKit connection exists (idempotent).
      try {
        const { initConnection } = await getIapModule();
        await initConnection();
      } catch {
        // non-fatal
      }

      // IMPORTANT:
      // `getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })` is the right first try,
      // but on some devices/storefront states it may return an empty list even when the user
      // has a valid auto-renewable subscription (especially around cancellation/grace-period).
      // We therefore use fallbacks:
      // 1) getAvailablePurchases without the "onlyIncludeActiveItemsIOS" filter
      // 2) getPurchaseHistory as a last resort
      let purchases: Purchase[] = []
      try {
        const { getAvailablePurchases } = await getIapModule();
        const res = await getAvailablePurchases({
          onlyIncludeActiveItemsIOS: true,
          alsoPublishToEventListenerIOS: false,
        } as any)
        if (Array.isArray(res)) purchases = res as any
        iosPurchaseLog('sync:available-purchases-active', {
          count: Array.isArray(res) ? res.length : 0,
        });
      } catch (e) {
        console.warn('[iOS Purchase] getAvailablePurchases(active) failed (non-fatal):', e)
      }

      if (!purchases.length) {
        try {
          const { getAvailablePurchases } = await getIapModule();
          const res = await getAvailablePurchases({
            // no active-only filter
            alsoPublishToEventListenerIOS: false,
          } as any)
          if (Array.isArray(res)) purchases = res as any
          iosPurchaseLog('sync:available-purchases-all', {
            count: Array.isArray(res) ? res.length : 0,
          });
        } catch (e) {
          console.warn('[iOS Purchase] getAvailablePurchases(all) failed (non-fatal):', e)
        }
      }

      if (!purchases.length) {
        try {
          // Some react-native-iap builds do not export getPurchaseHistory.
          // Load dynamically and use if available.
          const iap = await getIapModule()
          const getHistory = (iap as any).getPurchaseHistory
          if (typeof getHistory === 'function') {
            const res = await getHistory()
            if (Array.isArray(res)) purchases = res as any
            iosPurchaseLog('sync:purchase-history', {
              count: Array.isArray(res) ? res.length : 0,
            });
          } else {
            // Optional API in some RN-IAP builds; keep this path silent.
            console.log('[iOS Purchase] getPurchaseHistory unavailable in this build (non-fatal).')
          }
        } catch (e) {
          console.warn('[iOS Purchase] getPurchaseHistory call failed (non-fatal):', e)
        }
      }

      if (!Array.isArray(purchases) || purchases.length === 0) {
        iosPurchaseLog('sync:no-purchases-found');
        return null
      }

      iosPurchaseLog('sync:purchases-found', {
        count: purchases.length,
      });

      // Prefer verifying each active entitlement; backend will upsert subscription.
      // Sort by latest transactionDate if present.
      const sorted = [...purchases].sort((a: any, b: any) => {
        const ad = Number((a as any)?.transactionDate || 0);
        const bd = Number((b as any)?.transactionDate || 0);
        return bd - ad;
      });

      let latest: AppSubscription | null = null;

      for (const p of sorted) {
        const pid = (p as any)?.productId;
        if (typeof pid !== 'string' || !pid) continue;

        iosPurchaseLog('sync:processing-purchase', {
          productId: pid,
          transactionId: shortId(String((p as any)?.transactionId || (p as any)?.id || '')),
        });

        const plan = await resolvePlanByProductId(pid);
        if (!plan) continue;

        let localSubscriptionId = '';
        try {
          const initiated = await initiateUserSubscription({
            userId,
            planId: plan.id,
            type: 'PAID',
            gatewayType: 'IOS',
          });
          localSubscriptionId = String(
            initiated?.paymentGatewayPayload?.localSubscriptionId || initiated?.id || ''
          ).trim();
        } catch {
          // Try next entitlement if initiate fails for this plan.
          continue;
        }

        if (!localSubscriptionId) continue;

        // Prefer StoreKit 2 JWS; fall back to receipt only if needed.
        let transactionJws: string | null = null;
        let receipt: string | null = null;

        try {
          const { getTransactionJwsIOS } = await getIapModule();
          transactionJws = (await (getTransactionJwsIOS as any)(pid)) ?? null;
        } catch {
          // ignore
        }

        if (!transactionJws) {
          try {
            const { getReceiptDataIOS, getReceiptIOS } = await getIapModule();
            receipt = (await (getReceiptDataIOS as any)()) ?? null;
            if (!receipt) receipt = await (getReceiptIOS as any)();
          } catch {
            // ignore
          }
        }

        if (!transactionJws && !receipt) {
          iosPurchaseLog('sync:skip-no-artifact', {
            productId: pid,
          });
          continue;
        }

        const txId = String((p as any)?.transactionId || (p as any)?.id || '');
        const res = await this.verifyPurchase(
          { receipt, transactionJws },
          txId,
          pid,
          plan,
          localSubscriptionId,
          userId
        );

        if (res.success && res.subscription) {
          latest = res.subscription;
          iosPurchaseLog('sync:verified-latest', {
            subscriptionId: shortId(res.subscription.id),
            planId: res.subscription.plan_id,
          });
          // If we successfully synced the most recent entitlement, we can stop early.
          break;
        }
      }

      iosPurchaseLog('sync:done', {
        synced: Boolean(latest),
      });
      return latest;
    } catch (e) {
      iosPurchaseLog('sync:exception', {
        message: (e as any)?.message || 'unknown',
      });
      console.warn('[iOS Purchase] syncPurchasesWithServer failed:', e);
      return null;
    }
  },

  /**
   * Wait for purchase completion
   * 
   * Monitors purchase state until it completes or fails.
   */
  async waitForPurchaseCompletion(): Promise<{ success: boolean; error?: string; purchase?: Purchase }> {
    const { purchaseUpdatedListener, finishTransaction } = await getIapModule();
    return new Promise((resolve) => {
      const purchaseUpdateSubscription = purchaseUpdatedListener(
        async (purchase: Purchase) => {
          console.log('[iOS Purchase] Purchase updated:', purchase);

          const state = (purchase as any).purchaseState as 'pending' | 'purchased' | 'unknown' | undefined;
          // On iOS, purchaseUpdatedListener fires only for verified StoreKit transactions.
          // Accept any non-pending state on iOS as success (state may be 'unknown' by default).
          const isSuccessfulOnIOS = Platform.OS === 'ios' && state !== 'pending';
          const isSuccessfulOnAndroid = Platform.OS !== 'ios' && state === 'purchased';
          if (isSuccessfulOnIOS || isSuccessfulOnAndroid) {
            // Purchase successful
            try {
              await finishTransaction({ purchase, isConsumable: false });
            } catch {}
            purchaseUpdateSubscription.remove();
            resolve({ success: true, purchase });
          } else if (state === 'unknown') {
            // Android only: 'unknown' is a genuine failure
            try {
              await finishTransaction({ purchase, isConsumable: false });
            } catch {}
            purchaseUpdateSubscription.remove();
            resolve({ success: false, error: 'Purchase failed' });
          }
        }
      );

      // Timeout after 60 seconds
      setTimeout(() => {
        purchaseUpdateSubscription.remove();
        resolve({
          success: false,
          error: 'Purchase timeout',
        });
      }, 60000);
    });
  },

  /**
   * Verify purchase with server
   * 
   * Sends purchase receipt to server for verification.
   * Server verifies receipt with Apple and activates subscription.
   * 
   * @param receipt Transaction receipt from StoreKit
   * @param transactionId Transaction ID
   * @param productId App Store product ID
   * @param plan Subscription plan
   * @returns Payment verification result
   */
  async verifyPurchase(
    verification: { receipt: string | null; transactionJws: string | null },
    transactionId: string,
    productId: string,
    plan: SubscriptionPlanInput,
    localSubscriptionId: string,
    userId: string
  ): Promise<PaymentVerificationResult> {
    try {
      console.log('[iOS Purchase] Verifying purchase with server...');

      const receiptData = verification.receipt?.trim();
      const transactionJws = verification.transactionJws?.trim();

      if (!receiptData && !transactionJws) {
        iosPurchaseLog('verify:missing-artifact', {
          productId,
          transactionId: shortId(transactionId),
          planId: plan.id,
          localSubscriptionId: shortId(localSubscriptionId),
        });
        return {
          success: false,
          error: 'Missing App Store verification data for iOS confirmation',
        };
      }

      iosPurchaseLog('verify:request', {
        productId,
        transactionId: shortId(transactionId),
        planId: plan.id,
        localSubscriptionId: shortId(localSubscriptionId),
        hasReceipt: Boolean(receiptData),
        hasTransactionJws: Boolean(transactionJws),
        userId: shortId(userId),
      });

      console.log('[iOS Purchase] Sending JWS data:', { userId,
        planId: plan.id,
        localSubscriptionId,
        receiptData: receiptData || '',
        hasTransactionJws: Boolean(transactionJws),
      });

      const subscription = await confirmIosSubscription({
        planId: plan.id,
        localSubscriptionId,
        receiptData: receiptData || '',
        signedTransactionInfo: transactionJws || undefined,
      });

      if (!subscription?.id) {
        return {
          success: false,
          error: 'Subscription not activated',
        };
      }

      console.log('[iOS Purchase] Purchase verified successfully');
      iosPurchaseLog('verify:success', {
        subscriptionId: shortId(subscription.id),
        status: subscription.status,
      });
      return {
        success: true,
        subscription: mapApiSubscriptionToAppSubscription(subscription),
      };
    } catch (error: any) {
      iosPurchaseLog('verify:failure', {
        message: error?.message || 'unknown',
        status: error?.response?.status || null,
      });
      console.error('[iOS Purchase] Error verifying purchase:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Restore previous purchases
   * 
   * Restores purchases for the current user.
   * Useful for users who reinstalled the app or switched devices.
   * 
   * @returns Array of restored subscriptions
   */
  async restorePurchases(): Promise<AppSubscription[]> {
    if (Platform.OS !== 'ios') {
      return [];
    }

    try {
      console.log('[iOS Purchase] Restoring purchases (and syncing to backend)...');
      const latest = await this.syncPurchasesWithServer();
      iosPurchaseLog('restore:done', {
        restoredCount: latest ? 1 : 0,
      });
      return latest ? [latest] : [];
    } catch (error) {
      iosPurchaseLog('restore:failure', {
        message: (error as any)?.message || 'unknown',
      });
      console.error('[iOS Purchase] Failed to restore purchases:', error);
      return [];
    }
  },

  /**
   * Get product ID for a plan
   * 
   * @param planId Plan ID
   * @returns App Store product ID or null
   */
  getProductId(planId: string): string | null {
    return IOS_PRODUCT_IDS[planId] || null;
  },
};

