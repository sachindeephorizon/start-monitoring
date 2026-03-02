/**
 * Emergency Constants
 * 
 * Constants for emergency system configuration.
 * 
 * NOTE: Timeout values are for server-side reference only.
 * The app does NOT implement timeouts or escalation logic.
 */

import { EmergencyPriority } from './emergency.types';

/**
 * Emergency timeout in seconds
 * 
 * This is used by the server to determine escalation timing.
 * The app does NOT use this value - it's informational only.
 * 
 * If an agent doesn't respond within this time, the server
 * escalates the emergency automatically.
 */
export const EMERGENCY_TIMEOUT_SECONDS = 30;

/**
 * Passkey modal countdown in seconds
 * 
 * Time user has to enter passkey to cancel emergency.
 * After this time expires, emergency is automatically triggered.
 */
export const EMERGENCY_PASSKEY_TIMEOUT_SECONDS = 10;

/**
 * Emergency priority
 * 
 * Default priority for triggered emergencies.
 * Server may adjust priority based on context.
 */
export const DEFAULT_EMERGENCY_PRIORITY: EmergencyPriority = 'critical';

/**
 * Location capture timeout in milliseconds
 * 
 * Maximum time to wait for location capture before proceeding
 * with emergency creation. If location capture takes longer,
 * emergency is created without location.
 */
export const LOCATION_CAPTURE_TIMEOUT_MS = 5000; // 5 seconds

