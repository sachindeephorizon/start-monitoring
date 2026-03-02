/**
 * Chat Realtime Subscriptions
 * 
 * Foreground-only real-time subscriptions for chat messages.
 * 
 * iOS SAFETY RULES (CRITICAL):
 * - Realtime subscriptions MUST be mounted/unmounted with the chat screen
 * - NEVER keep subscriptions alive outside the screen
 * - Subscriptions are foreground-only
 * - Background messages are delivered via push notifications
 * 
 * DESIGN PRINCIPLE:
 * > Real-time chat connections exist ONLY while the chat screen is visible.
 * > When the app backgrounds or the screen unmounts, the subscription closes.
 * > New messages arrive via push notifications, which wake the app.
 */

import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Subscribe to chat messages for a chat request
 * 
 * This subscription listens for new messages in the messages table.
 * It filters by user_id and agent_id to get messages for the specific chat.
 * 
 * ⚠️ IMPORTANT: This subscription must be cleaned up when the screen unmounts.
 * Never keep this subscription alive outside the chat screen component.
 * 
 * @param chatRequestId Chat request ID
 * @param agentId Agent ID (from chat request) - null if not assigned
 * @param userId User ID (current user)
 * @param onMessage Callback when new message arrives
 * @returns Unsubscribe function
 */
export function subscribeToChatMessages(
  chatRequestId: string,
  agentId: string | null,
  userId: string,
  onMessage: (message: any) => void
): () => void {
  const channelName = `chat:${chatRequestId}`;
  
  // Create channel for this chat
  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${userId}${agentId ? `,agent_id=eq.${agentId}` : ',agent_id=is.null'}`,
      },
      (payload) => {
        console.log('[Chat Realtime] New message received:', payload.new);
        onMessage(payload.new);
      }
    )
    .subscribe((status) => {
      console.log(`[Chat Realtime] Subscription status for ${channelName}:`, status);
    });

  // Return unsubscribe function
  return () => {
    console.log(`[Chat Realtime] Unsubscribing from ${channelName}`);
    supabase.removeChannel(channel);
  };
}

/**
 * Subscribe to chat request updates
 * 
 * Listens for changes to the chat request itself (status changes, agent assignment, etc.)
 * 
 * @param chatRequestId Chat request ID
 * @param onUpdate Callback when chat request is updated
 * @returns Unsubscribe function
 */
export function subscribeToChatRequest(
  chatRequestId: string,
  onUpdate: (chatRequest: any) => void
): () => void {
  const channelName = `chat_request:${chatRequestId}`;
  
  const channel: RealtimeChannel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_requests',
        filter: `id=eq.${chatRequestId}`,
      },
      (payload) => {
        console.log('[Chat Realtime] Chat request updated:', payload.new);
        onUpdate(payload.new);
      }
    )
    .subscribe((status) => {
      console.log(`[Chat Realtime] Chat request subscription status for ${channelName}:`, status);
    });

  return () => {
    console.log(`[Chat Realtime] Unsubscribing from ${channelName}`);
    supabase.removeChannel(channel);
  };
}

