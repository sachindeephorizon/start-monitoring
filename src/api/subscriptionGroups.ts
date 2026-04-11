import { get, post, remove } from './config';

interface ApiEnvelope<T> {
  status?: number;
  message?: string;
  data?: T;
}

const unwrap = <T>(payload: ApiEnvelope<T> | T): T => {
  if (payload && typeof payload === 'object' && 'data' in (payload as ApiEnvelope<T>)) {
    const data = (payload as ApiEnvelope<T>).data;
    if (data !== undefined) {
      return data;
    }
  }
  return payload as T;
};

export interface SubscriptionGroup {
  id: string;
  subscriptionId?: string;
  ownerUserId?: string;
  seatLimit?: number;
  status?: string;
  [key: string]: unknown;
}

export interface SubscriptionGroupMember {
  id: string;
  groupId?: string;
  type?: 'MEMBER' | 'INVITE';
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
  status?: 'ACTIVE' | 'REMOVED' | 'INVITED' | 'PENDING';
  memberUserId?: string;
  userId?: string;
  phone?: string;
  name?: string;
  email?: string;
  invitedByUserId?: string;
  invitedAt?: string;
  joinedAt?: string;
  removedAt?: string | null;
  expiresAt?: string;
  isActive?: boolean;
  activatedAt?: string;
  activated_at?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface InviteByPhoneResponse {
  success: boolean;
  phone: string;
  inviteId: string;
  expiresAt: string;
  message: string;
}

export const getMySubscriptionGroup = async (): Promise<SubscriptionGroup | null> => {
  const res = await get('/subscription-groups/my-group');
  const group = unwrap<SubscriptionGroup | null>(res as ApiEnvelope<SubscriptionGroup | null> | SubscriptionGroup | null);
  return group ?? null;
};

export const getMySubscriptionGroupMembers = async (): Promise<SubscriptionGroupMember[]> => {
  const res = await get('/subscription-groups/my-group/members');
  const members = unwrap<SubscriptionGroupMember[]>(res as ApiEnvelope<SubscriptionGroupMember[]> | SubscriptionGroupMember[]);
  return Array.isArray(members) ? members : [];
};

export const inviteMySubscriptionGroupMemberByPhone = async (
  phone: string
): Promise<InviteByPhoneResponse> => {
  const res = await post('/subscription-groups/my-group/invites/phone', { phone });
  return unwrap<InviteByPhoneResponse>(res as ApiEnvelope<InviteByPhoneResponse> | InviteByPhoneResponse);
};

export const addMySubscriptionGroupMemberByUserId = async (
  memberUserId: string
): Promise<SubscriptionGroupMember> => {
  const res = await post('/subscription-groups/my-group/members', { memberUserId });
  return unwrap<SubscriptionGroupMember>(res as ApiEnvelope<SubscriptionGroupMember> | SubscriptionGroupMember);
};

export const removeMySubscriptionGroupMember = async (memberUserId: string): Promise<void> => {
  await remove(`/subscription-groups/my-group/members/${memberUserId}`);
};
