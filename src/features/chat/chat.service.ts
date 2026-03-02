/**
 * Chat Service
 *
 * Core chat CRUD operations. This service handles database operations only.
 * Real-time subscriptions are handled separately in chat.realtime.ts.
 *
 * iOS SAFETY: This service does NOT maintain persistent connections.
 * All real-time functionality is foreground-only and managed by the chat screen.
 *
 * PROXY-FIRST:
 * > All database operations go through dashboard proxy first.
 * > Direct Supabase is fallback only (ISP may block Supabase).
 */

import { supabase, ensureValidSession } from '@/lib/supabase';
import { apiBaseUrl } from '@/config/environment';
import {
  ChatRequest,
  ChatMessage,
  SendMessagePayload,
  CreateChatRequestPayload,
} from './chat.types';

/** Get access token from session (works with both SDK Session and FallbackIdentity) */
async function getAccessToken(): Promise<string | null> {
  try {
    const session = await ensureValidSession();
    return (session as any)?.access_token || null;
  } catch {
    return null;
  }
}

/** Helper to make proxy fetch with timeout */
async function proxyFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Chat Service
 *
 * Provides methods for chat operations.
 * Real-time subscriptions are handled separately and only in foreground.
 *
 * Proxy-first: dashboard API is always tried first, direct Supabase is fallback.
 */
