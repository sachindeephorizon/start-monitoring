# Permissions Module

This module provides a centralized, iOS-safe permission management system for the DeepHorizon Security app.

## Architecture

The permissions module follows a strict architecture:

1. **Types** (`permission.types.ts`) - Type definitions for permissions and capabilities
2. **Constants** (`permission.constants.ts`) - Maps capabilities to required permissions
3. **Service** (`permission.service.ts`) - Core permission logic (no UI, no timers)
4. **Hooks** (`permission.hooks.ts`) - React hooks for permission management
5. **Guard** (`permission.guard.tsx`) - React component that protects features

## Key Principles

### iOS Safety

- ❌ No background JavaScript execution
- ❌ No timers or polling
- ❌ No permission retries or hacks
- ✅ Single responsibility: request/check permissions only
- ✅ Features gracefully degrade when permissions are missing

### Single Authority

All permission requests go through `PermissionService`. No component should directly call Expo permission APIs.

### Capability-Based

Features request capabilities (e.g., `tracking`, `emergency`), not raw permissions. The system automatically handles the required permissions.

## Usage

### Using Permission Guard (Recommended)

Wrap a feature component with `PermissionGuard`:

```tsx
import { PermissionGuard } from '@/core/permissions';
import { Capability } from '@/core/permissions';

function TrackingScreen() {
  return (
    <PermissionGuard capability="tracking">
      <TrackingUI />
    </PermissionGuard>
  );
}
```

### Using Hooks

For more control, use hooks:

```tsx
import { useCapabilityPermission } from '@/core/permissions';

function EmergencyButton() {
  const { granted, requestCapability } = useCapabilityPermission('emergency');

  const handlePress = async () => {
    if (!granted) {
      await requestCapability();
      return;
    }
    // Proceed with emergency
  };

  return <Button onPress={handlePress} disabled={!granted} />;
}
```

### Using Service Directly

For advanced use cases:

```tsx
import { PermissionService } from '@/core/permissions';
import { AppPermission } from '@/core/permissions';

async function checkLocationPermission() {
  const status = await PermissionService.check('location_always');
  return status === 'granted';
}
```

## Capabilities and Required Permissions

| Capability | Required Permissions |
|------------|---------------------|
| `tracking` | `location_always`, `notifications` |
| `emergency` | `location_when_in_use`, `notifications` |
| `check_in` | `notifications` |
| `audio_call` | `microphone` |
| `video_call` | `camera`, `microphone` |

## iOS Configuration

The `app.json` file must include the following iOS configuration:

```json
{
  "ios": {
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "...",
      "NSLocationAlwaysAndWhenInUseUsageDescription": "...",
      "NSLocationAlwaysUsageDescription": "...",
      "NSCameraUsageDescription": "...",
      "NSMicrophoneUsageDescription": "...",
      "UIBackgroundModes": ["location", "audio", "remote-notification"]
    }
  }
}
```

**Critical**: Missing or incorrect permission descriptions will result in App Store rejection.

## Testing Permissions

### Simulator Testing

- Location permissions can be tested in the simulator
- Notifications require a real device or push notification setup
- Camera/microphone can be tested in simulator (with limitations)

### Real Device Testing

1. Test permission denial paths
2. Test "blocked" state (go to Settings → Deny)
3. Test re-requesting after denial
4. Verify features disable gracefully when permissions are missing

## Common Patterns

### Checking Before Feature Use

```tsx
const { granted, requestCapability } = useCapabilityPermission('tracking');

useEffect(() => {
  if (granted) {
    startTracking();
  } else {
    stopTracking();
  }
}, [granted]);
```

### Requesting on User Action

```tsx
const handleStartTracking = async () => {
  const success = await requestCapability();
  if (success) {
    startTracking();
  } else {
    showPermissionDeniedMessage();
  }
};
```

### Re-checking After Settings Return

```tsx
const { granted, recheck } = useCapabilityPermission('tracking');

useEffect(() => {
  const subscription = AppState.addEventListener('change', (nextAppState) => {
    if (nextAppState === 'active') {
      recheck(); // User might have granted permission in Settings
    }
  });

  return () => subscription.remove();
}, [recheck]);
```

