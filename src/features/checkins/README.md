# Scheduled Check-Ins

The scheduled check-in system allows users to schedule safety check-ins that are automatically monitored by the server. This feature is fully server-driven and iOS-safe.

## Architecture

### Core Design Principle

> **The app NEVER waits for a check-in time.
> The server ALWAYS decides if a check-in is due, missed, or escalated.**

The app only:
- Schedules intent (when check-in should occur)
- Responds to push notifications
- Confirms completion with passkey

All scheduling, deadline checking, and escalation logic runs server-side.

### Check-In Flow

#### Successful Check-In Flow

```
User schedules check-in (scheduled_at, message)
  ↓
Server stores check-in record (status: 'pending')
  ↓
Server schedules push notification for scheduled_at
  ↓
At scheduled time, server sends push notification
  ↓
iOS shows notification to user
  ↓
User taps notification
  ↓
App opens (cold-start or foreground)
  ↓
App routes to Check-In screen (from notification payload)
  ↓
User enters passkey
  ↓
Passkey verified (server-side)
  ↓
App calls completeCheckIn()
  ↓
Server marks check-in as 'completed'
  ↓
Check-in is done
```

#### Missed Check-In Flow

```
Scheduled time arrives
  ↓
Server sends push notification
  ↓
User does not respond (or app is killed)
  ↓
Grace period expires (5 minutes)
  ↓
Server marks check-in as 'missed'
  ↓
Server escalates to agent
  ↓
Agent is notified via dashboard
  ↓
Agent can:
  - Start video call with user
  - Start audio call with user
  - Send chat message
  - Create emergency alert
```

## Files

- **`checkin.types.ts`** - Type definitions
- **`checkin.constants.ts`** - Constants (grace periods, timeouts)
- **`checkin.service.ts`** - Core check-in scheduling and completion logic
- **`checkin.hooks.ts`** - React hooks for check-in operations
- **`checkin.guard.tsx`** - Permission guard wrapper
- **`README.md`** - This documentation

## Usage

### Scheduling a Check-In

```tsx
import { useCheckIns } from '@/features/checkins';

function ScheduleCheckInScreen() {
  const { scheduleCheckIn, loading } = useCheckIns();

  const handleSchedule = async () => {
    // Schedule check-in for 1 hour from now
    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    
    const result = await scheduleCheckIn({
      scheduled_at: scheduledAt,
      message: 'Checking in from work',
    });

    if (result.success) {
      alert('Check-in scheduled successfully');
    } else {
      alert('Failed to schedule check-in: ' + result.error);
    }
  };

  return (
    <Button
      title="Schedule Check-In"
      onPress={handleSchedule}
      disabled={loading}
    />
  );
}
```

### Completing a Check-In (from Push Notification)

```tsx
import { useCheckIns } from '@/features/checkins';
import { verifyEmergencyPasskey } from '@/features/emergency';

function CheckInScreen({ checkInId }: { checkInId: string }) {
  const { completeCheckIn, getCheckIn, loading } = useCheckIns();
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null);
  const [showPasskeyModal, setShowPasskeyModal] = useState(false);

  useEffect(() => {
    // Load check-in details
    getCheckIn(checkInId).then(setCheckIn);
  }, [checkInId]);

  const handlePasskeySubmit = async (passkey: string) => {
    // Verify passkey first
    const isValid = await verifyEmergencyPasskey(passkey);
    
    if (!isValid) {
      alert('Invalid passkey');
      return;
    }

    setShowPasskeyModal(false);
    
    // Complete check-in with location capture
    const result = await completeCheckIn(checkInId, true);
    
    if (result.success) {
      alert('Check-in completed successfully');
      // Navigate away or show success screen
    } else {
      alert('Failed to complete check-in');
    }
  };

  if (!checkIn) {
    return <Text>Loading check-in...</Text>;
  }

  return (
    <View>
      <Text>Scheduled: {new Date(checkIn.scheduled_at).toLocaleString()}</Text>
      {checkIn.notes && <Text>Notes: {checkIn.notes}</Text>}
      
      <Button
        title="Complete Check-In"
        onPress={() => setShowPasskeyModal(true)}
        disabled={loading}
      />
      
      <PasskeyModal
        visible={showPasskeyModal}
        onSubmit={handlePasskeySubmit}
        onCancel={() => setShowPasskeyModal(false)}
      />
    </View>
  );
}
```

### Using Check-In Guard

```tsx
import { CheckInGuard } from '@/features/checkins';

function CheckInScreen() {
  return (
    <CheckInGuard>
      <ScheduleCheckInForm />
    </CheckInGuard>
  );
}
```

## Key Principles

### 1. No Timers in App

The app **never**:
- Schedules local notifications (server does this)
- Waits for scheduled times
- Checks deadlines
- Implements escalation logic

The app **only**:
- Records scheduling intent
- Responds to push notifications
- Confirms completion

