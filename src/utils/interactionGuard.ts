/**
 * Interaction guard utilities
 * Simplified version for new app
 */

export const iosImmediateInteractionOptions = {};

export async function runInteractionTask<T>(
  label: string,
  task: () => Promise<T>,
  timeout?: number,
  options?: any
): Promise<{ completed: Promise<T> }> {
  return {
    completed: task(),
  };
}

