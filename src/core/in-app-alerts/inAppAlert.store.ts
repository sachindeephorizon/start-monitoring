import { useSyncExternalStore } from 'react';
import { CreateInAppAlertInput, InAppAlert } from './inAppAlert.types';

type Listener = () => void;

const listeners = new Set<Listener>();
let queue: InAppAlert[] = [];

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeInAppAlerts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInAppAlertQueue(): InAppAlert[] {
  return queue;
}

export function getCurrentInAppAlert(): InAppAlert | null {
  return queue[0] ?? null;
}

export function createInAppAlert(input: CreateInAppAlertInput): InAppAlert {
  return {
    ...input,
    createdAt: input.createdAt ?? Date.now(),
    autoDismissMs: input.autoDismissMs ?? 4000,
  };
}

export function showAlert(alert: InAppAlert): void {
  if (queue.some((item) => item.id === alert.id)) {
    return;
  }

  queue = [...queue, alert];
  emit();
}

export function hideAlert(id: string): void {
  const next = queue.filter((item) => item.id !== id);
  if (next.length === queue.length) {
    return;
  }

  queue = next;
  emit();
}

export function clearAlerts(): void {
  if (queue.length === 0) {
    return;
  }

  queue = [];
  emit();
}

export function useCurrentInAppAlert(): InAppAlert | null {
  return useSyncExternalStore(
    subscribeInAppAlerts,
    getCurrentInAppAlert,
    getCurrentInAppAlert,
  );
}
