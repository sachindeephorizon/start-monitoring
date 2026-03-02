/**
 * Chat Types
 * 
 * Type definitions for real-time chat functionality.
 * 
 * iOS SAFETY: Real-time chat connections are foreground-only.
 * Background messages are delivered via push notifications.
 */

/**
 * Chat request status values
 * 
 * These match the database schema and represent the lifecycle of a chat request.
 */
export type ChatStatus =
  | 'pending'
  | 'assigned'
  | 'active'
  | 'closed';

/**
 * Chat priority levels
 */
export type ChatPriority = 'low' | 'medium' | 'high' | 'emergency';

/**
 * Chat categories
 */
export type ChatCategory =
  | 'general'
  | 'emergency'
  | 'technical'
  | 'billing'
  | 'safety';

/**
 * Message sender type
 */
export type MessageSender = 'user' | 'agent' | 'system';

/**
 * Chat request record from database
 */
export interface ChatRequest {
  id: string;
  mobile_user_id: string;
  assigned_agent_id?: string;
  status: ChatStatus;
  priority?: ChatPriority;
  category?: ChatCategory;
  user_location?: any; // JSONB
  user_info?: any; // JSONB
  created_at: string;
  assigned_at?: string;
  closed_at?: string;
  updated_at: string;
}

/**
 * Chat message record from database
 * 
 * NOTE: The database schema uses user_id/agent_id relationship,
 * but we work with chat requests as the primary entity.
 */
export interface ChatMessage {
  id: string;
  user_id: string; // References auth.users(id) - mobile user
  agent_id?: string; // References agents(id) - assigned agent
  sender: MessageSender; // 'user', 'agent', 'system'
  body: string; // Message content
  metadata?: any; // JSONB - Additional metadata
  created_at: string;
  read_at?: string;
}

/**
 * Message payload for sending messages
 */
export interface SendMessagePayload {
  content: string;
  metadata?: any;
}

/**
 * Create chat request payload
 */
export interface CreateChatRequestPayload {
  category?: ChatCategory;
  priority?: ChatPriority;
  message?: string; // Initial message
  location?: {
    latitude: number;
    longitude: number;
  };
}

