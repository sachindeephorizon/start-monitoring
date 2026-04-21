/**
 * monitoring API — talks to the dedicated location-service backend
 * (rewp2 / Railway). Has its own axios instance because it doesn't share
 * a base URL with the main Deep Horizon API.
 *
 * Endpoint convention: most routes use `:id` = userId (NOT sessionId).
 * The backend creates a session implicitly on first ping.
 */

import axios from 'axios';

const LOCATION_SERVICE_URL =
  process.env.EXPO_PUBLIC_LOCATION_SERVICE_URL ||
  'https://rewp2-production.up.railway.app';

export const monitoringClient = axios.create({
  baseURL: LOCATION_SERVICE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ── Types ───────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PingPayload {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
  speed?: number;
  heading?: number;
  moving?: boolean;
  activity?: string;
  source?: string;
  appState?: string;
  sequence?: number;
  gpsIntervalMs?: number;
  sessionId?: string;
}

export interface DeviationAlert {
  zone: string;
  consecutive: number;
  severity?: 'short' | 'long';
  destinationName?: string | null;
  detectedAt?: string;
}

export type Tier = 1 | 2 | 3;

export interface PingResponse {
  ok: boolean;
  data?: any;
  filtered?: boolean;
  reason?: string;
  forceRefresh?: boolean;
  deviationAlert?: DeviationAlert | null;
  arrivalDetected?: boolean;
  inactivityFlag?: boolean;
  tier?: Tier | null;
  tierName?: 'passive' | 'active' | 'emergency' | null;
  intervalMinutes?: number | null;
  nextCheckinAt?: string | null;
  /**
   * True when the backend's `getCheckinSnapshot` detected an overdue
   * check-in (now > nextCheckinAt + 30s with no response) on this ping.
   * Server has already shifted tier to T3 + triggered escalation; client
   * should mirror locally + navigate to EscalationScreen.
   */
  missedCheckin?: boolean;
}

export interface DestinationInfo {
  ok: boolean;
  active: boolean;
  destination?: LatLng;
  name?: string;
  distance?: number;
  duration?: number;
  setAt?: string;
  route?: LatLng[];
  corridor?: any;
}

export interface RemainingInfo {
  ok: boolean;
  active: boolean;
  remaining?: number;
  destination?: LatLng;
  name?: string;
}

export interface StreamInfo {
  ok: boolean;
  data: any;
  sessionMeta?: any;
  startedAt?: string;
  startMarker?: LatLng;
  trail?: Array<{ lat: number; lng: number; timestamp: number }>;
}

export interface StopResponse {
  ok: boolean;
  session: {
    id: string;
    name?: string;
    userId: string;
    startedAt: string;
    endedAt: string;
    durationSecs: number;
    totalPings: number;
    startLocation?: LatLng;
    endLocation?: LatLng;
    trail?: Array<{ lat: number; lng: number; timestamp: number }>;
  };
}

// ── Calls ───────────────────────────────────────────────────────────────────

export async function pingLocation(
  userId: string,
  payload: PingPayload,
): Promise<PingResponse> {
  const res = await monitoringClient.post<PingResponse>(
    `/${encodeURIComponent(userId)}/ping`,
    payload,
  );
  return res.data;
}

export async function stopTracking(userId: string): Promise<StopResponse> {
  const res = await monitoringClient.post<StopResponse>(
    `/${encodeURIComponent(userId)}/stop`,
    {},
    { timeout: 8000 },
  );
  return res.data;
}

export type TripProfile = 'cab' | 'walking' | 'meeting' | 'custom';

export async function setDestination(
  userId: string,
  origin: LatLng,
  destination: LatLng,
  name?: string,
  tripType?: TripProfile,
): Promise<{
  ok: boolean;
  distance: number;
  duration: number;
  routePoints: number;
  tripType?: TripProfile | null;
  profileUsed?: 'driving' | 'walking' | 'cycling';
}> {
  const res = await monitoringClient.post(
    `/destination/${encodeURIComponent(userId)}/set`,
    { origin, destination, name, tripType },
  );
  return res.data;
}

export async function clearDestination(userId: string): Promise<{ ok: boolean }> {
  const res = await monitoringClient.post(
    `/destination/${encodeURIComponent(userId)}/clear`,
    {},
  );
  return res.data;
}

export async function getDestination(
  userId: string,
  options?: { includeRoute?: boolean; includeCorridor?: boolean },
): Promise<DestinationInfo> {
  const params: Record<string, string> = {};
  if (options?.includeRoute) params.includeRoute = 'true';
  if (options?.includeCorridor) params.includeCorridor = 'true';
  const res = await monitoringClient.get<DestinationInfo>(
    `/destination/${encodeURIComponent(userId)}`,
    { params },
  );
  return res.data;
}

export async function getDestinationRemaining(
  userId: string,
): Promise<RemainingInfo> {
  const res = await monitoringClient.get<RemainingInfo>(
    `/destination/${encodeURIComponent(userId)}/remaining`,
  );
  return res.data;
}

export async function getUserStream(userId: string): Promise<StreamInfo> {
  const res = await monitoringClient.get<StreamInfo>(
    `/user/${encodeURIComponent(userId)}/stream`,
  );
  return res.data;
}

export async function getSessionDistance(
  userId: string,
): Promise<{ ok: boolean; distance: number; points: number }> {
  const res = await monitoringClient.get(
    `/user/${encodeURIComponent(userId)}/session-distance`,
  );
  return res.data;
}

export async function getSessionEvents(
  sessionId: string,
): Promise<{ ok: boolean; data: any[] }> {
  const res = await monitoringClient.get(
    `/session/${encodeURIComponent(sessionId)}/events`,
  );
  return res.data;
}

// ── /handling/* — session lifecycle (entry / checkin / escalation) ─────────

export interface HandlingDestination {
  name: string;
  lat: number;
  long: number;
}

export interface TrustedContact {
  name: string;
  relation: string;
  notify: boolean;
}

export type HandlingTripType = 'cab' | 'walking' | 'meeting' | 'custom';

export async function entryStart(
  userId: string,
): Promise<{ user_id: string; session_id: string; status: string; started_at: string }> {
  const res = await monitoringClient.post('/handling/entry', { user_id: userId });
  return res.data;
}

export async function entryDetails(
  userId: string,
  body: {
    destination?: HandlingDestination;
    trip_type?: HandlingTripType;
    trusted_contacts?: TrustedContact[];
  },
): Promise<any> {
  const res = await monitoringClient.put(
    `/handling/entry/${encodeURIComponent(userId)}/details`,
    body,
  );
  return res.data;
}

export async function entryEnd(userId: string): Promise<any> {
  const res = await monitoringClient.put(
    `/handling/entry/${encodeURIComponent(userId)}/end`,
  );
  return res.data;
}

export async function entrySummary(userId: string): Promise<any> {
  const res = await monitoringClient.get(
    `/handling/entry/${encodeURIComponent(userId)}/summary`,
  );
  return res.data;
}

export async function checkinStart(userId: string): Promise<any> {
  const res = await monitoringClient.post(
    `/handling/checkin/${encodeURIComponent(userId)}/start`,
  );
  return res.data;
}

export interface CheckinRespondResponse {
  user_id: string;
  status: 'safe' | 'need_help';
  tier: Tier;
  tier_name?: 'passive' | 'active' | 'emergency';
  interval_minutes?: number;
  next_checkin_at?: string;
  checkin_count?: number;
  trigger_escalation?: boolean;
}

export async function checkinRespond(
  userId: string,
  isSafe: boolean,
): Promise<CheckinRespondResponse> {
  const res = await monitoringClient.post<CheckinRespondResponse>(
    `/handling/checkin/${encodeURIComponent(userId)}/respond`,
    { is_safe: isSafe },
  );
  return res.data;
}

export async function checkinMissed(userId: string): Promise<any> {
  const res = await monitoringClient.post(
    `/handling/checkin/${encodeURIComponent(userId)}/missed`,
  );
  return res.data;
}

export type EscalationReason = 'missed_checkin' | 'need_help' | 'sos' | 'manual';

export async function escalationTrigger(
  userId: string,
  reason: EscalationReason,
): Promise<{
  user_id: string;
  escalation_id: string;
  current_step: number;
  steps: any[];
}> {
  const res = await monitoringClient.post(
    `/handling/escalation/${encodeURIComponent(userId)}/trigger`,
    { reason },
  );
  return res.data;
}

export interface EscalationCancelResponse {
  user_id: string;
  resolved: boolean;
  tier_reset_to: Tier;
  resolved_at?: string;
}

export async function escalationCancel(
  userId: string,
): Promise<EscalationCancelResponse> {
  const res = await monitoringClient.put<EscalationCancelResponse>(
    `/handling/escalation/${encodeURIComponent(userId)}/safe`,
  );
  return res.data;
}

export async function escalationStatus(userId: string): Promise<any> {
  const res = await monitoringClient.get(
    `/handling/escalation/${encodeURIComponent(userId)}/status`,
  );
  return res.data;
}
