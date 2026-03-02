/**
 * Chat Hook
 * 
 * Hook for managing chat messages and real-time updates.
 * Based on old app's useChat hook but adapted for new app architecture.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { streamChat } from '@/services/streamChat.service';
import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import { dedupe, getSessionUser, withTimeout } from '@/core/net/supabaseQuery';
import { QueryCache } from '@/core/net/queryCache';
import { useAuth } from '@/core/auth';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  isTyping: boolean;
  sendMessage: (content: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const isConnectedRef = useRef(false);
  const { isAuthReady } = useAuth(); // ✅ NEW: Auth readiness signal

  const lastLoadedUserIdRef = useRef<string | null>(null);

  // Fetch messages from database
  const fetchMessages = useCallback(async () => {
    return dedupe('chat.fetchMessages', async () => {
      try {
        const user = await getSessionUser();
        if (!user) return;

        const cacheKey = `deephorizon.cache.chat.messages.v1.${user.id}`;
        let usedCache = false;

        // Instant render from cache (stale-while-revalidate)
        if (lastLoadedUserIdRef.current !== user.id) {
          lastLoadedUserIdRef.current = user.id;
        }
        const cached = await QueryCache.get<any[]>(cacheKey, 5 * 60_000);
        if (Array.isArray(cached) && cached.length > 0) {
          usedCache = true;
          const formattedCached: ChatMessage[] = cached.map((row) => ({
            id: row.id,
            text: row.body || '',
            sender: row.sender === 'agent' ? 'agent' : 'user',
            timestamp: new Date(row.created_at),
          }));
          setMessages(formattedCached);
          const unreadIds = cached.filter((m) => m.sender === 'agent' && !m.read_at).map((m) => m.id);
          setUnreadCount(unreadIds.length);
        }

        if (!usedCache) {
          setLoading(true);
        }

        let rows: any[] = [];
        let fetchError: any = null;

        // Proxy-first: try dashboard API
        let accessToken: string | null = null;
        try {
          const session = await ensureValidSession();
          accessToken = (session as any)?.access_token || null;
        } catch {
          // Continue without proxy
        }

        if (accessToken) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10_000);
            try {
              const res = await fetch(`${apiBaseUrl}/api/mobile/chat?action=getMessages`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                signal: controller.signal,
              });
              if (res.ok) {
                const json = await res.json();
                const data = json?.data || json;
                rows = (data?.messages ?? []) as any[];
                console.log('[useChat] Messages fetched via proxy');
              } else {
                console.warn('[useChat] Proxy fetch failed, falling back');
                fetchError = 'proxy_failed';
              }
            } finally {
              clearTimeout(timeoutId);
            }
          } catch (proxyErr: any) {
            console.warn('[useChat] Proxy error, falling back:', proxyErr?.message);
            fetchError = 'proxy_failed';
          }
        } else {
          fetchError = 'no_token';
        }

        // Fallback: direct Supabase
        if (fetchError) {
          const query = supabase
            .from('messages')
            .select('id, body, sender, created_at, read_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .limit(50);

          const { data, error } = await withTimeout(query, 10_000, 'messages.fetch');
          if (error) throw error;
          rows = (data ?? []) as any[];
        }

        // Cache rows for instant next render
        void QueryCache.set(cacheKey, rows).catch(() => {});

        const formattedMessages: ChatMessage[] = rows.map((row: any) => ({
          id: row.id,
          text: row.body || '',
          sender: row.sender === 'agent' ? 'agent' : 'user',
          timestamp: new Date(row.created_at),
        }));
        setMessages(formattedMessages);

        // Calculate unread count (agent messages without read_at)
        const unreadIds = rows.filter((m: any) => m.sender === 'agent' && !m.read_at).map((m: any) => m.id);
        setUnreadCount(unreadIds.length);

        // Mark agent messages as read (best-effort, proxy-first)
        if (unreadIds.length > 0) {
          if (accessToken) {
            // Try via proxy (best-effort)
            void fetch(`${apiBaseUrl}/api/mobile/chat`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ action: 'markReadByIds', messageIds: unreadIds }),
            }).catch(() => {
              // Fallback to direct Supabase
              void withTimeout(
                supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds).eq('user_id', user.id),
                8_000,
                'messages.markRead'
              ).catch(() => {});
            });
          } else {
            void withTimeout(
              supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds).eq('user_id', user.id),
              8_000,
              'messages.markRead'
            ).catch(() => {});
          }
        }
      } catch (err: any) {
        console.error('[useChat] Error fetching messages:', err);
        setError(err?.message || 'Failed to fetch messages');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  // Connect to chat service and subscribe to messages
  useEffect(() => {
    let mounted = true;
    // Track the handler so we can properly unsubscribe on cleanup
    let clientRef: any = null;
    let handlerRef: ((event: any) => void) | null = null;

    const connectAndSubscribe = async () => {
      if (!isAuthReady) {
        console.log('[useChat] Waiting for auth to be ready...');
        return;
      }

      // Prevent double-connection
      if (isConnectedRef.current) {
        console.log('[useChat] Already connected - skipping');
        return;
      }

      try {
        const user = await getSessionUser();
        if (!user || !mounted) {
          return;
        }

        const userName = user.user_metadata?.full_name || user.email || 'Mobile User';

        // Connect to chat service
        await streamChat.connect(user.id, userName);
        if (!mounted) return;
        isConnectedRef.current = true;

        // Fetch initial messages
        await fetchMessages();

        // Subscribe to new messages
        const client = await streamChat.getClient();
        if (!mounted) return;
        clientRef = client;

        const messageHandler = (event: any) => {
          if (!mounted) return;

          const newMessage: ChatMessage = {
            id: event.message.id,
            text: event.message.text,
            sender: event.sender === 'agent' ? 'agent' : 'user',
            timestamp: new Date(event.message.created_at),
          };

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((msg) => msg.id === newMessage.id)) {
              return prev;
            }
            return [...prev, newMessage];
          });

          // Update unread count if agent message
          if (event.sender === 'agent') {
            setUnreadCount((prev) => prev + 1);
          }
        };

        handlerRef = messageHandler;
        client.on('message.new', messageHandler);
      } catch (err: any) {
        console.error('[useChat] Error connecting to chat:', err);
        if (mounted) setError(err.message || 'Failed to connect to chat');
      }
    };

    connectAndSubscribe();

    return () => {
      mounted = false;
      // Properly unsubscribe the event handler (was previously orphaned)
      if (clientRef && handlerRef) {
        try {
          clientRef.off('message.new', handlerRef);
        } catch {
          // Non-critical — client may already be disconnected
        }
      }
      // Disconnect the stream client to prevent memory leaks
      if (isConnectedRef.current) {
        streamChat.disconnect().catch(() => {});
      }
      isConnectedRef.current = false;
    };
  }, [isAuthReady, fetchMessages]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) {
      return;
    }

    try {
      setError(null);
      await streamChat.sendText(content);
      // Message will be added via real-time subscription
    } catch (err: any) {
      console.error('[useChat] Error sending message:', err);
      setError(err.message || 'Failed to send message');
      throw err;
    }
  }, []);

  // Refresh messages
  const refreshMessages = useCallback(async () => {
    await fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    unreadCount,
    loading,
    error,
    isTyping,
    sendMessage,
    refreshMessages,
  };
}

