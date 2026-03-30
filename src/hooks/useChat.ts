import { useState, useEffect, useCallback, useRef } from 'react';
import { AxiosError } from 'axios';
import {
  ChatMessage as ApiChatMessage,
  ChatThread,
  createOrGetActiveThread,
  getThreadDetails,
  getThreadMessages,
  resolveThread,
  sendThreadMessage,
} from '@/api/chat';
import { clearApiSession, getApiSession } from '@/session/session';
import { useAuth } from '@/core/auth';
import {
  chatSocketService,
  NotificationEnvelope,
  SocketConnectionState,
} from '@/realtime/core';
import {
  ChatRealtimeEvent,
  parseChatRealtimeEvent,
} from '@/realtime/chat';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent' | 'system';
  timestamp: Date;
  messageType: 'TEXT' | 'SYSTEM' | 'MEDIA';
  systemEvent?: ApiChatMessage['systemEvent'];
}

export interface UseChatReturn {
  messages: ChatMessage[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  isTyping: boolean;
  activeThreadId: string | null;
  threadStatus: ChatThread['status'] | null;
  hasAssignedAgent: boolean;
  sendMessage: (content: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
  resolveActiveThread: () => Promise<void>;
}

export interface UseChatOptions {
  initialThreadId?: string;
}

const isAxiosErrorWithStatus = (
  error: unknown,
): error is AxiosError & { response: { status: number } } => {
  return !!(
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as AxiosError).response &&
    typeof (error as AxiosError).response?.status === 'number'
  );
};

const mapMessageToUi = (
  message: ApiChatMessage,
  currentUserId: string | undefined,
): ChatMessage => {
  const isSystemMessage = message.messageType === 'SYSTEM' || !!message.systemEvent;
  const senderRole = message.sender?.role;
  let sender: 'user' | 'agent' | 'system' = 'agent';

  if (isSystemMessage) {
    sender = 'system';
  } else if (senderRole === 'USER' || (currentUserId && message.senderId === currentUserId)) {
    sender = 'user';
  }

  return {
    id: message.id,
    text: message.content?.trim() || '',
    sender,
    timestamp: new Date(message.createdAt),
    messageType: message.messageType,
    systemEvent: message.systemEvent ?? null,
  };
};

export function useChat(options?: UseChatOptions): UseChatReturn {
  const initialThreadId = options?.initialThreadId;
  const { isAuthReady, user, signOut } = useAuth();
  const socketBaseUrl = (
    process.env.EXPO_PUBLIC_WEBSOCKET_URL ||
    process.env.EXPO_PUBLIC_BACKEND_URL ||
    ''
  ).replace(/\/$/, '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threadStatus, setThreadStatus] = useState<ChatThread['status'] | null>(null);
  const [hasAssignedAgent, setHasAssignedAgent] = useState(false);
  const hasConnectedOnceRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleError = useCallback(async (err: unknown, fallbackMessage: string) => {
    if (isAxiosErrorWithStatus(err) && err.response.status === 401) {
      setError('Session expired. Please login again.');
      await clearApiSession().catch(() => {});
      await signOut().catch(() => {});
      return;
    }

    if (isAxiosErrorWithStatus(err) && err.response.status === 403) {
      setError('You are not allowed to access this chat thread.');
      return;
    }

    setError(fallbackMessage);
  }, [signOut]);

  const loadMessages = useCallback(async (threadId: string) => {
    const response = await getThreadMessages(threadId, 1, 50);
    const mapped = response.data
      .map((message) => mapMessageToUi(message, user?.id))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    setMessages(mapped);

    const unread = mapped.filter((message) => message.sender === 'agent').length;
    setUnreadCount(unread);
  }, [user?.id]);

  const appendMessageIfMissing = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((item) => item.id === message.id)) {
        return prev;
      }

      return [...prev, message].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
      );
    });
  }, []);

  const replaceOptimisticMessage = useCallback((tempId: string, confirmed: ChatMessage) => {
    setMessages((prev) => {
      const hasConfirmed = prev.some((item) => item.id === confirmed.id);

      const withoutTemp = prev.filter((item) => item.id !== tempId);
      if (hasConfirmed) {
        return withoutTemp;
      }

      return prev.map((item) => (item.id === tempId ? confirmed : item));
    });
  }, []);

  const refreshThreadState = useCallback(async (threadId: string) => {
    const thread = await getThreadDetails(threadId);
    setThreadStatus(thread?.status ?? null);
    setHasAssignedAgent(!!thread?.currentAgentId);
  }, []);

  const waitForAgentAssignment = useCallback(async (
    threadId: string,
    timeoutMs = 30000,
    intervalMs = 1500,
  ): Promise<boolean> => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const thread = await getThreadDetails(threadId);
      const assigned = !!thread?.currentAgentId;

      setThreadStatus(thread?.status ?? null);
      setHasAssignedAgent(assigned);

      if (assigned) {
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return false;
  }, []);

  const ensureThread = useCallback(async (): Promise<string> => {
    if (activeThreadId) {
      if (threadStatus === 'OPEN') {
        return activeThreadId;
      }

      // Guard against stale local status: verify current thread on backend before creating a new one.
      const existingThread = await getThreadDetails(activeThreadId).catch(() => null);
      if (existingThread?.status === 'OPEN') {
        setThreadStatus(existingThread.status);
        setHasAssignedAgent(!!existingThread.currentAgentId);
        return activeThreadId;
      }
    }

    const thread = await createOrGetActiveThread();
    const didSwitchThread = thread.id !== activeThreadIdRef.current;

    setActiveThreadId(thread.id);
    setThreadStatus(thread.status);
    setHasAssignedAgent(!!thread.currentAgentId);

    if (didSwitchThread) {
      setMessages([]);
      setUnreadCount(0);
    }

    return thread.id;
  }, [activeThreadId, threadStatus]);

  const initializeChat = useCallback(async () => {
    if (!isAuthReady) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (initialThreadId) {
        const requestedThread = await getThreadDetails(initialThreadId);
        if (requestedThread) {
          setActiveThreadId(requestedThread.id);
          setThreadStatus(requestedThread.status);
          setHasAssignedAgent(!!requestedThread.currentAgentId);

          await Promise.all([
            loadMessages(requestedThread.id),
            refreshThreadState(requestedThread.id),
          ]);

          return;
        }
      }

      const thread = await createOrGetActiveThread();
      setActiveThreadId(thread.id);
      setThreadStatus(thread.status);
      setHasAssignedAgent(!!thread.currentAgentId);

      await Promise.all([
        loadMessages(thread.id),
        refreshThreadState(thread.id),
      ]);
    } catch (err) {
      await handleError(err, 'Unable to load chat. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [handleError, initialThreadId, isAuthReady, loadMessages, refreshThreadState]);

  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  const handleSocketNotification = useCallback((envelope: NotificationEnvelope) => {
    const parsed = parseChatRealtimeEvent(envelope);
    const currentThreadId = activeThreadIdRef.current;

    if (!parsed || !currentThreadId) {
      return;
    }

    if (parsed.data.threadId !== currentThreadId) {
      if (parsed.event === ChatRealtimeEvent.MESSAGE_CREATED) {
        setUnreadCount((prev) => prev + 1);
      }
      return;
    }

    if (parsed.event === ChatRealtimeEvent.MESSAGE_CREATED) {
      const isSystemMessage =
        parsed.data.messageType === 'SYSTEM' ||
        !!parsed.data.systemEvent;

      const sender: ChatMessage['sender'] = isSystemMessage
        ? 'system'
        : parsed.data.senderRole === 'USER' ||
          parsed.data.senderId === user?.id
          ? 'user'
          : 'agent';

      appendMessageIfMissing({
        id: parsed.data.messageId,
        text: parsed.data.content?.trim() || '',
        sender,
        timestamp: new Date(parsed.data.createdAt),
        messageType: parsed.data.messageType,
        systemEvent: parsed.data.systemEvent ?? null,
      });
      return;
    }

    if (parsed.event === ChatRealtimeEvent.THREAD_ASSIGNED) {
      setHasAssignedAgent(true);
      appendMessageIfMissing({
        id: `system-assigned-${String(parsed.data.assignedAt)}`,
        text: 'Agent joined your chat',
        sender: 'system',
        timestamp: new Date(parsed.data.assignedAt),
        messageType: 'SYSTEM',
        systemEvent: 'AGENT_ASSIGNED',
      });

      void refreshThreadState(currentThreadId).catch(() => {
        void loadMessages(currentThreadId).catch(() => {});
      });
      return;
    }

    if (parsed.event === ChatRealtimeEvent.THREAD_RESOLVED) {
      setThreadStatus('RESOLVED');
      appendMessageIfMissing({
        id: `system-resolved-${String(parsed.data.resolvedAt)}`,
        text: 'Chat resolved',
        sender: 'system',
        timestamp: new Date(parsed.data.resolvedAt),
        messageType: 'SYSTEM',
        systemEvent: 'CHAT_RESOLVED',
      });

      void refreshThreadState(currentThreadId).catch(() => {
        void loadMessages(currentThreadId).catch(() => {});
      });
    }
  }, [appendMessageIfMissing, loadMessages, refreshThreadState, user?.id]);

  useEffect(() => {
    if (!isAuthReady) {
      return;
    }

    if (!socketBaseUrl) {
      console.warn('[useChat] Missing socket base URL. Set EXPO_PUBLIC_WEBSOCKET_URL or EXPO_PUBLIC_BACKEND_URL');
      return;
    }

    const syncLatestToken = async () => {
      const latestToken = (await getApiSession()).token;
      if (latestToken) {
        chatSocketService.connect(socketBaseUrl, latestToken);
      }
    };

    void syncLatestToken();
    const tokenSyncInterval = setInterval(() => {
      void syncLatestToken();
    }, 15000);

    chatSocketService.onNotification(handleSocketNotification);

    const connectionStateHandler = (state: SocketConnectionState) => {
      const currentThreadId = activeThreadIdRef.current;
      if (state !== SocketConnectionState.CONNECTED || !currentThreadId) {
        return;
      }

      if (hasConnectedOnceRef.current) {
        void Promise.all([
          loadMessages(currentThreadId),
          refreshThreadState(currentThreadId),
        ]).catch(() => {});
      }

      hasConnectedOnceRef.current = true;
    };

    chatSocketService.onConnectionStateChange(connectionStateHandler);

    return () => {
      clearInterval(tokenSyncInterval);
      chatSocketService.offNotification(handleSocketNotification);
      chatSocketService.offConnectionStateChange(connectionStateHandler);
    };
  }, [handleSocketNotification, isAuthReady, loadMessages, refreshThreadState, socketBaseUrl]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    let tempMessageId = '';
    const currentThreadId = activeThreadIdRef.current;
    const wasResolvedOrClosed = threadStatus === 'RESOLVED' || threadStatus === 'CLOSED';
    const canSendImmediately = !!currentThreadId && threadStatus === 'OPEN' && !wasResolvedOrClosed;

    try {
      setError(null);
      const threadId = canSendImmediately
        ? currentThreadId
        : await ensureThread();

      if (wasResolvedOrClosed) {
        const waitingMessageId = `system-waiting-agent-${threadId}-${Date.now()}`;
        appendMessageIfMissing({
          id: waitingMessageId,
          text: 'Starting a new chat. Waiting for an agent to connect...',
          sender: 'system',
          timestamp: new Date(),
          messageType: 'SYSTEM',
          systemEvent: null,
        });

        const isAssigned = await waitForAgentAssignment(threadId);
        if (!isAssigned) {
          throw new Error('No agent connected yet. Please try again in a moment.');
        }
      }

      const latestTimestamp = messagesRef.current[messagesRef.current.length - 1]?.timestamp?.getTime() ?? 0;
      const optimisticTimestamp = new Date(Math.max(Date.now(), latestTimestamp + 1));

      tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      appendMessageIfMissing({
        id: tempMessageId,
        text: trimmed,
        sender: 'user',
        timestamp: optimisticTimestamp,
        messageType: 'TEXT',
        systemEvent: null,
      });

      const sentMessage = await sendThreadMessage(threadId, {
        content: trimmed,
        messageType: 'TEXT',
      });

      replaceOptimisticMessage(tempMessageId, mapMessageToUi(sentMessage, user?.id));
      void refreshThreadState(threadId).catch(() => {});
    } catch (err) {
      if (tempMessageId) {
        setMessages((prev) => prev.filter((item) => item.id !== tempMessageId));
      }
      await handleError(err, err instanceof Error ? err.message : 'Unable to send message, try again');
      throw err;
    }
  }, [appendMessageIfMissing, ensureThread, handleError, refreshThreadState, replaceOptimisticMessage, threadStatus, user?.id, waitForAgentAssignment]);

  const refreshMessages = useCallback(async () => {
    try {
      setError(null);
      const threadId = await ensureThread();
      await Promise.all([
        loadMessages(threadId),
        refreshThreadState(threadId),
      ]);
    } catch (err) {
      await handleError(err, 'Unable to refresh chat. Please try again.');
    }
  }, [ensureThread, handleError, loadMessages, refreshThreadState]);

  const resolveActiveThread = useCallback(async () => {
    if (!activeThreadId) {
      return;
    }

    try {
      setError(null);
      const resolvedThread = await resolveThread(activeThreadId);
      setThreadStatus(resolvedThread.status);
      await loadMessages(activeThreadId);
    } catch (err) {
      await handleError(err, 'Unable to resolve chat. Please try again.');
      throw err;
    }
  }, [activeThreadId, handleError, loadMessages]);

  return {
    messages,
    unreadCount,
    loading,
    error,
    isTyping: false,
    activeThreadId,
    threadStatus,
    hasAssignedAgent,
    sendMessage,
    refreshMessages,
    resolveActiveThread,
  };
}