export const ChatService = {
  /**
   * Get chat request by ID
   */
  async getChatRequest(chatId: string): Promise<ChatRequest | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch(`/api/mobile/chat?action=getChat&id=${chatId}`, accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Chat Service] Chat request fetched via proxy');
            return (data?.chatRequest as ChatRequest) ?? null;
          }
          console.warn('[Chat Service] Proxy getChatRequest failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy getChatRequest error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { data, error } = await supabase
        .from('chat_requests')
        .select('*')
        .eq('id', chatId)
        .eq('mobile_user_id', user.id)
        .single();

      if (error || !data) {
        return null;
      }

      return data as ChatRequest;
    } catch (error) {
      console.error('[Chat Service] Error getting chat request:', error);
      return null;
    }
  },

  /**
   * Get active chat request for user
   */
  async getActiveChatRequest(): Promise<ChatRequest | null> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return null;
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/chat?action=getActive', accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Chat Service] Active chat request fetched via proxy');
            return (data?.chatRequest as ChatRequest) ?? null;
          }
          console.warn('[Chat Service] Proxy getActiveChatRequest failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy getActiveChatRequest error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { data, error } = await supabase
        .from('chat_requests')
        .select('*')
        .eq('mobile_user_id', user.id)
        .in('status', ['pending', 'assigned', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data as ChatRequest;
    } catch (error) {
      console.error('[Chat Service] Error getting active chat request:', error);
      return null;
    }
  },

  /**
   * Create a new chat request
   */
  async createChatRequest(
    payload: CreateChatRequestPayload
  ): Promise<{ success: boolean; chatId?: string; error?: string }> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/chat', accessToken, {
            method: 'POST',
            body: JSON.stringify({
              action: 'createChat',
              category: payload.category,
              priority: payload.priority,
              location: payload.location,
              message: payload.message,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Chat Service] Chat request created via proxy:', data.chatId);
              return { success: true, chatId: data.chatId };
            }
          }
          console.warn('[Chat Service] Proxy createChatRequest failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy createChatRequest error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const chatData: any = {
        mobile_user_id: user.id,
        status: 'pending',
        category: payload.category || 'general',
        priority: payload.priority || 'medium',
      };

      if (payload.location) {
        chatData.user_location = {
          latitude: payload.location.latitude,
          longitude: payload.location.longitude,
        };
      }

      const { data, error } = await supabase
        .from('chat_requests')
        .insert(chatData)
        .select('id')
        .single();

      if (error) {
        console.error('[Chat Service] Failed to create chat request:', error);
        return {
          success: false,
          error: error.message || 'Failed to create chat request',
        };
      }

      // If initial message provided, send it
      if (payload.message && data?.id) {
        await this.sendMessage(data.id, payload.message);
      }

      return {
        success: true,
        chatId: data.id,
      };
    } catch (error: any) {
      console.error('[Chat Service] Error creating chat request:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Get messages for a chat request
   */
  async getMessages(chatRequestId: string): Promise<ChatMessage[]> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return [];
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch(`/api/mobile/chat?action=getMessages&chatRequestId=${chatRequestId}`, accessToken);
          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            console.log('[Chat Service] Messages fetched via proxy');
            return (data?.messages as ChatMessage[]) ?? [];
          }
          console.warn('[Chat Service] Proxy getMessages failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy getMessages error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      // Get chat request to find agent
      const chatRequest = await this.getChatRequest(chatRequestId);
      if (!chatRequest) {
        return [];
      }

      let query = supabase
        .from('messages')
        .select('*')
        .eq('user_id', user.id);

      if (chatRequest.assigned_agent_id) {
        query = query.eq('agent_id', chatRequest.assigned_agent_id);
      } else {
        query = query.is('agent_id', null);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data as ChatMessage[];
    } catch (error) {
      console.error('[Chat Service] Error getting messages:', error);
      return [];
    }
  },

  /**
   * Send a message
   */
  async sendMessage(
    chatRequestId: string,
    content: string,
    metadata?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated',
        };
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/chat', accessToken, {
            method: 'POST',
            body: JSON.stringify({
              action: 'sendMessage',
              chatRequestId,
              content,
              metadata,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Chat Service] Message sent via proxy');
              return { success: true };
            }
          }
          console.warn('[Chat Service] Proxy sendMessage failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy sendMessage error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      // Get chat request to find agent
      const chatRequest = await this.getChatRequest(chatRequestId);
      if (!chatRequest) {
        return {
          success: false,
          error: 'Chat request not found',
        };
      }

      // Update chat status to 'active' if it was 'pending' or 'assigned'
      if (chatRequest.status === 'pending' || chatRequest.status === 'assigned') {
        await supabase
          .from('chat_requests')
          .update({ status: 'active' })
          .eq('id', chatRequestId);
      }

      // Insert message
      const messageData: any = {
        user_id: user.id,
        sender: 'user',
        body: content,
      };

      if (chatRequest.assigned_agent_id) {
        messageData.agent_id = chatRequest.assigned_agent_id;
      }

      if (metadata) {
        messageData.metadata = metadata;
      }

      const { error } = await supabase.from('messages').insert(messageData);

      if (error) {
        console.error('[Chat Service] Failed to send message:', error);
        return {
          success: false,
          error: error.message || 'Failed to send message',
        };
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[Chat Service] Error sending message:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  },

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(chatRequestId: string): Promise<boolean> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return false;
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/chat', accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              action: 'markRead',
              chatRequestId,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Chat Service] Messages marked as read via proxy');
              return true;
            }
          }
          console.warn('[Chat Service] Proxy markMessagesAsRead failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy markMessagesAsRead error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const chatRequest = await this.getChatRequest(chatRequestId);
      if (!chatRequest) {
        return false;
      }

      let query = supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null)
        .eq('sender', 'agent');

      if (chatRequest.assigned_agent_id) {
        query = query.eq('agent_id', chatRequest.assigned_agent_id);
      } else {
        query = query.is('agent_id', null);
      }

      const { error } = await query;

      if (error) {
        console.error('[Chat Service] Failed to mark messages as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Chat Service] Error marking messages as read:', error);
      return false;
    }
  },

  /**
   * Close chat request
   */
  async closeChatRequest(chatRequestId: string): Promise<boolean> {
    try {
      const session = await ensureValidSession();
      const user = session?.user;
      if (!user) {
        return false;
      }

      const accessToken = (session as any)?.access_token;

      // Proxy-first
      if (accessToken) {
        try {
          const res = await proxyFetch('/api/mobile/chat', accessToken, {
            method: 'PATCH',
            body: JSON.stringify({
              action: 'close',
              chatRequestId,
            }),
          });

          if (res.ok) {
            const json = await res.json();
            const data = json?.data || json;
            if (data?.success) {
              console.log('[Chat Service] Chat request closed via proxy');
              return true;
            }
          }
          console.warn('[Chat Service] Proxy closeChatRequest failed, falling back');
        } catch (proxyErr: any) {
          console.warn('[Chat Service] Proxy closeChatRequest error, falling back:', proxyErr?.message);
        }
      }

      // Fallback: direct Supabase
      const { error } = await supabase
        .from('chat_requests')
        .update({
          status: 'closed',
          closed_at: new Date().toISOString(),
        })
        .eq('id', chatRequestId)
        .eq('mobile_user_id', user.id);

      if (error) {
        console.error('[Chat Service] Failed to close chat request:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[Chat Service] Error closing chat request:', error);
      return false;
    }
  },
};
