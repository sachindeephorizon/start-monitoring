import {
  ChatMessageType,
  ChatSenderRole,
  ChatSystemEvent,
} from '@/api/chat';
import { ChatRealtimeEvent } from './chat.socket.enums';

export interface ChatMessageCreatedPayload {
  threadId: string;
  messageId: string;
  senderId?: string | null;
  senderName?: string | null;
  senderRole?: ChatSenderRole;
  messageType: ChatMessageType;
  systemEvent?: ChatSystemEvent | null;
  content?: string | null;
  payload?: Record<string, unknown>;
  replyToId?: string | null;
  createdAt: string | Date;
}

export interface ChatThreadAssignedPayload {
  threadId: string;
  customerId: string;
  previousAgentId?: string | null;
  newAgentId: string;
  assignedById?: string | null;
  reason?: string;
  assignedAt: string | Date;
}

export interface ChatThreadResolvedPayload {
  threadId: string;
  customerId: string;
  currentAgentId?: string | null;
  resolvedById?: string | null;
  resolvedAt: string | Date;
}

export type ChatRealtimePayloadMap = {
  [ChatRealtimeEvent.MESSAGE_CREATED]: ChatMessageCreatedPayload;
  [ChatRealtimeEvent.THREAD_ASSIGNED]: ChatThreadAssignedPayload;
  [ChatRealtimeEvent.THREAD_RESOLVED]: ChatThreadResolvedPayload;
};
