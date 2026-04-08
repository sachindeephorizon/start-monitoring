import { get, post } from './config';

export type EmergencyStatus = 'ACTIVE' | 'RESOLVED' | 'CANCELLED' | 'ESCALATED';

export interface CommandResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface TriggerEmergencyResult {
  emergencyId: string;
  status: 'ACTIVE';
  callId: string;
  callToken: string;
  trackingId: string;
}

export interface AbortEmergencyPayload {
  passkey: string;
}

export interface UpdateEmergencyStatusPayload {
  status: 'RESOLVED' | 'CANCELLED' | 'ESCALATED';
  resolutionNote?: string;
}

export interface EmergencySessionDto {
  id: string;
  userId: string;
  callSessionId?: string | null;
  locationTrackerId?: string | null;
  status: EmergencyStatus;
  triggerWindowSec: number;
  resolvedByAgentId?: string | null;
  resolutionNote?: string | null;
  triggeredAt: string;
  resolvedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmergencyContextDto {
  emergencyId: string;
  status: EmergencyStatus;
  callId?: string | null;
  callToken?: string | null;
  trackingId?: string | null;
  triggerWindowSec: number;
  triggeredAt: string;
}

export const triggerEmergency = async (): Promise<CommandResponse<TriggerEmergencyResult>> => {
  return await post('/emergency/trigger');
};

export const abortEmergency = async (
  payload: AbortEmergencyPayload,
): Promise<CommandResponse<EmergencySessionDto>> => {
  return await post('/emergency/abort', payload);
};

export const updateEmergencyStatus = async (
  emergencyId: string,
  payload: UpdateEmergencyStatusPayload,
): Promise<CommandResponse<EmergencySessionDto>> => {
  return await post(`/emergency/${encodeURIComponent(emergencyId)}/status`, payload);
};

export const getActiveEmergencyContext = async (): Promise<CommandResponse<EmergencyContextDto | null>> => {
  return await get('/emergency/active');
};

export const getEmergencyContextById = async (
  emergencyId: string,
): Promise<CommandResponse<EmergencyContextDto>> => {
  return await get(`/emergency/${encodeURIComponent(emergencyId)}/context`);
};

export const disableEmergencyById = async (
  emergencyId: string,
  payload: AbortEmergencyPayload,
): Promise<CommandResponse<EmergencySessionDto>> => {
  return await post(`/emergency/${encodeURIComponent(emergencyId)}/disable`, payload);
};
