# Real-Time Chat

Real-time chat functionality for communicating with security agents. Chat connections are foreground-only, with push notifications handling background message delivery.

## Architecture

### Core Design Principle

> **Real-time chat connections exist ONLY while the chat screen is visible.**
> When the app backgrounds or the screen unmounts, the subscription closes.
> New messages arrive via push notifications, which wake the app.

### iOS Safety

- ✅ Real-time subscriptions are foreground-only
- ✅ Subscriptions are mounted/unmounted with the chat screen
- ✅ Background messages are delivered via push notifications
- ✅ No persistent background connections
- ✅ Graceful degradation when app backgrounds

### Chat Flow

#### Foreground Chat Flow

```
User opens chat screen
  ↓
Chat request loaded from database
  ↓
Messages loaded from database
  ↓
Real-time subscription opens (Supabase Realtime)
  ↓
Messages flow live while screen is visible
  ↓
User sends message
  ↓
Message inserted into database
  ↓
Real-time subscription delivers to agent
  ↓
Agent responds
  ↓
Message arrives via real-time subscription
  ↓
Screen displays new message
```

#### Background/Killed State Flow

```
User backgrounds app or kills app
  ↓
Real-time subscription closes
  ↓
Agent sends message
  ↓
Server inserts message into database
  ↓
Server sends push notification to user
  ↓
Push notification payload: { type: 'chat', entity_id: 'chat_123' }
  ↓
User taps notification
  ↓
App opens (cold-start if killed)
  ↓
App routes to Chat screen
  ↓
Real-time subscription reopens
  ↓
Messages sync from database
  ↓
Chat continues normally
```

## Files

- **`chat.types.ts`** - Type definitions
- **`chat.service.ts`** - Database CRUD operations (no real-time logic)
- **`chat.realtime.ts`** - Foreground-only real-time subscriptions
- **`chat.hooks.ts`** - React hooks for chat functionality
- **`chat.guard.tsx`** - Authentication guard
- **`README.md`** - This documentation

## Usage

### Basic Chat Screen

```tsx
import { useChat } from '@/features/chat';
import { View, Text, TextInput, Button, FlatList } from 'react-native';

function ChatScreen({ chatRequestId }: { chatRequestId: string }) {
  const { messages, sendMessage, loading, chatRequest } = useChat(chatRequestId);
  const [inputText, setInputText] = useState('');

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const success = await sendMessage(inputText);
    if (success) {
      setInputText('');
    }
  };

  if (loading) {
    return <Text>Loading chat...</Text>;
  }

  return (
    <View style={{ flex: 1 }}>
      <View>
        <Text>Chat with Agent</Text>
        {chatRequest?.status === 'pending' && (
          <Text>Waiting for agent assignment...</Text>
        )}
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.sender}: {item.body}</Text>
            <Text>{new Date(item.created_at).toLocaleTimeString()}</Text>
          </View>
        )}
      />

      <View>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type a message..."
        />
        <Button title="Send" onPress={handleSend} />
      </View>
    </View>
  );
}
```

### Creating a New Chat

```tsx
import { useCreateChat } from '@/features/chat';
import { useNavigation } from '@react-navigation/native';

function NewChatScreen() {
  const { createChat, loading } = useCreateChat();
  const navigation = useNavigation();

  const handleCreateChat = async () => {
    const result = await createChat({
      category: 'general',
      priority: 'medium',
      message: 'Hello, I need help',
    });

    if (result.success && result.chatId) {
      navigation.navigate('Chat', { chatRequestId: result.chatId });
    }
  };

  return (
    <Button
      title="Start Chat"
      onPress={handleCreateChat}
      disabled={loading}
    />
  );
}
```

### Using Chat Guard

```tsx
import { ChatGuard } from '@/features/chat';

function ChatScreen() {
  return (
    <ChatGuard>
      <ChatContent />
    </ChatGuard>
  );
}
```

## Key Principles

### 1. Foreground-Only Subscriptions

Real-time subscriptions are created when the chat screen mounts and destroyed when it unmounts:

```tsx
useEffect(() => {
  const unsubscribe = subscribeToChatMessages(chatId, agentId, userId, onMessage);
  
  return () => {
    unsubscribe(); // Cleanup on unmount
  };
}, [chatId]);
```

### 2. No Background Connections

The app never maintains chat connections in the background:

- When app backgrounds → subscription closes
- When app is killed → no connection exists
- New messages arrive via push notifications

