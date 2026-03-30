import { NotificationEnvelope } from '../core/socket.types';
import {
  ChatMessageType,
  ChatSenderRole,
} from '@/api/chat';
import { ChatRealtimeEvent } from './chat.socket.enums';
import {
  ChatMessageCreatedPayload,
  ChatRealtimePayloadMap,
  ChatThreadAssignedPayload,
  ChatThreadResolvedPayload,
} from './chat.socket.types';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object';
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
};

const asDateLike = (value: unknown): string | Date | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  return undefined;
};

const isChatMessageType = (value: unknown): value is ChatMessageType => {
  return value === 'TEXT' || value === 'SYSTEM' || value === 'MEDIA';
};

const isChatSenderRole = (value: unknown): value is ChatSenderRole => {
  return value === 'USER' || value === 'AGENT' || value === 'SUPERADMIN';
};

export const parseChatRealtimeEvent = (
  envelope: NotificationEnvelope,
):
  | { event: ChatRealtimeEvent.MESSAGE_CREATED; data: ChatMessageCreatedPayload }
  | { event: ChatRealtimeEvent.THREAD_ASSIGNED; data: ChatThreadAssignedPayload }
  | { event: ChatRealtimeEvent.THREAD_RESOLVED; data: ChatThreadResolvedPayload }
  | null => {
  if (!envelope || typeof envelope.event !== 'string' || !isObject(envelope.data)) {
    return null;
  }

  if (envelope.event === ChatRealtimeEvent.MESSAGE_CREATED) {
    const threadId = asString(envelope.data.threadId);
    const messageId = asString(envelope.data.messageId);
    const createdAt = asDateLike(envelope.data.createdAt);

    if (!threadId || !messageId || !createdAt) {
      return null;
    }

    const payload: ChatMessageCreatedPayload = {
      threadId,
      messageId,
      senderId: typeof envelope.data.senderId === 'string' ? envelope.data.senderId : null,
      senderName: asString(envelope.data.senderName) ?? null,
      senderRole: isChatSenderRole(envelope.data.senderRole)
        ? envelope.data.senderRole
        : undefined,
      messageType: isChatMessageType(envelope.data.messageType)
        ? envelope.data.messageType
        : 'TEXT',
      systemEvent: (envelope.data.systemEvent as ChatMessageCreatedPayload['systemEvent']) ?? null,
      content: typeof envelope.data.content === 'string' ? envelope.data.content : null,
      payload: isObject(envelope.data.payload) ? envelope.data.payload : undefined,
      replyToId: typeof envelope.data.replyToId === 'string' ? envelope.data.replyToId : null,
      createdAt,
    };

    return {
      event: ChatRealtimeEvent.MESSAGE_CREATED,
      data: payload,
    };
  }

  if (envelope.event === ChatRealtimeEvent.THREAD_ASSIGNED) {
    const threadId = asString(envelope.data.threadId);
    const customerId = asString(envelope.data.customerId);
    const newAgentId = asString(envelope.data.newAgentId);
    const assignedAt = asDateLike(envelope.data.assignedAt);

    if (!threadId || !customerId || !newAgentId || !assignedAt) {
      return null;
    }

    return {
      event: ChatRealtimeEvent.THREAD_ASSIGNED,
      data: {
        threadId,
        customerId,
        previousAgentId: typeof envelope.data.previousAgentId === 'string' ? envelope.data.previousAgentId : null,
        newAgentId,
        assignedById: typeof envelope.data.assignedById === 'string' ? envelope.data.assignedById : null,
        reason: asString(envelope.data.reason),
        assignedAt,
      },
    };
  }

  if (envelope.event === ChatRealtimeEvent.THREAD_RESOLVED) {
    const threadId = asString(envelope.data.threadId);
    const customerId = asString(envelope.data.customerId);
    const resolvedAt = asDateLike(envelope.data.resolvedAt);

    if (!threadId || !customerId || !resolvedAt) {
      return null;
    }

    return {
      event: ChatRealtimeEvent.THREAD_RESOLVED,
      data: {
        threadId,
        customerId,
        currentAgentId: typeof envelope.data.currentAgentId === 'string' ? envelope.data.currentAgentId : null,
        resolvedById: typeof envelope.data.resolvedById === 'string' ? envelope.data.resolvedById : null,
        resolvedAt,
      },
    };
  }

  return null;
};

export type ChatRealtimeNotification =
  | {
      event: ChatRealtimeEvent.MESSAGE_CREATED;
      data: ChatRealtimePayloadMap[ChatRealtimeEvent.MESSAGE_CREATED];
    }
  | {
      event: ChatRealtimeEvent.THREAD_ASSIGNED;
      data: ChatRealtimePayloadMap[ChatRealtimeEvent.THREAD_ASSIGNED];
    }
  | {
      event: ChatRealtimeEvent.THREAD_RESOLVED;
      data: ChatRealtimePayloadMap[ChatRealtimeEvent.THREAD_RESOLVED];
    };
