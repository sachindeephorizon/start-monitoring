import { get } from './config';

export type BackendPlanFrequency = 'MONTHLY' | 'YEARLY';
export type BackendPlanType = 'INDIVIDUAL' | 'FAMILY' | 'ENTERPRISE';

export interface BackendPlan {
  id: string;
  name: string;
  description?: string;
  tagline?: string;
  frequency: BackendPlanFrequency;
  price: number;
  noOfUsers: number;
  type: BackendPlanType;
  gatewayPlanId?: string;
  isDefault: boolean;
  features?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// Returns a raw JSON array (no envelope wrapper).
export const getPlans = async (): Promise<BackendPlan[]> => {
  const res = await get('/plans');
  if (Array.isArray(res)) {
    return res as BackendPlan[];
  }
  return [];
};
