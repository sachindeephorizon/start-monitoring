# Emergency System

The emergency system is the core value feature of DeepHorizon. It must work reliably in all scenarios, including when the app is killed.

## Architecture

### Core Design Principle

> **An emergency must be fully created on the server in ≤1 network call.**

The app **never waits**, **never retries**, **never escalates locally**. All escalation and agent notification logic runs server-side.

### Emergency Flow

```
User taps Emergency button
  ↓
Passkey verification (local)
  ↓
Capture location (optional, non-blocking)
  ↓
ONE API CALL to server (creates emergency record)
  ↓
Server assigns agent
  ↓
Server sends push notifications to agents
  ↓
Server starts escalation timer
  ↓
App may die - emergency continues on server
  ↓
Agent responds via dashboard
  ↓
Server sends push notification to user
  ↓
User sees emergency status update
```

### iOS Safety

The emergency system works in all app states:

- **Foreground**: Emergency triggered normally
- **Background**: Emergency triggered, app may be suspended
- **Killed**: Emergency still exists on server, user can see status when app reopens

## Files

- **`emergency.types.ts`** - Type definitions
- **`emergency.constants.ts`** - Constants (timeouts, priorities)
- **`emergency.service.ts`** - Core emergency triggering logic (MOST CRITICAL)
- **`emergency.hooks.ts`** - React hooks for emergency operations
- **`emergency.guard.tsx`** - Permission guard wrapper
- **`emergency.passkey.ts`** - Passkey verification before emergency

## Usage

### Basic Emergency Trigger

```tsx
import { useEmergency } from '@/features/emergency';

function EmergencyButton() {
  const { triggerEmergency, loading } = useEmergency();

  const handlePress = async () => {
    const result = await triggerEmergency({
      description: 'I need help immediately',
    });

    if (result.success) {
      // Emergency created successfully
      // Server will handle agent assignment and notifications
    } else {
      alert('Failed to trigger emergency: ' + result.error);
    }
  };

  return (
    <Button
      title="EMERGENCY"
      onPress={handlePress}
      disabled={loading}
      style={{ backgroundColor: 'red' }}
    />
  );
}
```

### Emergency with Passkey Verification

```tsx
import { useEmergency } from '@/features/emergency';
import { verifyEmergencyPasskey } from '@/features/emergency/emergency.passkey';

function EmergencyButton() {
  const { triggerEmergency, loading } = useEmergency();
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);

  const handlePress = () => {
    setShowPasskeyModal(true);
  };

  const handlePasskeySubmit = async (passkey: string) => {
    const isValid = await verifyEmergencyPasskey(passkey);
    
    if (!isValid) {
      alert('Invalid passkey');
      return;
    }

    setShowPasskeyModal(false);
    
    const result = await triggerEmergency();
    if (!result.success) {
      alert('Failed to trigger emergency');
    }
  };

  return (
    <>
      <Button title="EMERGENCY" onPress={handlePress} />
      <PasskeyModal
        visible={showPasskeyModal}
        onSubmit={handlePasskeySubmit}
        onCancel={() => setShowPasskeyModal(false)}
      />
    </>
  );
}
```

### Using Emergency Guard

```tsx
import { EmergencyGuard } from '@/features/emergency';

function EmergencyScreen() {
  return (
    <EmergencyGuard>
      <EmergencyButton />
    </EmergencyGuard>
  );
}
```

## Key Principles

### 1. ONE Network Call

Emergency creation requires exactly ONE network call to the server:

```ts
await supabase.from('emergencies').insert(emergencyData);
```

No retries, no waiting, no additional calls.

### 2. Location is Optional

Location capture must NOT block emergency creation:

```ts
try {
  const location = await Location.getCurrentPositionAsync({...});
  // Use location if available
} catch {
  // Emergency proceeds without location
}
```

Emergency must be created even if:
- Location permission is denied
- Location capture times out
- Location capture fails
- GPS is unavailable

### 3. Server-Side Escalation

All escalation logic runs on the server:

- Agent assignment
- Push notifications
- Escalation timers
- Status updates
- Resolution tracking

The app only:
- Triggers the emergency
- Displays emergency status
- Allows cancellation

### 4. Passkey Verification

