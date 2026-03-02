# Location Tracking Module

This module provides iOS-safe, system-driven background location tracking for the DeepHorizon Security app.

## Architecture

### iOS-First, System-Driven Approach

Location tracking uses **iOS system-driven background location updates**, not JavaScript timers:

1. User starts tracking → App registers background location task
2. iOS monitors location changes → iOS wakes app when location changes
3. TaskManager callback fires → Location is sent immediately to Supabase
4. App may be suspended again → iOS manages app lifecycle

**Key Principle**: The app NEVER "waits" for the next update. iOS decides when to wake the app.

### File Structure

- **`tracking.task.ts`** - Background task entry point (MOST CRITICAL)
  - Runs WITHOUT React, WITHOUT UI, WITHOUT timers
  - Called by iOS when location updates are available
  - Sends location immediately to server
  
- **`tracking.service.ts`** - Controls start/stop of location tracking
  - Registers/unregisters background task
  - No timing logic (server handles timing)
  
- **`tracking.hooks.ts`** - React hooks for tracking operations
  - Provides easy access from React components
  
- **`tracking.guard.tsx`** - Permission guard for tracking features
  - Ensures required permissions are granted

## iOS Safety Rules

### ❌ FORBIDDEN

- ❌ NO `setInterval` or JavaScript timers
- ❌ NO polling for location updates
- ❌ NO background WebSocket connections
- ❌ NO "keep app alive" tricks
- ❌ NO reliance on AppState listeners for location

### ✅ ALLOWED

- ✅ Expo TaskManager for background tasks
- ✅ System-driven location updates (iOS calls the task)
- ✅ Immediate data transmission (send location as soon as received)
- ✅ Server-side timing logic (server decides when updates are expected)

## Background Task Architecture

The background task (`tracking.task.ts`) runs in a separate context:

- **No React** - Cannot use React hooks or components
- **No UI** - Cannot update UI directly
- **No Context** - Cannot access React context providers
- **No State** - Cannot access app state
- **Direct Supabase** - Uses Supabase client directly (with session restoration)

### Task Flow

```
iOS detects location change
  ↓
iOS wakes app (if needed)
  ↓
TaskManager calls tracking.task.ts
  ↓
Task gets location data
  ↓
Task gets active session from database
  ↓
Task sends location to database
  ↓
Task completes
  ↓
iOS may suspend app again
```

## Usage

### Basic Tracking

```tsx
import { useTracking } from '@/features/tracking';
import { TrackingGuard } from '@/features/tracking';

function TrackingScreen() {
  const { startTracking, stopTracking, isTracking } = useTracking();

  return (
    <TrackingGuard>
      <Button
        title={isTracking ? 'Stop Tracking' : 'Start Tracking'}
        onPress={() => {
          if (isTracking) {
            stopTracking();
          } else {
            startTracking();
          }
        }}
      />
    </TrackingGuard>
  );
}
```

### Tracking with Session

```tsx
import { useTracking } from '@/features/tracking';

function TrackingScreen() {
  const { startTrackingWithSession, stopTrackingWithSession, isTracking } = useTracking();
  const [sessionId, setSessionId] = useState<string | null>(null);

  const handleStart = async () => {
    // Start tracking with a 30-minute interval for 2 hours
    const id = await startTrackingWithSession(30, 120);
    if (id) {
      setSessionId(id);
    }
  };

  const handleStop = async () => {
    if (sessionId) {
      await stopTrackingWithSession(sessionId);
      setSessionId(null);
    }
  };

  return (
    <Button
      title={isTracking ? 'Stop Tracking' : 'Start Tracking'}
      onPress={isTracking ? handleStop : handleStart}
    />
  );
}
```

## Server-Side Responsibilities

The **server** (not the app) is responsible for:

- ✅ Deciding when tracking sessions expire
- ✅ Deciding when check-ins are due
- ✅ Detecting stale location data
- ✅ Notifying agents if tracking stops
- ✅ Calculating expected update frequency based on interval

The app only:
- ✅ Collects location data
- ✅ Sends location immediately when received
- ✅ Starts/stops location collection

## Testing on iOS

### Critical Test Procedure

**Test on REAL iPhone, NOT simulator:**

1. Start tracking in the app
2. Lock the phone
3. Walk/move to a new location
4. Wait 5-10 minutes
5. Check Supabase database → new locations should appear
6. Force-kill the app (swipe up in app switcher)
7. Move to another location
8. Wait 5-10 minutes
9. Check Supabase → locations should STILL arrive

### Success Criteria

- ✅ Locations arrive while phone is locked
- ✅ Locations arrive after app is force-killed
- ✅ No JavaScript errors in console
- ✅ No battery drain from polling
- ✅ Location indicator appears on iOS status bar when tracking

### Failure Indicators

- ❌ Locations stop when app is backgrounded
- ❌ Locations stop when app is killed
- ❌ High battery usage
- ❌ JavaScript errors in console
- ❌ App crashes or becomes unresponsive

## Configuration

### Required iOS Configuration

The `app.json` file MUST include:

```json
{
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["location"],
      "NSLocationAlwaysAndWhenInUseUsageDescription": "Location is required for safety tracking even when the app is closed."
    }
  }
}
```

Without this configuration, background location tracking will silently fail.

### Background Modes

The app uses the `location` background mode, which allows:
- Background location updates
- Location updates when app is killed
- Location indicator in status bar

## Distance Interval

The tracking service uses a `distanceInterval` of 25 meters:

- iOS will wake the app when the user moves 25+ meters
- This is iOS-approved and doesn't use JavaScript timers
- Smaller intervals = more frequent updates but higher battery usage
- Larger intervals = fewer updates but better battery life

The server can use the `interval_minutes` field to determine expected update frequency, but the actual updates are driven by movement distance, not time.

## Troubleshooting

### Location updates stop in background

1. Check that `UIBackgroundModes` includes `"location"` in `app.json`
2. Verify background location permission is granted
3. Check that the task is registered (import `tracking.task.ts` in `App.tsx`)
4. Verify the task name matches in `tracking.task.ts` and `tracking.service.ts`

### No locations in database

1. Check that an active tracking session exists
2. Verify user is authenticated (session available to background task)
3. Check Supabase RLS policies allow inserts
4. Review server logs for database errors

### High battery usage

1. Verify no JavaScript timers are running
2. Check that `distanceInterval` is appropriate (not too small)
3. Ensure no other location services are running simultaneously
4. Review iOS Settings → Battery for app usage patterns

