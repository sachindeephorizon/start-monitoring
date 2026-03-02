# Push Notification Infrastructure

This module provides push notification support for iOS and Android, handling registration, token management, and routing.

## Architecture

### iOS-First Approach

Push notifications are the **ONLY way to wake an iOS app**. This module ensures:

1. Push tokens are registered and stored
2. Notifications are handled in all app states (foreground, background, killed)
3. App routes correctly when opened from notification (cold-start)
4. Notifications are categorized and prioritized appropriately

### Flow

```
Backend sends push notification
  ↓
iOS/Android delivers notification
  ↓
User taps notification
  ↓
App cold-starts (if killed)
  ↓
Auth restores session (Step 3)
  ↓
Notification router parses payload
  ↓
App navigates to correct screen
```

## Files

- **`notification.types.ts`** - Type definitions for notifications
- **`notification.constants.ts`** - Constants (channels, sounds, etc.)
- **`notification.service.ts`** - Token registration and storage
- **`notification.handlers.ts`** - Foreground/background handlers
- **`notification.router.ts`** - Routes app based on notification payload
- **`notification.hooks.ts`** - React hooks for notification handling

## Usage

### Basic Setup

The notification handlers are automatically set up in `App.tsx`:

```tsx
// In App.tsx
useEffect(() => {
  setupNotificationHandlers();
  setupNotificationChannels();
}, []);

useNotificationRouting();
usePushNotifications();
```

### Notification Types

The app supports these notification types:

- **`emergency`** - Emergency alerts (highest priority)
- **`incoming_call`** - Incoming video/audio calls (high priority)
- **`check_in`** - Check-in reminders (normal priority)
- **`chat`** - Chat messages (normal priority)
- **`tracking_alert`** - Tracking session alerts (normal priority)
- **`general`** - General notifications (normal priority)

### Backend Payload Format

Backend must send notifications with this structure:

```json
{
  "to": "ExponentPushToken[...]",
  "sound": "default",
  "title": "Emergency Alert",
  "body": "You have an emergency alert",
  "data": {
    "type": "emergency",
    "entity_id": "abc123",
    "call_id": "xyz789",
    // ... other fields
  },
  "priority": "high"
}
```

### Routing

When a user taps a notification, the app routes based on the `type` field:

- `emergency` → Emergency screen
- `incoming_call` → Call screen (video or audio)
- `check_in` → Check-in screen
- `chat` → Chat screen
- `tracking_alert` → Tracking screen
- `general` → Home screen

## iOS Configuration

The `app.json` must include:

```json
{
  "ios": {
    "infoPlist": {
      "FirebaseAppDelegateProxyEnabled": false
    }
  },
  "plugins": [
    [
      "expo-notifications",
      {
        "icon": "./assets/logo.png",
        "color": "#ffffff",
        "sounds": ["./assets/siren.mp3"],
        "mode": "production"
      }
    ]
  ]
}
```

## Database Schema

The module assumes a `user_devices` table exists in the database:

```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'expo',
  platform TEXT NOT NULL,
  os_version TEXT,
  device_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_token ON user_devices(token);
```

## Testing

### Test Cases

1. **Cold-start from notification**
   - Kill the app
   - Send a push notification
   - Tap notification
   - App should open and navigate to correct screen

2. **Foreground notification**
   - Open app
   - Send a push notification
   - Notification should appear in-app

3. **Background notification**
   - Background the app
   - Send a push notification
   - Notification should appear in notification center
   - Tap notification → app should open and navigate correctly

4. **Token registration**
   - Sign in
   - Token should be registered and stored
   - Check database → token should exist

5. **Emergency sound**
   - Send emergency notification
   - Custom siren sound should play (if configured)

## Troubleshooting

### Notifications not arriving

1. Check device is physical (not simulator/emulator)
2. Verify notification permissions are granted
3. Check token is registered in database
4. Verify backend is sending to correct token
5. Check Expo push notification service status

### App doesn't navigate correctly

1. Check notification payload has correct `type` field
2. Verify `navigationRef` is properly initialized
3. Check navigation routes exist for notification types
4. Review console logs for routing errors

### Token not stored

1. Check user is authenticated
2. Verify `user_devices` table exists
3. Check RLS policies allow inserts
4. Review database logs for errors

## Security Considerations

- Push tokens are stored per user and device
- Tokens are invalidated on sign out
- RLS policies should restrict token access to owner
- Tokens should be rotated periodically (handled by backend)

