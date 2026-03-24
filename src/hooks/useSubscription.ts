import { getUserSubscriptions, Plan, UserSubscription } from "@/api/auth";
import { useAuth } from "@/core/auth";
import { useCallback, useEffect, useState } from "react";


export interface SubscriptionState {
  hasAccess: boolean;
  subscription: UserSubscription | null;
  currentPlan: Plan | null;
  isFamilyPlan: boolean;
  isLoading: boolean;
  error: string | null;
  trialDaysRemaining?: number | null;
}

export const useSubscription = () => {
  const { isAuthReady } = useAuth();

  const [state, setState] = useState<SubscriptionState>({
    hasAccess: false,
    subscription: null,
    currentPlan: null,
    isFamilyPlan: false,
    isLoading: true,
    error: null,
  });

  const fetchSubscription = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const subscriptions = await getUserSubscriptions();

      const latestSub = subscriptions?.find(s => s.isLatest);

      if (!latestSub) {
        setState({
          hasAccess: false,
          subscription: null,
          currentPlan: null,
          isFamilyPlan: false,
          isLoading: false,
          error: null,
        });
        return;
      }

      const isActive =
        latestSub.status === 'ACTIVE' &&
        new Date(latestSub.currentPeriodEnd) > new Date();

      const isFamilyPlan = latestSub.plan?.type === 'FAMILY';

      setState({
        hasAccess: isActive,
        subscription: latestSub,
        currentPlan: latestSub.plan || null,
        isFamilyPlan,
        isLoading: false,
        error: null,
      });

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch subscription',
      }));
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    fetchSubscription();
  }, [isAuthReady, fetchSubscription]);

  return {
    ...state,
    refresh: fetchSubscription,
  };
};