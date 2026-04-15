import { get, post } from "./config";

export type CheckinFrequency = 'ONE_TIME' | 'DAILY' | 'WEEKLY';

export type CheckinStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ESCALATED';

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

export interface AssignScheduleCheckInPayload {
  targetUserId: string;
  startAt: string;
  frequency: CheckinFrequency;
  remarks?: string;
}

export type AssignedCheckinJobStatus =
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CANCELED'
  | 'MISSED'
  | 'TIMEOUT'
  | 'WRONG_PIN';

export interface AssignedCheckinUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

export interface AssignedCheckinJob {
  id: string;
  scheduledAt: string;
  executedAt: string | null;
  status: AssignedCheckinJobStatus;
  attempts: number;
}

export interface AssignedCheckinLastJob {
  id: string;
  scheduledAt: string;
  executedAt: string | null;
  status: AssignedCheckinJobStatus;
}

export interface AssignedCheckinStats {
  completed: number;
  missed: number;
  wrongPin: number;
  timeout: number;
}

export interface AssignedCheckinItem {
  id: string;
  userId: string;
  user: AssignedCheckinUser;
  startAt: string;
  endAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  type: 'SCHEDULE_CHECKIN';
  frequency: CheckinFrequency;
  status: CheckinStatus;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  jobs: AssignedCheckinJob[];
  lastJob: AssignedCheckinLastJob | null;
  stats: AssignedCheckinStats;
}

export interface GetAssignedByMeOptions {
  includeRecent?: boolean;
  recentWindowHours?: number;
}

export interface AssignedCheckinHistoryJob {
  id: string;
  scheduledAt: string;
  executedAt: string | null;
  status: AssignedCheckinJobStatus;
  attempts: number;
}

