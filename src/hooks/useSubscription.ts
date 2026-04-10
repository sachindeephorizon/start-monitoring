import { getUserSubscriptions, Plan, UserSubscription } from "@/api/auth";
import {
  getMySubscriptionGroupMembers,
  inviteMySubscriptionGroupMemberByPhone,
  removeMySubscriptionGroupMember,
  type SubscriptionGroupMember,
} from "@/api/subscriptionGroups";
import { useAuth, useCurrentUser } from "@/core/auth";
import { useCallback, useEffect, useState } from "react";

export interface FamilyMember {
  id: string;
  type: 'MEMBER' | 'INVITE';
  memberUserId?: string;
  userId?: string;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  status?: 'ACTIVE' | 'REMOVED' | 'INVITED' | 'PENDING';
  phone: string;
  name?: string;
  email?: string;
  invitedAt?: string;
  joinedAt?: string;
  removedAt?: string | null;
  expiresAt?: string;
  activated_at?: string;
}

interface FamilyState {
  members: FamilyMember[];
  isLoading: boolean;
  error: string | null;
}

const getApiErrorMessage = (error: any, fallback: string): string => {
  const responseData = error?.response?.data;

  if (typeof responseData?.message === 'string' && responseData.message.trim()) {
    return responseData.message;
  }

  if (typeof responseData?.error === 'string' && responseData.error.trim()) {
    return responseData.error;
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
};


export interface SubscriptionState {
  hasAccess: boolean;
  subscription: UserSubscription | null;
  currentPlan: Plan | null;
  isFamilyPlan: boolean;
  isFamilyPlanOwner: boolean;
  isLoading: boolean;
  error: string | null;
  trialDaysRemaining?: number | null;
}

export const useSubscription = () => {
  const { isAuthReady } = useAuth();
  const currentUser = useCurrentUser();

  const [state, setState] = useState<SubscriptionState>({
    hasAccess: false,
    subscription: null,
    currentPlan: null,
    isFamilyPlan: false,
    isFamilyPlanOwner: false,
    isLoading: true,
    error: null,
  });
  const [familyState, setFamilyState] = useState<FamilyState>({
    members: [],
    isLoading: false,
    error: null,
  });

  const mapGroupMember = useCallback((member: SubscriptionGroupMember): FamilyMember => {
    const rowType: 'MEMBER' | 'INVITE' = member.type === 'INVITE' ? 'INVITE' : 'MEMBER';
    const memberUserId =
      (member.memberUserId as string | undefined) ||
      (member.userId as string | undefined) ||
      undefined;

    return {
      id: (member.id as string) || memberUserId || '',
      type: rowType,
      memberUserId,
      userId: (member.userId as string | undefined) || undefined,
      role: (member.role as FamilyMember['role']) || undefined,
      status: (member.status as FamilyMember['status']) || undefined,
      phone: (member.phone as string | undefined) || '',
      name: (member.name as string | undefined) || undefined,
      email: (member.email as string | undefined) || undefined,
      invitedAt: (member.invitedAt as string | undefined) || undefined,
      joinedAt: (member.joinedAt as string | undefined) || undefined,
      removedAt: (member.removedAt as string | null | undefined) ?? undefined,
      expiresAt: (member.expiresAt as string | undefined) || undefined,
      activated_at:
        (member.activated_at as string | undefined) ||
        (member.activatedAt as string | undefined) ||
        undefined,
    };
  }, []);

  const loadFamilyMembers = useCallback(async (_subscriptionId?: string) => {
    try {
      setFamilyState(prev => ({ ...prev, isLoading: true, error: null }));
      const members = await getMySubscriptionGroupMembers();
      setFamilyState({
        members: members.map(mapGroupMember),
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      setFamilyState(prev => ({
        ...prev,
        isLoading: false,
        error: getApiErrorMessage(error, 'Failed to load group members'),
      }));
    }
  }, [mapGroupMember]);

  const addFamilyMember = useCallback(async (phone: string, _name?: string, _email?: string) => {
    try {
      const result = await inviteMySubscriptionGroupMemberByPhone(phone);
      await loadFamilyMembers();

      return {
        success: true,
        message: result.message,
        invite: result,
        error: null,
      };
    } catch (error: any) {
      return {
        success: false,
        error: getApiErrorMessage(error, 'Failed to invite member'),
      };
    }
  }, [loadFamilyMembers]);

  const removeFamilyMember = useCallback(async (memberId: string) => {
    try {
      const member = familyState.members.find(m => m.id === memberId);
      if (!member || member.type !== 'MEMBER' || !member.userId) {
        return {
          success: false,
          error: 'Only active members can be removed from group.',
        };
      }

      await removeMySubscriptionGroupMember(member.userId);
      await loadFamilyMembers();
      return { success: true, error: null };
    } catch (error: any) {
      return {
        success: false,
        error: getApiErrorMessage(error, 'Failed to remove member'),
      };
    }
  }, [familyState.members, loadFamilyMembers]);

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
          isFamilyPlanOwner: false,
          isLoading: false,
          error: null,
        });
        setFamilyState({
          members: [],
          isLoading: false,
          error: null,
        });
        return;
      }

      const isActive =
        latestSub.status === 'ACTIVE' &&
        (!latestSub.currentPeriodEnd || new Date(latestSub.currentPeriodEnd) > new Date());

      const isFamilyPlan = latestSub.plan?.type === 'FAMILY';
      const isFamilyPlanOwner = Boolean(isFamilyPlan && currentUser?.id && latestSub.userId === currentUser.id);

      setState({
        hasAccess: isActive,
        subscription: latestSub,
        currentPlan: latestSub.plan || null,
        isFamilyPlan,
        isFamilyPlanOwner,
        isLoading: false,
        error: null,
      });

      if (isActive && isFamilyPlan) {
        await loadFamilyMembers(latestSub.id);
      } else {
        setFamilyState({
          members: [],
          isLoading: false,
          error: null,
        });
      }

    } catch (error: any) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: getApiErrorMessage(error, 'Failed to fetch subscription'),
      }));
    }
  }, [currentUser?.id, loadFamilyMembers]);

  useEffect(() => {
    if (!isAuthReady) return;
    fetchSubscription();
  }, [isAuthReady, fetchSubscription]);

  return {
    ...state,
    familyMembers: familyState.members,
    familyLoading: familyState.isLoading,
    familyError: familyState.error,
    loadFamilyMembers,
    addFamilyMember,
    removeFamilyMember,
    checkAccess: fetchSubscription,
    refresh: fetchSubscription,
  };
};