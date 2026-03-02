/**
 * Stream Chat Service
 * 
 * Real-time chat service using Supabase realtime and API endpoints.
 * Based on old app's streamChat.service.ts but adapted for new app architecture.
 * 
 * iOS SAFETY: Real-time subscriptions are foreground-only.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { apiBaseUrl } from '@/config/environment';
import { supabase } from '@/lib/supabase';
import { AuthSession } from '@/core/auth/auth.session';
import { isCallPriorityActive } from '@/services/callPriority';

type MessageEvent = {
  message: { id: string; text: string; created_at: string };
  user: { id: string | null };
  sender?: 'user' | 'agent' | 'system';
};

type Handler = (event: MessageEvent) => void;

class SimpleEmitter {
  private handlers = new Map<string, Set<Handler>>();

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  emit(event: string, payload: MessageEvent) {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

class SupabaseChatClient extends SimpleEmitter {
  userID: string | null = null;
  user?: { id: string; name?: string };
}

class SupabaseChannel extends SimpleEmitter {
  constructor(public readonly id: string) {
    super();
  }
}

const chatClient = new SupabaseChatClient();
let realtimeChannel: RealtimeChannel | null = null;
let connecting = false;
let isConnected = false;
let currentUserId: string | null = null;
let logicalChannel: SupabaseChannel | null = null;
let messagePollInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncedAt: string | null = null;
const deliveredMessageIds = new Set<string>();
let pollingFailureCount = 0;
const MAX_POLLING_FAILURES = 5;

async function getSessionWithTimeout(timeoutMs = 5000): Promise<{ user: any; token: string } | null> {
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => {
        console.warn(`[streamChat] getSession timed out (${timeoutMs}ms)`);
        resolve(null);
      }, timeoutMs)),
    ]);
    if (!result) {
      // SDK lock held (another refresh in progress) — fall back to SecureStore
      try {
        const stored = await AuthSession.load();
        if (stored?.access_token && stored?.user?.id) {
          console.log('[streamChat] SDK lock held — using SecureStore fallback for user', stored.user.id);
          return {
            user: {
              id: stored.user.id,
              email: stored.user.email ?? '',
              phone: stored.user.phone,
              user_metadata: {
                full_name: stored.user.name,
                name: stored.user.name,
                phone: stored.user.phone,
              },
            },
            token: stored.access_token,
          };
        }
      } catch (e) {
        console.warn('[streamChat] SecureStore fallback failed:', e);
      }
      return null;
    }
    const session = result.data?.session;
    if (!session?.user) return null;
    return { user: session.user, token: session.access_token };
  } catch (e) {
    console.warn('[streamChat] getSession failed:', e);
    return null;
  }
}

async function getSessionToken(): Promise<string | null> {
  const info = await getSessionWithTimeout(5000);
  return info?.token ?? null;
}

function buildMessageEvent(row: any): MessageEvent {
  return {
    message: {
      id: row.id,
      text: row.body ?? '',
      created_at: row.created_at ?? new Date().toISOString(),
    },
    user: {
      id: row.sender === 'agent' ? row.agent_id : row.user_id,
    },
    sender: row.sender || 'user',
  };
}

function subscribeToMessages(userId: string) {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`mobile-chat-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${userId}` },
      (payload) => {
        // iOS: during emergency countdown / call UI, defer non-critical chat fanout.
        if (isCallPriorityActive()) {
          return;
        }
        if (!payload?.new) {
          return;
        }
        if (payload.new.id && deliveredMessageIds.has(payload.new.id)) {
          trackDeliveredTimestamp(payload.new);
          return;
        }
        if (payload.new.id) {
          deliveredMessageIds.add(payload.new.id);
        }
        trackDeliveredTimestamp(payload.new);
        const event = buildMessageEvent(payload.new);
        chatClient.emit('message.new', event);
        logicalChannel?.emit('message.new', event);
      }
    )
    .subscribe();
}

// Agent assignment removed — shared inbox model.
// All messages go to all dashboard agents without routing.

function ensureChannel(userId: string): SupabaseChannel {
  if (!logicalChannel) {
    logicalChannel = new SupabaseChannel(`supabase-chat-${userId}`);
  }
  return logicalChannel;
}

// ensureAgent removed — shared inbox model, no agent routing needed.

function trackDeliveredTimestamp(row: any) {
  if (row?.created_at) {
    if (!lastSyncedAt) {
      lastSyncedAt = row.created_at;
    } else {
      const prev = new Date(lastSyncedAt).getTime();
      const next = new Date(row.created_at).getTime();
      if (next > prev) {
        lastSyncedAt = row.created_at;
      }
    }
  }
}

async function initializeMessageSync(userId: string) {
  try {
    const { data } = await supabase
      .from('messages')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);
    lastSyncedAt = data?.[0]?.created_at ?? null;
  } catch (error) {
    console.warn('[streamChat] Failed to prime message sync', error);
    lastSyncedAt = null;
  }
}

async function pollNewMessages(userId: string) {
  // iOS: during emergency countdown / call UI, defer chat polling.
  if (isCallPriorityActive()) {
    return;
  }
  try {
    let query = supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (lastSyncedAt) {
      query = query.gt('created_at', lastSyncedAt);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    
    // Reset failure count on success
    pollingFailureCount = 0;
    
    if (!data?.length) {
      return;
    }
    data.forEach((row) => {
      if (isCallPriorityActive()) {
        return;
      }
      if (row?.id && deliveredMessageIds.has(row.id)) {
        trackDeliveredTimestamp(row);
        return;
      }
      if (row?.id) {
        deliveredMessageIds.add(row.id);
      }
      trackDeliveredTimestamp(row);
      const event = buildMessageEvent(row);
      chatClient.emit('message.new', event);
      logicalChannel?.emit('message.new', event);
    });
  } catch (error: any) {
    pollingFailureCount++;
    
    // Only log in dev mode to prevent spam
    if (__DEV__) {
      console.warn(`[streamChat] Polling messages failed (${pollingFailureCount}/${MAX_POLLING_FAILURES})`, error);
    }
    
    // Stop polling after too many consecutive failures
    if (pollingFailureCount >= MAX_POLLING_FAILURES) {
      if (__DEV__) {
        console.warn('[streamChat] Stopping message polling due to repeated failures. Will retry on next connect.');
      }
      stopMessagePolling();
      pollingFailureCount = 0; // Reset for next connection attempt
    }
  }
}

function startMessagePolling(userId: string) {
  if (messagePollInterval) {
    return;
  }
  // Reset failure count when starting fresh
  pollingFailureCount = 0;
  messagePollInterval = setInterval(() => {
    if (isCallPriorityActive()) {
      return;
    }
    pollNewMessages(userId);
  }, 3000);
}

function stopMessagePolling() {
  if (messagePollInterval) {
    clearInterval(messagePollInterval);
    messagePollInterval = null;
  }
}

async function ensureConnected(): Promise<void> {
  if (currentUserId && isConnected) {
    return; // Already connected
  }

  try {
    const sessionInfo = await getSessionWithTimeout(5000);
    if (!sessionInfo?.user) {
      throw new Error('User not authenticated');
    }
    const user = sessionInfo.user;
    const userName = user.user_metadata?.full_name || user.email || 'Mobile User';

    // Connect using the streamChat object (will be defined below)
    if (connecting) {
      // Wait for connection to complete
      let attempts = 0;
      while (connecting && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      return;
    }

    // Set up connection manually since we can't call streamChat.connect yet
    if (isConnected && currentUserId === user.id) {
      return;
    }

    connecting = true;
    try {
      currentUserId = user.id;
      chatClient.userID = user.id;
      chatClient.user = { id: user.id, name: userName };

      stopMessagePolling();
      deliveredMessageIds.clear();
      lastSyncedAt = null;
      try {
        await initializeMessageSync(user.id);
      } catch (syncErr: any) {
        console.warn('[streamChat] Message sync init failed (non-fatal):', syncErr?.message);
      }
      subscribeToMessages(user.id);
      ensureChannel(user.id);
      startMessagePolling(user.id);
      isConnected = true;
    } finally {
      connecting = false;
    }
  } catch (error: any) {
    connecting = false;
    if (__DEV__) {
      console.warn('[streamChat] Auto-connect failed:', error);
    }
    // If auto-connect fails, try to get userId from session at least
    if (!currentUserId) {
      const sessionInfo = await getSessionWithTimeout(3000);
      if (sessionInfo?.user) {
        currentUserId = sessionInfo.user.id;
      }
    }
    throw error;
  }
}

export const streamChat = {
  async getClient(): Promise<SupabaseChatClient> {
    return chatClient;
  },

  isConnected(): boolean {
    return isConnected;
  },

  getConnectionState(): { connected: boolean; userId: string | null; healthy: boolean } {
    return {
      connected: isConnected,
      userId: currentUserId,
      healthy: true,
    };
  },

  async connect(userId: string, userName: string): Promise<void> {
    if (connecting) {
      return;
    }
    if (isConnected && currentUserId === userId) {
      return;
    }

    connecting = true;
    try {
      currentUserId = userId;
      chatClient.userID = userId;
      chatClient.user = { id: userId, name: userName };

      stopMessagePolling();
      deliveredMessageIds.clear();
      lastSyncedAt = null;
      try {
        await initializeMessageSync(userId);
      } catch (syncErr: any) {
        console.warn('[streamChat] Message sync init failed (non-fatal):', syncErr?.message);
      }
      subscribeToMessages(userId);
      ensureChannel(userId);
      startMessagePolling(userId);
      isConnected = true;
    } finally {
      connecting = false;
    }
  },

  async disconnect(): Promise<void> {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    stopMessagePolling();
    deliveredMessageIds.clear();
    lastSyncedAt = null;
    currentUserId = null;
    logicalChannel = null;
    chatClient.userID = null;
    chatClient.user = undefined;
    isConnected = false;
  },

  async ensureChannelWithAgent(): Promise<SupabaseChannel> {
    // Auto-connect if not connected
    if (!currentUserId || !isConnected) {
      try {
        await ensureConnected();
      } catch (error: any) {
        // If connection fails, still try to get userId for channel setup
        if (!currentUserId) {
          const sessionInfo = await getSessionWithTimeout(3000);
          if (!sessionInfo?.user) {
            throw new Error('Chat client not connected: User not authenticated');
          }
          currentUserId = sessionInfo.user.id;
        }
        // If still not connected after ensureConnected, throw error
        if (!isConnected) {
          throw new Error('Chat client not connected: Unable to establish connection');
        }
      }
    }
    return ensureChannel(currentUserId!);
  },

  async sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed.length) {
      return;
    }

    // Auto-connect if not connected
    try {
      await ensureConnected();
    } catch (error: any) {
      // If connection fails, still try to get userId for sending
      if (!currentUserId) {
        const sessionInfo = await getSessionWithTimeout(3000);
        if (!sessionInfo?.user) {
          throw new Error('Cannot send message: User not authenticated');
        }
        currentUserId = sessionInfo.user.id;
      }
      // Continue with sending even if connection setup had issues
    }

    if (!currentUserId) {
      throw new Error('Cannot send message: Unable to establish connection');
    }

    const token = await getSessionToken();
    if (!token) {
      throw new Error('Cannot send message: No auth token available. Please try again.');
    }

    let persistedMessage: any = null;

    // Try sending via API first
    try {
      console.log(`[streamChat] Sending message via ${apiBaseUrl}/api/chat/send-message`);
      const sendController = new AbortController();
      const sendTimeout = setTimeout(() => sendController.abort(), 10_000);
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/api/chat/send-message`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            userId: currentUserId,
            text: trimmed,
          }),
          signal: sendController.signal,
        });
      } finally {
        clearTimeout(sendTimeout);
      }

      const payloadRaw = await response.json().catch(() => null);
      // API returns { success, data: { message } } or flat { success, message }
      const payload = payloadRaw?.data || payloadRaw;

      if (response.ok && payloadRaw?.success) {
        persistedMessage = payload?.message;
        console.log('[streamChat] Message sent via API successfully, id:', persistedMessage?.id);
      } else {
        const apiError = payload?.error || payload?.message || 'Failed to send message';
        console.warn('[streamChat] API send-message failed:', response.status, apiError);
        // 401/403 can happen when SecureStore fallback token is stale (SDK lock held).
        // Fall back to direct Supabase insert which uses the SDK's internal auth header.
        const isAuthError = response.status === 401 || response.status === 403;

        if (!isAuthError) {
          throw new Error(apiError);
        }
        console.warn('[streamChat] API auth error (stale token) — falling back to direct Supabase insert');
      }
    } catch (fetchErr: any) {
      const msg = String(fetchErr?.message ?? '').toLowerCase();
      const isRecoverable =
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('unauthorized') ||
        msg.includes('aborted') ||
        msg.includes('timeout') ||
        fetchErr?.name === 'AbortError';
      if (!isRecoverable) {
        throw fetchErr;
      }
      // Network error, no-agents, abort, or auth error — fall back to direct insert
      console.warn('[streamChat] API send failed, falling back to direct insert:', fetchErr?.message);
    }

    // If API didn't persist the message, insert directly via Supabase
    if (!persistedMessage) {
      const { data, error: insertErr } = await supabase
        .from('messages')
        .insert({
          user_id: currentUserId,
          sender: 'user',
          body: trimmed,
        })
        .select('id, body, sender, created_at, user_id, agent_id')
        .single();

      if (insertErr) {
        console.error('[streamChat] Direct insert failed:', insertErr);
        throw new Error('Failed to send message. Please try again.');
      }
      persistedMessage = data;
    }

    // Echo the message so the mobile UI reflects it instantly
    const optimisticRow = persistedMessage || {
      id: `local-${Date.now()}`,
      body: trimmed,
      sender: 'user',
      created_at: new Date().toISOString(),
      user_id: currentUserId,
    };
    trackDeliveredTimestamp(optimisticRow);
    const event = buildMessageEvent(optimisticRow);
    chatClient.emit('message.new', event);
    logicalChannel?.emit('message.new', event);
  },
};