Passkey verification happens BEFORE the emergency API call:

1. User taps emergency button
2. Passkey modal appears
3. User enters 4-digit passkey
4. Passkey verified locally (against database hash)
5. If valid, emergency is triggered
6. If invalid, show error (no emergency created)

This prevents accidental emergency activation.

## Server-Side Requirements

The backend MUST:

1. **Create emergency record** in `emergencies` table
2. **Assign agent** using load balancing algorithm
3. **Send push notifications** to assigned agents with payload:
   ```json
   {
     "type": "emergency",
     "entity_id": "emergency_123",
     "priority": "critical"
   }
   ```
4. **Start escalation timer** (30 seconds default)
5. **Escalate if no response** (assign to different agent, notify supervisor)
6. **Handle status updates** (acknowledged, in_progress, resolved)
7. **Send push notifications to user** when agent responds

## Database Schema

The emergency is stored in the `emergencies` table with:

- `mobile_user_id` - User who triggered emergency
- `description` - Optional emergency description
- `location` - JSONB with latitude/longitude (if captured)
- `status` - Emergency status (active, acknowledged, in_progress, resolved, escalated)
- `priority` - Priority level (critical by default)
- `triggered_at` - When emergency was triggered
- `assigned_agent_id` - Assigned responding agent
- `claimed_by` - Agent who claimed the emergency

## Testing Scenarios

Test ALL of these scenarios:

### 1. Normal Flow
- ✅ User taps emergency button
- ✅ Passkey verified
- ✅ Emergency created
- ✅ Location captured
- ✅ Agent notified

### 2. Location Failure
- ✅ User taps emergency button
- ✅ Passkey verified
- ✅ Location capture fails (permission denied/timeout)
- ✅ Emergency created WITHOUT location
- ✅ Agent notified

### 3. Network Failure
- ✅ User taps emergency button
- ✅ Passkey verified
- ✅ API call fails
- ✅ Error shown to user
- ✅ No emergency created (user must retry)

### 4. App Killed After Emergency
- ✅ User taps emergency button
- ✅ Emergency created successfully
- ✅ User immediately kills app
- ✅ Emergency exists on server
- ✅ Agent receives notification
- ✅ User reopens app
- ✅ Emergency status is visible

### 5. Background State
- ✅ App in background
- ✅ User triggers emergency (from notification or quick action)
- ✅ Emergency created
- ✅ App may be suspended
- ✅ Emergency continues on server

### 6. No Location Permission
- ✅ Location permission denied
- ✅ User taps emergency button
- ✅ Passkey verified
- ✅ Emergency created WITHOUT location
- ✅ Agent notified

## UI Requirements

Emergency button must:

- ✅ Be **large and prominent** (easy to tap in stress)
- ✅ Be **always visible** (on home screen, no navigation required)
- ✅ Require **passkey confirmation** (prevents accidental activation)
- ✅ Show **loading state** while processing
- ✅ Show **confirmation** when emergency is triggered
- ✅ Allow **cancellation** if triggered accidentally

Do NOT add:
- ❌ Complex forms
- ❌ Dropdowns or multi-step flows
- ❌ Long description fields
- ❌ Multiple confirmation steps (passkey is sufficient)

## Error Handling

### Location Capture Fails
- Log warning
- Proceed with emergency creation (no location)
- Emergency is still valid

### Network Error
- Show error to user
- Do NOT create emergency (user must retry)
- Do NOT silently fail

### Passkey Verification Fails
- Show error
- Do NOT create emergency
- Allow retry

### Database Error
- Show error to user
- Do NOT create emergency
- User must retry

## Security Considerations

- Passkeys are verified server-side using bcrypt
- Emergency records are protected by RLS
- Only the user can see their own emergencies
- Agents can see emergencies they're assigned to
- Location data is stored securely in JSONB

## Integration with Other Features

### Location Tracking
- Emergency uses current location if tracking is active
- Emergency can be triggered even if tracking is not active

### Push Notifications
- User receives push notifications when agent responds
- Push payload includes emergency ID for routing

### Real-time Updates
- Emergency status updates are delivered via Supabase Realtime
- App subscribes to emergency status changes (foreground only)
- Background updates come via push notifications

