/**
 * Emergency Types
 * 
 * Type definitions for emergency system functionality.
 * 
 * iOS SAFETY: Emergency system must work reliably even when app is killed.
 * All escalation and agent notification logic runs server-side.
 */

/**
 * Emergency status values
 * 
 * These match the database schema and represent the lifecycle of an emergency.
 */
export type EmergencyStatus =
  | 'triggered'
  | 'active'
  | 'acknowledged'
  | 'in_progress'
  | 'resolved'
  | 'escalated';

/**
 * Emergency priority levels
 */
export type EmergencyPriority = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

/**
 * Emergency payload for triggering an emergency
 * 
 * This is the minimal data needed to create an emergency.
 * Location is optional - emergency must proceed even if location capture fails.
 */
export interface EmergencyPayload {
  /**
   * Optional emergency description/context
   */
  description?: string;

  /**
   * Location latitude (captured automatically if available)
   */
  latitude?: number;

  /**
   * Location longitude (captured automatically if available)
   */
  longitude?: number;

  /**
   * Location accuracy in meters (if available)
   */
  accuracy?: number;

  /**
   * Pre-validated user ID from caller.
   * When provided, the service skips its own getSession() call
   * to avoid SDK auth lock contention during emergency creation.
   */
  userId?: string;

  /**
   * Pre-validated access token from caller.
   * When provided, passed directly to dashboardApiClient to avoid
   * a redundant getSession() call during token retrieval.
   */
  accessToken?: string;
}

/**
 * Emergency record from database
 */
export interface Emergency {
  id: string;
  mobile_user_id: string;
  user_id?: string; // Legacy field, may be null
  description?: string;
  status: EmergencyStatus;
  priority?: EmergencyPriority;
  location?: any; // JSONB - can be PostGIS point or JSON object
  triggered_at: string;
  assigned_agent_id?: string;
  claimed_by?: string;
  resolved_at?: string;
  routed_at?: string; // Timestamp when emergency was routed to agent
  routing_strategy?: string; // Strategy used for agent assignment (e.g., 'load_balance', 'emergency_priority')
  passcode_verification?: boolean; // Whether emergency passkey was verified
  created_at: string;
  updated_at: string;
}

/**
 * Emergency creation result
 */
export interface EmergencyCreationResult {
  success: boolean;
  emergencyId?: string;
  error?: string;
}

