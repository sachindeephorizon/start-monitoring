/**
 * Chat Hooks
 * 
 * React hooks for chat functionality.
 * 
 * iOS SAFETY: These hooks manage foreground-only real-time subscriptions.
 * Subscriptions are automatically cleaned up when components unmount.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatService } from './chat.service';
import {
  subscribeToChatMessages,
  subscribeToChatRequest,
} from './chat.realtime';
import {
  ChatRequest,
  ChatMessage,
  SendMessagePayload,
  CreateChatRequestPayload,
} from './chat.types';

/**
 * Hook for chat functionality
 * 
 * Manages chat request, messages, and real-time subscriptions.
 * 
 * ⚠️ IMPORTANT: This hook must be used only in chat screen components.
 * The real-time subscription will be cleaned up when the component unmounts.
 * 
 * @param chatRequestId Chat request ID (null if creating new chat)
 * @returns Chat state and methods
 */
export function useChat(chatRequestId: string | null) {
  const [loading, setLoading] = useState(false);
  const [chatRequest, setChatRequest] = useState<ChatRequest | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Track if we're subscribed to avoid duplicate subscriptions
  const isSubscribedRef = useRef(false);

  /**
   * Load chat request and messages
   */
  const loadChat = useCallback(async () => {
    if (!chatRequestId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Load chat request
      const request = await ChatService.getChatRequest(chatRequestId);
      if (!request) {
        setError('Chat request not found');
        setLoading(false);
        return;
      }

      setChatRequest(request);

      // Load messages
      const messageList = await ChatService.getMessages(chatRequestId);
      setMessages(messageList);

      // Mark messages as read
      await ChatService.markMessagesAsRead(chatRequestId);
    } catch (err: any) {
      console.error('[Chat Hook] Error loading chat:', err);
      setError(err.message || 'Failed to load chat');
    } finally {
      setLoading(false);
    }
  }, [chatRequestId]);

  /**
   * Load chat on mount and when chatRequestId changes
   */
  useEffect(() => {
    loadChat();
  }, [loadChat]);

  /**
   * Subscribe to real-time updates
   * 
   * This subscription is foreground-only and is cleaned up on unmount.
   */
  useEffect(() => {
    if (!chatRequestId || !chatRequest || isSubscribedRef.current) {
      return;
    }

    // Use mobile_user_id from chat request (we already have it)
    const userId = chatRequest.mobile_user_id;
    if (!userId) {
      return;
    }

    isSubscribedRef.current = true;

    // Subscribe to new messages
    const unsubscribeMessages = subscribeToChatMessages(
      chatRequestId,
      chatRequest.assigned_agent_id || null,
      userId,
      (newMessage) => {
        // Add new message to list (avoid duplicates)
        setMessages((prev) => {
          const exists = prev.some((msg) => msg.id === newMessage.id);
          if (exists) {
            return prev;
          }
          return [...prev, newMessage as ChatMessage];
        });

        // Mark as read if it's an agent message
        if (newMessage.sender === 'agent') {
          ChatService.markMessagesAsRead(chatRequestId);
        }
      }
    );

    // Subscribe to chat request updates (status changes, agent assignment, etc.)
    const unsubscribeChatRequest = subscribeToChatRequest(
      chatRequestId,
      (updatedRequest) => {
        setChatRequest(updatedRequest as ChatRequest);
      }
    );

    // Cleanup on unmount
    return () => {
      console.log('[Chat Hook] Cleaning up subscriptions');
      unsubscribeMessages();
      unsubscribeChatRequest();
      isSubscribedRef.current = false;
    };
  }, [chatRequestId, chatRequest]);

  /**
   * Send a message
   * 
   * @param content Message content
   * @returns Success status
   */
  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!chatRequestId) {
        return false;
      }

      try {
        const result = await ChatService.sendMessage(chatRequestId, content);
        
        if (result.success) {
          // Reload messages to get the new one
          // (Real-time subscription will also pick it up, but this ensures it's there)
          const messageList = await ChatService.getMessages(chatRequestId);
          setMessages(messageList);
          return true;
        } else {
          setError(result.error || 'Failed to send message');
          return false;
        }
      } catch (err: any) {
        console.error('[Chat Hook] Error sending message:', err);
        setError(err.message || 'Failed to send message');
        return false;
      }
    },
    [chatRequestId]
  );

  /**
   * Close chat request
   * 
   * @returns Success status
   */
  const closeChat = useCallback(async (): Promise<boolean> => {
    if (!chatRequestId) {
      return false;
    }

    try {
      const success = await ChatService.closeChatRequest(chatRequestId);
      if (success) {
        // Reload chat request to reflect closed status
        await loadChat();
      }
      return success;
    } catch (err) {
      console.error('[Chat Hook] Error closing chat:', err);
      return false;
    }
  }, [chatRequestId, loadChat]);

  /**
   * Refresh chat
   */
  const refreshChat = useCallback(() => {
    loadChat();
  }, [loadChat]);

  return {
    loading,
    chatRequest,
    messages,
    error,
    sendMessage,
    closeChat,
    refreshChat,
  };
}

/**
 * Hook for creating a new chat request
 * 
 * @returns Create chat function and loading state
 */
export function useCreateChat() {
  const [loading, setLoading] = useState(false);

  const createChat = useCallback(
    async (
      payload: CreateChatRequestPayload
    ): Promise<{ success: boolean; chatId?: string; error?: string }> => {
      setLoading(true);
      try {
        const result = await ChatService.createChatRequest(payload);
        return result;
      } catch (error: any) {
        console.error('[Create Chat Hook] Error creating chat:', error);
        return {
          success: false,
          error: error.message || 'Failed to create chat',
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    createChat,
  };
}

/**
 * Hook for getting active chat request
 * 
 * @returns Active chat request and loading state
 */
export function useActiveChat() {
  const [loading, setLoading] = useState(false);
  const [activeChat, setActiveChat] = useState<ChatRequest | null>(null);

  const loadActiveChat = useCallback(async () => {
    setLoading(true);
    try {
      const chat = await ChatService.getActiveChatRequest();
      setActiveChat(chat);
    } catch (error) {
      console.error('[Active Chat Hook] Error loading active chat:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveChat();
  }, [loadActiveChat]);

  return {
    loading,
    activeChat,
    refreshActiveChat: loadActiveChat,
  };
}

