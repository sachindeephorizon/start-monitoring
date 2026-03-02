# Audio Calls

Audio call functionality using Stream.io for WebRTC communication with iOS background audio support.

## Architecture

### Core Design Principle

> **Background audio exists ONLY when a call is active.**
> When the call ends, background audio stops immediately.

### iOS Background Audio Rules

- ✅ Background audio is allowed while a call is active
- ✅ Audio session stays alive during active calls
- ✅ Screen can lock during active calls
- ✅ App can go to background during active calls
- ❌ Background audio is NOT allowed when no call is active
- ❌ No background JS loops or timers
- ❌ No silent "keep-alive" audio

### Audio Call Flow

#### Outgoing Call Flow

```
User initiates audio call
  ↓
Create call session in database
  ↓
Start audio session (iOS background mode)
  ↓
Join Stream.io call
  ↓
Call becomes active
  ↓
Audio continues in background
  ↓
User backgrounds app / locks screen
  ↓
Audio continues (iOS approved)
  ↓
Call ends
  ↓
Leave Stream.io call
  ↓
End audio session (stops background mode)
  ↓
Background execution ends
```

#### Incoming Call Flow

```
Agent initiates call
  ↓
Server sends push notification
  ↓
Push payload: { type: 'incoming_call', call_id: '...' }
  ↓
User taps notification
  ↓
App cold-starts or opens from background
  ↓
Auth restored (Step 3)
  ↓
App routes to Audio Call screen
  ↓
Start audio session
  ↓
Join Stream.io call
  ↓
Call becomes active
  ↓
Audio continues in background
```

## Files

- **`audio.types.ts`** - Type definitions
- **`audio.service.ts`** - Call lifecycle and Stream.io integration
- **`audio.session.ts`** - iOS audio session management (MOST CRITICAL)
- **`audio.hooks.ts`** - React hooks for audio calls
- **`audio.guard.tsx`** - Permission guard wrapper
- **`README.md`** - This documentation

## Usage

### Basic Audio Call Screen

```tsx
import { useAudioCall } from '@/features/audio';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { View, Text, Button } from 'react-native';

function AudioCallScreen({ callId, client }: { callId: string; client: StreamVideoClient }) {
  const { joinCall, leaveCall, status, loading, error } = useAudioCall(client);

  useEffect(() => {
    // Join call when screen mounts
    joinCall(callId);
  }, [callId]);

  return (
    <View>
      <Text>Audio Call Status: {status}</Text>
      {error && <Text>Error: {error}</Text>}
      <Button title="End Call" onPress={leaveCall} disabled={loading} />
    </View>
  );
}
```

### Creating a New Call

```tsx
import { useAudioCall } from '@/features/audio';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';

function NewCallScreen({ client }: { client: StreamVideoClient }) {
  const { createAndJoinCall, status, loading } = useAudioCall(client);

  const handleStartCall = async () => {
    await createAndJoinCall(
      undefined, // agentId (will be assigned by server)
      'Regular monitoring call',
      'medium'
    );
  };

  return (
    <Button
      title="Start Audio Call"
      onPress={handleStartCall}
      disabled={loading || status === 'active'}
    />
  );
}
```

### Using Audio Guard

```tsx
import { AudioGuard } from '@/features/audio';

function AudioCallScreen() {
  return (
    <AudioGuard>
      <AudioCallContent />
    </AudioGuard>
  );
}
```

## Key Principles

### 1. Audio Session Lifecycle

Audio session MUST be managed correctly:

1. **Before joining call**: Start audio session
2. **After joining call**: Audio session is active
3. **During call**: Background audio is allowed
4. **After leaving call**: End audio session (stops background)

### 2. iOS Configuration

The `app.json` MUST include:

```json
{
  "ios": {
    "backgroundModes": ["audio"],
    "infoPlist": {
      "UIBackgroundModes": ["audio"],
      "NSMicrophoneUsageDescription": "Microphone access is required for audio calls."
    }
  }
}
```

Without this configuration, audio will drop when the screen locks.

### 3. Stream.io Integration

- Uses `@stream-io/video-react-native-sdk` for WebRTC
- Calls are created with room codes
- Audio session is managed separately from Stream.io

### 4. Database Integration

- Call sessions stored in `call_sessions` table
- Audio sessions stored in `audio_sessions` table
- Status updates tracked in database
- Room codes generated and stored

## iOS Configuration

### Required app.json Settings

```json
{
  "ios": {
    "backgroundModes": ["audio"],
    "infoPlist": {
      "UIBackgroundModes": ["audio"],
      "NSMicrophoneUsageDescription": "Microphone access is required for audio calls."
    }
  }
}
```

### Audio Session Configuration

The audio session is configured with:

- `allowsRecordingIOS: true` - Enable microphone
- `playsInSilentModeIOS: true` - Play audio even in silent mode
- `staysActiveInBackground: true` - CRITICAL: Allows background audio
- `interruptionModeIOS: DO_NOT_MIX` - Prevents other audio from interrupting

## Push Notification Integration

Incoming audio calls must be delivered via push notifications:

```json
{
  "type": "incoming_call",
  "call_id": "call_session_123",
  "room_code": "audio_room_xyz"
}
```

The notification router already routes to the Audio Call screen.

## Database Schema

### Call Sessions (`call_sessions` table)

- `id` - Call session ID
- `mobile_user_id` - User in the call
- `agent_id` - Assigned agent
- `call_type` - 'audio' for audio calls
- `status` - Call status
- `room_code` - Stream.io room code
- `priority` - Call priority

### Audio Sessions (`audio_sessions` table)

- `id` - Audio session ID
- `session_id` - References `call_sessions(id)`
- `mobile_user_id` - User in the call
- `agent_id` - Assigned agent
- `status` - Audio session status
- `room_code` - Stream.io room code
- `session_type` - 'monitoring', 'emergency', 'scheduled'

## Testing Scenarios

Test ALL of these scenarios:

### 1. Background Audio
- ✅ Start call
- ✅ Lock phone
- ✅ Audio continues
- ✅ Unlock phone
- ✅ Audio still active

### 2. App Backgrounding
- ✅ Start call
- ✅ Background app
- ✅ Audio continues
- ✅ Return to app
- ✅ Call still active

### 3. Incoming Call
- ✅ App killed
- ✅ Push notification arrives
- ✅ Tap notification
- ✅ App cold-starts
- ✅ Call connects
- ✅ Audio works

### 4. Call End
- ✅ Active call
- ✅ End call
- ✅ Audio session stops
- ✅ Background audio stops
- ✅ No background execution

### 5. Phone Call Interruption
- ✅ Active audio call
- ✅ Receive phone call
- ✅ Audio call pauses
- ✅ Phone call ends
- ✅ Audio call resumes

## Security Considerations

- Microphone permission required
- Audio session only active during calls
- No persistent background audio
- Calls protected by authentication
- RLS policies enforce access control

## iOS Safety

- Background audio only when call is active
- Audio session properly configured
- Clean shutdown when call ends
- No background JS tricks
- App Store compliant

## Common Issues

### Audio Drops When Screen Locks

**Cause**: `backgroundModes` or `UIBackgroundModes` not configured correctly.

**Solution**: Ensure `app.json` has correct configuration (see iOS Configuration section).

### Background Audio Continues After Call

**Cause**: Audio session not cleaned up after call ends.

**Solution**: Ensure `AudioSession.endCall()` is called when leaving call.

### Call Fails to Connect

**Cause**: Stream.io client not initialized or room code incorrect.

**Solution**: Verify Stream.io client is initialized and room code matches database.

