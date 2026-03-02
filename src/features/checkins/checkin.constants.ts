/**
 * Check-In Constants
 * 
 * Constants for check-in system configuration.
 * 
 * NOTE: Timeout and grace period values are for server-side reference only.
 * The app does NOT implement timers or deadline checking logic.
 */

/**
 * Check-in grace period in minutes
 * 
 * This is used by the server to determine how long after scheduled time
 * a check-in can still be completed before being marked as missed.
 * The app does NOT use this value - it's informational only.
 */
export const CHECKIN_GRACE_MINUTES = 5;

/**
 * Default check-in timeout in minutes
 * 
 * Time after which a missed check-in escalates to agent notification.
 * Server-side only.
 */
export const CHECKIN_ESCALATION_TIMEOUT_MINUTES = 15;