### 3. Message Sync on Open

When chat screen opens:

1. Load chat request from database
2. Load all messages from database
3. Open real-time subscription
4. New messages arrive via subscription

This ensures message history is always complete.

### 4. Push Notification Backup

Server must send push notifications for new messages:

```json
{
  "type": "chat",
  "entity_id": "chat_request_123"
}
```

The notification router already routes to the Chat screen.

## Database Schema

### Chat Requests (`chat_requests` table)

- `id` - Chat request ID
- `mobile_user_id` - User who created the chat
- `assigned_agent_id` - Assigned agent (null if pending)
- `status` - 'pending', 'assigned', 'active', 'closed'
- `priority` - 'low', 'medium', 'high', 'emergency'
- `category` - 'general', 'emergency', 'technical', 'billing', 'safety'

### Messages (`messages` table)

- `id` - Message ID
- `user_id` - User ID (references auth.users)
- `agent_id` - Agent ID (references agents, null if no agent assigned)
- `sender` - 'user', 'agent', 'system'
- `body` - Message content
- `metadata` - JSONB for additional data
- `created_at` - Timestamp
- `read_at` - When message was read (null if unread)

**NOTE**: Messages are linked via `user_id` and `agent_id`, not a `chat_id` field. To get messages for a chat request, we:
1. Get the chat request
2. Use its `mobile_user_id` and `assigned_agent_id` to query messages

## Real-Time Subscriptions

### Message Subscription

Subscribes to new messages for a specific chat:

```ts
subscribeToChatMessages(
  chatRequestId,
  agentId, // From chat request
  userId,  // From chat request
  (newMessage) => {
    // Handle new message
  }
);
```

### Chat Request Subscription

Subscribes to chat request updates (status changes, agent assignment):

```ts
subscribeToChatRequest(
  chatRequestId,
  (updatedRequest) => {
    // Handle chat request update
  }
);
```

Both subscriptions are automatically cleaned up when the component unmounts.

## Push Notification Integration

Chat notifications must be routed correctly:

```ts
// In notification.router.ts (already implemented)
case 'chat': {
  if (payload.entity_id) {
    navigate('Chat', { chatRequestId: payload.entity_id });
  }
  break;
}
```

## Testing Scenarios

Test ALL of these scenarios:

### 1. Normal Foreground Chat
- ✅ Open chat screen
- ✅ Send message
- ✅ Receive agent message instantly
- ✅ Messages display correctly
- ✅ Subscription closes when screen unmounts

### 2. Background Message
- ✅ Chat screen open
- ✅ User backgrounds app
- ✅ Subscription closes
- ✅ Agent sends message
- ✅ Push notification arrives
- ✅ User taps notification
- ✅ App opens to chat screen
- ✅ Subscription reopens
- ✅ New message appears

### 3. Killed State
- ✅ User kills app
- ✅ Agent sends message
- ✅ Push notification arrives
- ✅ User taps notification
- ✅ App cold-starts
- ✅ Routes to chat screen
- ✅ Messages sync from database
- ✅ Subscription opens
- ✅ Chat works normally

### 4. Rapid Messages
- ✅ Send multiple messages quickly
- ✅ No message duplication
- ✅ Messages appear in order
- ✅ Real-time subscription handles all

### 5. Agent Assignment
- ✅ Create chat request (no agent assigned)
- ✅ Chat request subscription updates when agent assigned
- ✅ Messages work correctly after assignment

### 6. Multiple Chat Screens
- ✅ Open chat A
- ✅ Background app
- ✅ Open chat B from notification
- ✅ Chat A subscription is closed
- ✅ Chat B subscription opens
- ✅ No subscription conflicts

## Integration with Other Features

### Emergency System
- Emergency chats can be created with `category: 'emergency'`
- Emergency chats have `priority: 'emergency'`

### Push Notifications
- Chat messages trigger push notifications
- Notifications wake app from killed state
- Notification routing opens correct chat

### Authentication
- Chat requires authentication (AuthGuard)
- No special permissions required

## Security Considerations

- Chat messages are protected by RLS
- Users can only access their own chat requests
- Agents can access assigned chat requests
- Messages are linked via user_id and agent_id

## iOS Safety

- No background real-time connections
- Subscriptions mounted/unmounted with screen
- Push notifications handle background state
- Cold-start routing works correctly
- Graceful degradation when app backgrounds

