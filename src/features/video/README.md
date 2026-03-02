# Video Calls

Video call functionality using Stream.io for WebRTC communication. Video calls are foreground-only and must terminate when the app backgrounds.

## Architecture

### Core Design Principle

> **Video calls exist ONLY while the app is in the foreground.**
> When the app backgrounds, the call must end immediately.

### iOS Background Rules

- ❌ Background video is explicitly forbidden
- ❌ Keeping camera active when app backgrounds is forbidden
- ❌ Trying to "hold" video calls is forbidden
- ✅ Video calls work in foreground only
- ✅ Calls terminate when app backgrounds
- ✅ Push notifications wake app for incoming calls

### Video Call Flow

#### Outgoing Call Flow

```
User initiates video call
  ↓
Create call session in database
  ↓
Join Stream.io call
  ↓
Call becomes active (foreground only)
  ↓
User backgrounds app
  ↓
AppState changes to 'background'
  ↓
Call ends immediately (iOS requirement)
  ↓
Camera and microphone resources released
```

#### Incoming Call Flow

```
Agent initiates video call
  ↓
Server sends push notification
  ↓
Push payload: { type: 'incoming_call', call_id: '...', call_type: 'video' }
  ↓
User taps notification
  ↓
App opens (foreground)
  ↓
Auth restored (Step 3)
  ↓
App routes to Video Call screen
  ↓
Join Stream.io call
  ↓
Call becomes active (foreground only)
```

## Files

- **`video.types.ts`** - Type definitions
- **`video.service.ts`** - Call lifecycle and Stream.io integration
- **`video.hooks.ts`** - React hooks for video calls (includes AppState monitoring)
- **`video.guard.tsx`** - Permission guard wrapper
- **`README.md`** - This documentation

## Usage

### Basic Video Call Screen

```tsx
import { useVideoCall } from '@/features/video';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';
import { View, Text, Button } from 'react-native';

function VideoCallScreen({ callId, client }: { callId: string; client: StreamVideoClient }) {
  const { 
    joinCall, 
    leaveCall, 
    status, 
    loading, 
    error,
    toggleCamera,
    toggleMute 
  } = useVideoCall(client);

  useEffect(() => {
    // Join call when screen mounts
    joinCall(callId);
  }, [callId]);

  return (
    <View>
      <Text>Video Call Status: {status}</Text>
      {error && <Text>Error: {error}</Text>}
      <Button title="Toggle Camera" onPress={() => toggleCamera(true)} />
      <Button title="Toggle Mute" onPress={() => toggleMute(false)} />
      <Button title="End Call" onPress={leaveCall} disabled={loading} />
    </View>
  );
}
```

### Creating a New Call

```tsx
import { useVideoCall } from '@/features/video';
import { StreamVideoClient } from '@stream-io/video-react-native-sdk';

function NewCallScreen({ client }: { client: StreamVideoClient }) {
  const { createAndJoinCall, status, loading } = useVideoCall(client);

  const handleStartCall = async () => {
    await createAndJoinCall(
      undefined, // agentId (will be assigned by server)
      'Regular monitoring call',
      'medium'
    );
  };

  return (
    <Button
      title="Start Video Call"
      onPress={handleStartCall}
      disabled={loading || status === 'active'}
    />
  );
}
```

### Using Video Guard

```tsx
import { VideoGuard } from '@/features/video';

function VideoCallScreen() {
  return (
    <VideoGuard>
      <VideoCallContent />
    </VideoGuard>
  );
}
```

## Key Principles

### 1. Foreground-Only

Video calls work ONLY when the app is in the foreground:

- App foreground → Call active
- App background → Call ends immediately
- Screen lock → Call ends immediately

### 2. AppState Monitoring

The `useVideoCall` hook automatically monitors AppState:

```ts
useEffect(() => {
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (nextAppState !== 'active' && currentCall) {
      await handleLeave(); // End call immediately
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}, [currentCall]);
```

This is MANDATORY for iOS compliance.

### 3. No Background Handling

Unlike audio calls, video calls do NOT:

