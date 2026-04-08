export type EmergencyStatus = 'ACTIVE' | 'RESOLVED' | 'CANCELLED' | 'ESCALATED';

export type EmergencyPriority = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

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
  callId?: string | null;
  callToken?: string | null;
  trackingId?: string | null;
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

export interface ActiveEmergencyState {
  emergencyId: string;
  callId: string;
  callToken: string;
  trackingId: string;
  triggeredAtMs: number;
  abortWindowSec: number;
}

export interface EmergencyCreationResult {
  success: boolean;
  data?: TriggerEmergencyResult;
  error?: string;
  statusCode?: number;
}

export interface EmergencyAbortResult {
  success: boolean;
  data?: EmergencySessionDto;
  error?: string;
  statusCode?: number;
}