### 2. Server-Driven Scheduling

All scheduling logic runs on the server:

- Push notification scheduling
- Deadline checking
- Grace period enforcement
- Missed check-in detection
- Escalation to agents

### 3. Push Notification Driven

Check-ins are triggered by push notifications:

1. Server sends push at `scheduled_at`
2. Push payload includes `checkin_id`
3. App routes to Check-In screen
4. User completes check-in
5. Server marks as completed

### 4. Passkey Verification

Passkey verification happens BEFORE check-in completion:

1. User taps "Complete Check-In"
2. Passkey modal appears
3. User enters 4-digit passkey
4. Passkey verified server-side
5. If valid, check-in is completed
6. If invalid, show error (check-in not completed)

### 5. Location Capture (Optional)

Location can be captured at check-in completion time:

```ts
await completeCheckIn(checkInId, true); // captureLocation = true
```

Location capture is optional and non-blocking - check-in completes even if location capture fails.

## Server-Side Requirements

The backend MUST:

1. **Store check-in records** in `checkins` table
2. **Schedule push notifications** for `scheduled_at` time
3. **Send push notifications** with payload:
   ```json
   {
     "type": "check_in",
     "entity_id": "checkin_123"
   }
   ```
4. **Start grace period** (5 minutes after scheduled time)
5. **Mark as missed** if not completed within grace period
6. **Escalate to agent** if check-in is missed
7. **Assign agent** using load balancing algorithm
8. **Send agent notification** via dashboard
9. **Create emergency** if escalation requires it

## Database Schema

Check-ins are stored in the `checkins` table with:

- `mobile_user_id` - User who scheduled check-in
- `scheduled_at` - When check-in is scheduled
- `status` - Check-in status (pending, completed, missed, cancelled, escalated)
- `notes` - User message/notes
- `passkey_attempts` - Number of passkey attempts
- `passkey_correct` - Whether correct passkey was entered
- `location_at_checkin` - Location when check-in occurred (JSONB)
- `agent_call_triggered` - Whether agent call was triggered
- `assigned_agent_id` - Assigned responding agent
- `completed_at` - When check-in was completed

## Push Notification Integration

Check-in notifications must be routed correctly:

```ts
// In notification.router.ts
case 'check_in':
  navigationRef.navigate('CheckInScreen', {
    checkInId: payload.entity_id,
  });
  break;
```

The `CheckInScreen` should:
1. Load check-in details using `getCheckIn(checkInId)`
2. Display scheduled time and message
3. Show passkey prompt
4. Complete check-in after passkey verification

## Testing Scenarios

Test ALL of these scenarios:

### 1. Normal Flow
- ✅ User schedules check-in
- ✅ Push notification arrives at scheduled time
- ✅ User taps notification
- ✅ App opens to Check-In screen
- ✅ User enters passkey
- ✅ Check-in completed

### 2. App Killed
- ✅ User schedules check-in
- ✅ User kills app
- ✅ Push notification arrives
- ✅ User taps notification
- ✅ App cold-starts
- ✅ App routes to Check-In screen
- ✅ Check-in can be completed

### 3. Missed Check-In
- ✅ User schedules check-in
- ✅ Push notification arrives
- ✅ User ignores notification
- ✅ Grace period expires
- ✅ Server marks check-in as 'missed'
- ✅ Agent is notified
- ✅ Escalation happens

### 4. Late Completion
- ✅ User schedules check-in
- ✅ Push notification arrives
- ✅ User opens app after grace period
- ✅ Check-in may be marked as 'overdue'
- ✅ User can still complete (if allowed by server)

### 5. No Notification Permission
- ✅ User schedules check-in
- ✅ Notification permission denied
- ✅ Server still tracks check-in
- ✅ Server escalates if not completed
- ✅ User sees check-in in app history

### 6. Network Failure During Completion
- ✅ User completes check-in
- ✅ Network request fails
- ✅ Error shown to user
- ✅ Check-in NOT marked as completed
- ✅ User must retry

## Integration with Other Features

### Emergency System
- Missed check-ins can escalate to emergencies
- Emergency system handles agent notification
- Shared passkey verification logic

### Location Tracking
- Check-ins can capture location
- Location stored in `location_at_checkin` JSONB field
- Optional - check-in completes without location

### Push Notifications
- Check-ins trigger push notifications
- Notifications wake app from killed state
- Notification routing opens Check-In screen

### Real-time Updates
- Check-in status updates via Supabase Realtime (foreground only)
- Background updates via push notifications
- Agent dashboard receives real-time check-in updates

## Security Considerations

- Passkeys verified server-side using bcrypt
- Check-in records protected by RLS
- Users can only access their own check-ins
- Agents can access assigned check-ins
- Location data stored securely in JSONB

## iOS Safety

- No background timers or scheduling
- No local deadline checking
- Push notifications wake app
- Cold-start routing works correctly
- Server handles all time-based logic