- Configure background audio sessions
- Attempt to keep video active in background
- Use any background execution modes

Video simply stops when the app backgrounds.

### 4. Stream.io Integration

- Uses `@stream-io/video-react-native-sdk` for WebRTC
- Calls are created with room codes
- Camera and microphone managed by Stream.io
- Resources automatically released on call end

### 5. Database Integration

- Call sessions stored in `call_sessions` table
- Video sessions stored in `video_sessions` table
- Status updates tracked in database
- Room codes generated and stored

## iOS Configuration

### Required app.json Settings

```json
{
  "ios": {
    "infoPlist": {
      "NSCameraUsageDescription": "Camera access is required for video calls.",
      "NSMicrophoneUsageDescription": "Microphone access is required for video calls."
    }
  }
}
```

**NOTE**: Video calls do NOT require `backgroundModes` in app.json because they are foreground-only.

## Push Notification Integration

Incoming video calls must be delivered via push notifications:

```json
{
  "type": "incoming_call",
  "call_id": "call_session_123",
  "call_type": "video",
  "room_code": "video_room_xyz"
}
```

The notification router already routes to the Video Call screen based on `call_type`.

## Database Schema

### Call Sessions (`call_sessions` table)

- `id` - Call session ID
- `mobile_user_id` - User in the call
- `agent_id` - Assigned agent
- `call_type` - 'video' for video calls
- `status` - Call status
- `room_code` - Stream.io room code
- `priority` - Call priority

### Video Sessions (`video_sessions` table)

- `id` - Video session ID
- `session_id` - References `call_sessions(id)`
- `mobile_user_id` - User in the call
- `agent_id` - Assigned agent
- `status` - Video session status
- `room_code` - Stream.io room code
- `session_type` - 'monitoring', 'emergency', 'scheduled'
- `video_enabled` - Whether video is enabled
- `audio_enabled` - Whether audio is enabled

## Testing Scenarios

Test ALL of these scenarios:

### 1. Foreground Video Call
- ✅ Start call
- ✅ Video and audio work
- ✅ Camera and microphone active
- ✅ Call stable in foreground

### 2. Background Termination
- ✅ Start call
- ✅ Background app
- ✅ Call ends immediately
- ✅ Camera and microphone released

### 3. Screen Lock
- ✅ Start call
- ✅ Lock screen
- ✅ Call ends immediately
- ✅ Resources released

### 4. Incoming Call
- ✅ App killed
- ✅ Push notification arrives
- ✅ Tap notification
- ✅ App opens to foreground
- ✅ Call connects
- ✅ Video works

### 5. Permission Denied
- ✅ Camera permission denied
- ✅ Call blocked
- ✅ Error shown to user

### 6. App State Changes
- ✅ Active call
- ✅ Receive phone call
- ✅ Video call ends
- ✅ Resume from phone call
- ✅ Video call remains ended

## Security Considerations

- Camera permission required
- Microphone permission required
- Video calls only in foreground
- Calls protected by authentication
- RLS policies enforce access control

## iOS Safety

- No background video execution
- Calls end immediately on background
- AppState monitoring enforced
- Camera released correctly
- App Store compliant

## Comparison with Audio Calls

| Feature | Audio Calls | Video Calls |
|---------|-------------|-------------|
| Background allowed | ✅ Yes (while active) | ❌ No |
| AppState monitoring | ❌ Not needed | ✅ Required |
| Background modes | ✅ "audio" required | ❌ Not needed |
| Termination on background | ❌ Continues | ✅ Immediate |
| Screen lock | ❌ Continues | ✅ Ends call |

## Common Issues

### Video Continues in Background

**Cause**: AppState monitoring not implemented or not working.

**Solution**: Ensure `useVideoCall` hook is used (it includes AppState monitoring).

### Camera Not Released

**Cause**: Call not properly ended when screen unmounts.

**Solution**: Ensure cleanup in useEffect properly calls `leaveCall()`.

### Call Fails to Connect

**Cause**: Stream.io client not initialized or room code incorrect.

**Solution**: Verify Stream.io client is initialized and room code matches database.

