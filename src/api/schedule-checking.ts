import { get, post } from "./config";

export type CheckinFrequency = 'ONE_TIME' | 'DAILY' | 'WEEKLY';

export type CheckinStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type CheckinJobStatus =
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CANCELED'
  | 'MISSED'
  | 'WRONG_PIN';

export interface ScheduleCheckInDto {
  id: string;
  userId: string;
  startAt: string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  escalationEnabled: boolean;
  escalationDelayMin?: number | null;
  gracePeriodMinutes?: number | null;
  frequency: CheckinFrequency;
  status: CheckinStatus;
  remarks?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckinJobDto {
  id: string;
  checkinId: string;
  scheduledAt: string;
  executedAt?: string | null;
  status: CheckinJobStatus;
  attempts: number;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleCheckInPayload {
  startAt: string;
  frequency: CheckinFrequency;
  remarks?: string;
}

export interface UpdateCheckinJobStatusPayload {
  passcode: string;
}

export interface ProcessDueCheckinsPayload {
  limit?: number;
}

export interface TimeoutCheckinJobPayload {
  source: 'passkey_modal_expired';
}

export interface UpdateCheckinJobStatusResult {
  jobId: string;
  status: CheckinJobStatus;
  scheduleId: string;
  escalated: boolean;
  remainingAttempts: number;
  maxAttempts: number;
  passcodeMatched: boolean;
}

export interface ProcessDueCheckinsResult {
  processed: number;
  escalated: number;
  missed: number;
}

export interface TimeoutCheckinJobResult {
  jobId: string;
  status: CheckinJobStatus;
  scheduleId: string;
}

export interface CommandResponse<T> {
  status: number;
  message: string;
  data: T;
}

export const createScheduleCheckIn = async (
  input: CreateScheduleCheckInPayload,
): Promise<ScheduleCheckInDto> => {
  const res = await post('/schedule-checkin', input) as CommandResponse<ScheduleCheckInDto>;
  return res.data;
};

export const getMyScheduleCheckIns = async (status?: CheckinStatus): Promise<ScheduleCheckInDto[]> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return get(`/schedule-checkin/my${query}`) as Promise<ScheduleCheckInDto[]>;
};

export const getScheduleCheckInJobs = async (checkinId: string): Promise<CheckinJobDto[]> => {
  return get(`/schedule-checkin/${encodeURIComponent(checkinId)}/jobs`) as Promise<CheckinJobDto[]>;
};

export const cancelScheduleCheckIn = async (checkinId: string): Promise<ScheduleCheckInDto> => {
  const res = await post(`/schedule-checkin/${encodeURIComponent(checkinId)}/cancel`) as CommandResponse<ScheduleCheckInDto>;
  return res.data;
};

export const updateCheckinJobStatus = async (
  jobId: string,
  input: UpdateCheckinJobStatusPayload,
): Promise<UpdateCheckinJobStatusResult> => {
  const res = await post(
    `/schedule-checkin/jobs/${encodeURIComponent(jobId)}/status`,
    input,
  ) as CommandResponse<UpdateCheckinJobStatusResult>;
  return res.data;
};

export const processDueCheckins = async (
  input?: ProcessDueCheckinsPayload,
): Promise<ProcessDueCheckinsResult> => {
  const res = await post('/schedule-checkin/process-due', input ?? {}) as CommandResponse<ProcessDueCheckinsResult>;
  return res.data;
};

export const timeoutCheckinJob = async (
  jobId: string,
  input: TimeoutCheckinJobPayload,
): Promise<TimeoutCheckinJobResult> => {
  const res = await post(
    `/schedule-checkin/jobs/${encodeURIComponent(jobId)}/timeout`,
    input,
  ) as CommandResponse<TimeoutCheckinJobResult>;
  return res.data;
};
