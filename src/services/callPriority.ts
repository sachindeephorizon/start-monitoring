/**
 * Call Priority Service
 * 
 * Global "call priority" flag.
 * When true, startup/preload pipelines should not prompt permissions or run heavy prewarm jobs
 * that compete with Stream join/call UI responsiveness on iOS.
 */

let callPriorityActive = false;

/**
 * Set call priority active state
 */
export function setCallPriorityActive(active: boolean): void {
  callPriorityActive = Boolean(active);
}

/**
 * Check if call priority is active
 */
export function isCallPriorityActive(): boolean {
  return callPriorityActive;
}