export interface AssignedCheckinHistoryResponse {
  data: AssignedCheckinHistoryJob[];
  nextCursor: string | null;
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

export type TrackMeStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ESCALATED';

export interface TrackMeLocationPayload {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  capturedAt?: string;
}

export interface CreateTrackMeSessionPayload {
  startAt: string;
  endAt: string;
  interval: number;
  location: TrackMeLocationPayload;
}

export interface TrackMeRealtimeData {
  scheduleCheckinId?: string | null;
  locationTrackingId?: string | null;
  status: TrackMeStatus;
  isLive: boolean;
  intervalMinutes?: number | null;
  startAt?: string;
  endAt?: string | null;
  nextRunAt?: string | null;
  counts?: {
    success: number;
    failed: number;
    pending: number;
    missed: number;
  };
  source?:
    | 'socket_connect_snapshot'
    | 'track_me_created'
    | 'next_run_scheduled'
    | 'checkin_completed'
    | 'checkin_failed'
    | 'checkin_missed'
    | 'track_me_ended'
    | 'track_me_escalated'
    | 'track_me_cancelled'
    | string;
}

export interface TrackMeActiveResponse {
  checkinId: string;
  trackerId: string | null;
  status: TrackMeStatus;
  startAt: string;
  endAt: string | null;
  intervalMinutes: number | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  isLive: boolean;
}

export interface TrackMeStatsResponse {
  totalScheduled: number;
  totalCompleted: number;
  success: number;
  totalMissed: number;
  totalPending: number;
  totalFailed: number;
  wrongPin: number;
  timeout: number;
  remainingScheduled: number;
  expectedTotalUntilEnd?: number;
}

export interface TrackMeHistoryItem {
  id: string;
  scheduledAt: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELED' | 'MISSED' | 'TIMEOUT' | 'WRONG_PIN';
  respondedAt: string | null;
  attempts?: number;
}

export interface TrackMeStateResponse {
  session: TrackMeActiveResponse;
  stats: TrackMeStatsResponse;
  history: TrackMeHistoryItem[];
}

export interface CreateTrackMeSessionResult {
  checkin: {
    id: string;
    locationTrackerId?: string | null;
    type: 'TRACK_ME';
    status: TrackMeStatus;
    startAt: string;
    endAt?: string | null;
    intervalMinutes?: number | null;
    nextRunAt?: string | null;
    lastRunAt?: string | null;
    createdAt: string;
    updatedAt: string;
  };
  trackerId: string;
}

export interface EndTrackMeSessionPayload {
  isSafe: boolean;
  passcode: string;
}

export interface EndTrackMeSessionResult {
  checkin: {
    id: string;
    status: 'COMPLETED' | 'ESCALATED';
    locationTrackerId?: string | null;
    type: 'TRACK_ME';
    updatedAt: string;
    [key: string]: unknown;
  };
  trackerId?: string | null;
  trackerStatus?: 'COMPLETED' | 'ESCALATED';
  isSafe: boolean;
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

export const assignScheduleCheckIn = async (
  input: AssignScheduleCheckInPayload,
): Promise<ScheduleCheckInDto> => {
  const res = await post('/schedule-checkin/assign', input) as CommandResponse<ScheduleCheckInDto>;
  return res.data;
};

export const getAssignedScheduleCheckIns = async (
  options?: GetAssignedByMeOptions,
): Promise<AssignedCheckinItem[]> => {
  const params = new URLSearchParams();
  if (options?.includeRecent) params.set('includeRecent', 'true');
  if (typeof options?.recentWindowHours === 'number') {
    params.set('recentWindowHours', String(options.recentWindowHours));
  }
  const qs = params.toString();
  return get(`/schedule-checkin/assigned-by-me${qs ? `?${qs}` : ''}`) as Promise<AssignedCheckinItem[]>;
};

export const getAssignedCheckInHistory = async (
  checkinId: string,
  options?: { limit?: number; cursor?: string },
): Promise<AssignedCheckinHistoryResponse> => {
  const params = new URLSearchParams();
  if (typeof options?.limit === 'number') params.set('limit', String(options.limit));
  if (options?.cursor) params.set('cursor', options.cursor);
  const qs = params.toString();
  return get(
    `/schedule-checkin/${encodeURIComponent(checkinId)}/assigned-history${qs ? `?${qs}` : ''}`,
  ) as Promise<AssignedCheckinHistoryResponse>;
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

export const createTrackMeSession = async (
  input: CreateTrackMeSessionPayload,
): Promise<CreateTrackMeSessionResult> => {
  const res = await post('/schedule-checkin/track-me', input) as CommandResponse<CreateTrackMeSessionResult>;
  return res.data;
};

export const endTrackMeSession = async (
  checkinId: string,
  input: EndTrackMeSessionPayload,
): Promise<EndTrackMeSessionResult> => {
  const res = await post(
    `/schedule-checkin/track-me/${encodeURIComponent(checkinId)}/end`,
    input,
  ) as CommandResponse<EndTrackMeSessionResult>;
  return res.data;
};

export const getActiveTrackMeSession = async (): Promise<TrackMeActiveResponse | null> => {
  return get('/schedule-checkin/track-me/active') as Promise<TrackMeActiveResponse | null>;
};

export const getTrackMeStats = async (
  checkinId: string,
): Promise<TrackMeStatsResponse> => {
  return get(`/schedule-checkin/track-me/${encodeURIComponent(checkinId)}/stats`) as Promise<TrackMeStatsResponse>;
};

export const getTrackMeHistory = async (
  checkinId: string,
  limit = 50,
): Promise<TrackMeHistoryItem[]> => {
  const safeLimit = Math.max(1, Math.min(200, limit));
  return get(
    `/schedule-checkin/track-me/${encodeURIComponent(checkinId)}/history?limit=${safeLimit}`,
  ) as Promise<TrackMeHistoryItem[]>;
};

export const getTrackMeState = async (
  checkinId: string,
  historyLimit = 20,
): Promise<TrackMeStateResponse> => {
  const safeHistoryLimit = Math.max(1, Math.min(200, historyLimit));
  return get(
    `/schedule-checkin/track-me/${encodeURIComponent(checkinId)}/state?historyLimit=${safeHistoryLimit}`,
  ) as Promise<TrackMeStateResponse>;
};
