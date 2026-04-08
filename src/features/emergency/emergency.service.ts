import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  abortEmergency,
  disableEmergencyById,
  getActiveEmergencyContext,
  getEmergencyContextById,
  triggerEmergency,
  updateEmergencyStatus,
} from '@/api/emergency';
import {
  ActiveEmergencyState,
  EmergencyContextDto,
  EmergencyAbortResult,
  EmergencyCreationResult,
  EmergencySessionDto,
  UpdateEmergencyStatusPayload,
} from './emergency.types';

const ACTIVE_EMERGENCY_STORAGE_KEY = 'emergency.active.v1';
const DEFAULT_ABORT_WINDOW_SEC = 10;

const normalizeErrorMessage = (error: any, fallback: string): string => {
  const apiMessage =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message;

  if (typeof apiMessage !== 'string' || apiMessage.trim().length === 0) {
    return fallback;
  }

  const lower = apiMessage.toLowerCase();
  if (lower.includes('passkey')) {
    return 'Invalid passkey. Emergency flow will continue.';
  }

  if (lower.includes('window') || lower.includes('expired')) {
    return 'Abort window expired. Emergency flow will continue.';
  }

  if (lower.includes('no active emergency') || lower.includes('not found')) {
    return 'No active emergency found. Emergency flow will continue.';
  }

  return apiMessage;
};

const toStatusCode = (error: any): number | undefined => {
  const status = error?.response?.status;
  return typeof status === 'number' ? status : undefined;
};

const toActiveState = (input: EmergencyContextDto): ActiveEmergencyState | null => {
  if (
    input.status !== 'ACTIVE' ||
    !input.emergencyId ||
    !input.callId ||
    !input.callToken ||
    !input.trackingId
  ) {
    return null;
  }

  const triggeredAtMs = Date.parse(input.triggeredAt || '');
  return {
    emergencyId: input.emergencyId,
    callId: input.callId,
    callToken: input.callToken,
    trackingId: input.trackingId,
    triggeredAtMs: Number.isFinite(triggeredAtMs) ? triggeredAtMs : Date.now(),
    abortWindowSec: input.triggerWindowSec || DEFAULT_ABORT_WINDOW_SEC,
  };
};

export const EmergencyService = {
  async trigger(): Promise<EmergencyCreationResult> {
    try {
      const response = await triggerEmergency();
      const data = response?.data;

      if (!data?.emergencyId || !data?.callId || !data?.callToken || !data?.trackingId) {
        return {
          success: false,
          error: 'Emergency trigger response is missing required fields.',
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: normalizeErrorMessage(error, 'Failed to trigger emergency.'),
        statusCode: toStatusCode(error),
      };
    }
  },

  async abort(passkey: string): Promise<EmergencyAbortResult> {
    try {
      const response = await abortEmergency({ passkey });
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: normalizeErrorMessage(error, 'Failed to abort emergency.'),
        statusCode: toStatusCode(error),
      };
    }
  },

  async disable(emergencyId: string, passkey: string): Promise<EmergencyAbortResult> {
    try {
      const response = await disableEmergencyById(emergencyId, { passkey });
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: normalizeErrorMessage(error, 'Failed to disable emergency.'),
        statusCode: toStatusCode(error),
      };
    }
  },

  async updateStatus(
    emergencyId: string,
    payload: UpdateEmergencyStatusPayload,
  ): Promise<EmergencyAbortResult> {
    try {
      const response = await updateEmergencyStatus(emergencyId, payload);
      return {
        success: true,
        data: response.data,
      };
    } catch (error: any) {
      return {
        success: false,
        error: normalizeErrorMessage(error, 'Failed to update emergency status.'),
        statusCode: toStatusCode(error),
      };
    }
  },

  async saveActiveEmergency(state: ActiveEmergencyState): Promise<void> {
    await AsyncStorage.setItem(ACTIVE_EMERGENCY_STORAGE_KEY, JSON.stringify(state));
  },

  async getActiveEmergency(): Promise<ActiveEmergencyState | null> {
    const raw = await AsyncStorage.getItem(ACTIVE_EMERGENCY_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ActiveEmergencyState;
      if (!parsed?.emergencyId || !parsed.callId || !parsed.callToken || !parsed.trackingId) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async clearActiveEmergency(): Promise<void> {
    await AsyncStorage.removeItem(ACTIVE_EMERGENCY_STORAGE_KEY);
  },

  // Compatibility methods for screens that still expect a session DTO.
  async getCurrentEmergency(): Promise<EmergencySessionDto | null> {
    const context = await this.fetchActiveEmergencyContext();
    if (!context) {
      return null;
    }

    return {
      id: context.emergencyId,
      userId: '',
      callSessionId: context.callId,
      locationTrackerId: context.trackingId,
      callId: context.callId,
      callToken: context.callToken,
      trackingId: context.trackingId,
      status: context.status,
      triggerWindowSec: context.triggerWindowSec || DEFAULT_ABORT_WINDOW_SEC,
      resolvedByAgentId: null,
      resolutionNote: null,
      triggeredAt: context.triggeredAt,
      resolvedAt: null,
      cancelledAt: null,
      createdAt: context.triggeredAt,
      updatedAt: new Date().toISOString(),
    };
  },

  async getEmergencyById(emergencyId: string): Promise<EmergencySessionDto | null> {
    const context = await this.fetchEmergencyContextById(emergencyId);
    if (!context) {
      return null;
    }

    return {
      id: context.emergencyId,
      userId: '',
      callSessionId: context.callId,
      locationTrackerId: context.trackingId,
      callId: context.callId,
      callToken: context.callToken,
      trackingId: context.trackingId,
      status: context.status,
      triggerWindowSec: context.triggerWindowSec || DEFAULT_ABORT_WINDOW_SEC,
      resolvedByAgentId: null,
      resolutionNote: null,
      triggeredAt: context.triggeredAt,
      resolvedAt: null,
      cancelledAt: null,
      createdAt: context.triggeredAt,
      updatedAt: new Date().toISOString(),
    };
  },

  async cancel(emergencyId: string, passkey?: string): Promise<boolean> {
    const active = await this.getActiveEmergency();
    if (!active || active.emergencyId !== emergencyId || !passkey) {
      return false;
    }

    const result = await this.abort(passkey);
    return result.success;
  },

  async fetchActiveEmergencyContext(): Promise<EmergencyContextDto | null> {
    try {
      const response = await getActiveEmergencyContext();
      const context = response?.data;
      if (!context) {
        await this.clearActiveEmergency();
        return null;
      }

      const active = toActiveState(context);
      if (active) {
        await this.saveActiveEmergency(active);
      }

      return context;
    } catch {
      return null;
    }
  },

  async fetchEmergencyContextById(emergencyId: string): Promise<EmergencyContextDto | null> {
    try {
      const response = await getEmergencyContextById(emergencyId);
      const context = response?.data;
      if (!context) {
        return null;
      }

      const active = toActiveState(context);
      if (active) {
        await this.saveActiveEmergency(active);
      }

      return context;
    } catch {
      return null;
    }
  },

  async hydrateActiveEmergencyState(): Promise<ActiveEmergencyState | null> {
    const remote = await this.fetchActiveEmergencyContext();
    if (remote) {
      return toActiveState(remote);
    }

    return this.getActiveEmergency();
  },
};

export type {
  ActiveEmergencyState,
  EmergencyAbortResult,
  EmergencyCreationResult,
  EmergencySessionDto,
};
