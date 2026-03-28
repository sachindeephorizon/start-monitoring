import { get, post } from './config';

export type ChatThreadStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';

export type ChatMessageType = 'TEXT' | 'SYSTEM' | 'MEDIA';

export type ChatSystemEvent =
  | 'AGENT_JOINED'
  | 'AGENT_LEFT'
  | 'AGENT_ASSIGNED'
  | 'AGENT_UNASSIGNED'
  | 'CHAT_RESOLVED'
  | 'CHAT_REOPENED'
  | null;

export type ChatThread = {
  id: string;
  customerId: string;
  currentAgentId?: string | null;
  status: ChatThreadStatus;
  startedAt: string;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageSender = {
  id: string;
  name: string;
  role: 'USER' | 'AGENT' | 'SUPERADMIN';
};

export type ChatSenderRole = ChatMessageSender['role'];

export type ChatMessage = {
  id: string;
  threadId: string;
  senderId?: string | null;
  messageType: ChatMessageType;
  systemEvent?: ChatSystemEvent;
  content?: string | null;
  payload?: Record<string, unknown>;
  replyToId?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  sender?: ChatMessageSender;
};

export type WrappedResponse<T> = {
  status: number;
  message: string;
  data: T;
};

export type PaginatedMessages = {
  data: ChatMessage[];
  total: number;
};

export type CreateThreadBody = {
  reason?: string;
  initialAgentId?: string;
};

export type SendMessageBody = {
  content: string;
  messageType?: ChatMessageType;
  payload?: Record<string, unknown>;
  replyToId?: string;
};

const isWrappedResponse = <T>(value: unknown): value is WrappedResponse<T> => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybe = value as Record<string, unknown>;
  return (
    typeof maybe.status === 'number' &&
    typeof maybe.message === 'string' &&
    'data' in maybe
  );
};

export const createOrGetActiveThread = async (
  body?: CreateThreadBody,
): Promise<ChatThread> => {
  const response = await post('/chat/threads', body ?? {});

  if (isWrappedResponse<ChatThread>(response)) {
    return response.data;
  }

  return response as ChatThread;
};

export const sendThreadMessage = async (
  threadId: string,
  body: SendMessageBody,
): Promise<ChatMessage> => {
  const response = await post(`/chat/threads/${threadId}/messages`, body);

  if (isWrappedResponse<ChatMessage>(response)) {
    return response.data;
  }

  return response as ChatMessage;
};

export const getThreadMessages = async (
  threadId: string,
  page = 1,
  limit = 50,
): Promise<PaginatedMessages> => {
  const response = await get(`/chat/threads/${threadId}/messages`, {
    params: {
      page,
      limit,
    },
  });

  if (isWrappedResponse<PaginatedMessages>(response)) {
    return response.data;
  }

  return response as PaginatedMessages;
};

export const getMyThreads = async (): Promise<ChatThread[]> => {
  const response = await get('/chat/threads/me');

  if (isWrappedResponse<ChatThread[]>(response)) {
    return response.data;
  }

  return response as ChatThread[];
};

export const getThreadDetails = async (
  threadId: string,
): Promise<ChatThread | null> => {
  const response = await get(`/chat/threads/${threadId}`);

  if (isWrappedResponse<ChatThread | null>(response)) {
    return response.data;
  }

  return (response ?? null) as ChatThread | null;
};

export const resolveThread = async (threadId: string): Promise<ChatThread> => {
  const response = await post(`/chat/threads/${threadId}/resolve`, {});

  if (isWrappedResponse<ChatThread>(response)) {
    return response.data;
  }

  return response as ChatThread;
};
