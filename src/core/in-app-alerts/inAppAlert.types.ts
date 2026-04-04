export type InAppAlertKind = 'chat' | 'call';

export interface InAppAlert {
  id: string;
  kind: InAppAlertKind;
  title: string;
  body: string;
  threadId?: string;
  callId?: string;
  createdAt: number;
  autoDismissMs: number;
}

export interface CreateInAppAlertInput {
  id: string;
  kind: InAppAlertKind;
  title: string;
  body: string;
  threadId?: string;
  callId?: string;
  createdAt?: number;
  autoDismissMs?: number;
}
