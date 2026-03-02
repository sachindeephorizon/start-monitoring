# Bodyguard Booking

Bodyguard booking functionality for requesting and managing bodyguard services. This is a server-driven workflow with minimal iOS risk.

## Architecture

### Core Design Principle

> **Bodyguard booking is pure intent + server workflow.**
> **The app never "tracks" or "waits".**

### iOS Safety

- ✅ Pure intent submission (no coordination logic)
- ✅ Server-driven workflow
- ✅ Status updates via server (realtime or refresh)
- ✅ Push notifications for status changes
- ✅ No background logic or timers
- ✅ Subscription gating (premium feature)

### Booking Flow

```
User submits booking request
  ↓
Server creates booking (status: 'pending')
  ↓
Server notifies agents via push
  ↓
Agent assigns bodyguard
  ↓
Server updates booking (status: 'confirmed')
  ↓
Server notifies user via push
  ↓
Service starts (status: 'active')
  ↓
Service completes (status: 'completed')
```

The app does not coordinate anything - all workflow happens server-side.

## Files

- **`bodyguard.types.ts`** - Type definitions
- **`bodyguard.constants.ts`** - Constants (max guards, service type)
- **`bodyguard.service.ts`** - CRUD operations (server coordinates workflow)
- **`bodyguard.hooks.ts`** - React hooks for booking operations
- **`bodyguard.guard.tsx`** - Subscription guard wrapper
- **`README.md`** - This documentation

## Usage

### Creating a Booking

```tsx
import { useBodyguardBookings } from '@/features/bodyguard';
import { BodyguardBookingPayload } from '@/features/bodyguard';

function NewBookingScreen() {
  const { createBooking, loading } = useBodyguardBookings();

  const handleSubmit = async () => {
    const payload: BodyguardBookingPayload = {
      city: 'Mumbai',
      number_of_guards: 2,
      start_date: new Date('2025-02-01T10:00:00Z').toISOString(),
      end_date: new Date('2025-02-01T18:00:00Z').toISOString(),
      location: {
        latitude: 19.0760,
        longitude: 72.8777,
        address: '123 Main Street',
      },
      reason: 'Event security',
      special_requirements: 'Require guards with event security experience',
    };

    const result = await createBooking(payload);

    if (result.success) {
      alert('Booking request submitted successfully');
      // Navigate to booking details
    } else {
      alert('Failed to create booking: ' + result.error);
    }
  };

  return (
    <Button
      title="Submit Booking Request"
      onPress={handleSubmit}
      disabled={loading}
    />
  );
}
```

### Viewing Bookings

```tsx
import { useBodyguardBookings } from '@/features/bodyguard';
import { FlatList, Text, View } from 'react-native';

function BookingsScreen() {
  const { bookings, loading, refreshBookings } = useBodyguardBookings();

  return (
    <View>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>City: {item.city}</Text>
            <Text>Status: {item.status}</Text>
            <Text>Guards: {item.number_of_guards}</Text>
            <Text>Start: {new Date(item.start_date || '').toLocaleString()}</Text>
          </View>
        )}
        refreshing={loading}
        onRefresh={refreshBookings}
      />
    </View>
  );
}
```

### Cancelling a Booking

```tsx
import { useBodyguardBookings } from '@/features/bodyguard';

function BookingDetailsScreen({ bookingId }: { bookingId: string }) {
  const { cancelBooking, loading } = useBodyguardBookings();

  const handleCancel = async () => {
    const success = await cancelBooking(bookingId);

    if (success) {
      alert('Booking cancelled successfully');
    } else {
      alert('Failed to cancel booking');
    }
  };

  return (
    <Button
      title="Cancel Booking"
      onPress={handleCancel}
      disabled={loading}
    />
  );
}
```

### Using Bodyguard Guard

```tsx
import { BodyguardGuard } from '@/features/bodyguard';

function BodyguardScreen() {
  return (
    <BodyguardGuard>
      <BookingForm />
    </BodyguardGuard>
  );
}
```

## Key Principles

### 1. Pure Intent Submission

The app only submits booking requests:

- User fills form
- App creates booking record
- Server handles everything else

The app never:
- Waits for agent assignment
- Polls for status updates
- Coordinates workflow

### 2. Server-Driven Workflow

All coordination happens server-side:

- Agent notification
- Bodyguard assignment
- Status updates
- User notifications

### 3. Status Updates

Status updates come from server:

- Real-time subscriptions (foreground only)
- Push notifications (background/killed)
- Manual refresh

### 4. Subscription Gating

Bodyguard booking requires active subscription:

- Use `BodyguardGuard` to gate features
- Wraps `SubscriptionGuard`
- Shows subscription required message if not subscribed

### 5. No Background Logic

The app does not:

- Track booking status in background
- Schedule reminders
- Monitor assignment progress
- Coordinate with agents

All of this happens server-side.

## Database Schema

### `bodyguard_bookings` Table

- `id` - Booking ID
- `mobile_user_id` - User who created booking
- `service_type` - Service type ('bodyguard')
- `city` - City where service is needed
- `number_of_guards` - Number of bodyguards requested
- `start_date` / `start_time` - Service start time
- `end_date` / `end_time` - Service end time
- `location` - Service location (JSONB)
- `description` - Booking description
- `reason` - Reason for bodyguard requirement
- `special_requirements` - Special instructions
- `status` - 'pending', 'confirmed', 'active', 'completed', 'cancelled'
- `assigned_agent_id` - Assigned agent

### `bodyguard_assignments` Table

- `id` - Assignment ID
- `booking_id` - Related booking
- `guard_id` - Assigned bodyguard
- `client_name` - Client name
- `client_contact` - Client contact
- `pickup_location` - Pickup location (JSONB)
- `drop_location` - Drop location (JSONB)
- `start_time` - Assignment start time
- `end_time` - Assignment end time
- `special_instructions` - Special instructions
- `status` - 'active', 'completed', 'cancelled'

## Push Notification Integration

### Agent Notification (New Booking)

```json
{
  "type": "bodyguard_booking",
  "entity_id": "booking_123"
}
```

### User Notification (Status Update)

```json
{
  "type": "bodyguard_booking_update",
  "entity_id": "booking_123",
  "status": "confirmed"
}
```

The notification router should route to booking details screen.

## Server-Side Requirements

The backend MUST:

1. **Notify agents** when booking is created
2. **Assign bodyguards** when agent confirms
3. **Update booking status** on workflow events
4. **Notify user** on every status change
5. **Log audit trail** in database
6. **Enforce business rules** (max guards, cancellation rules, etc.)

No mobile coordination logic should exist.

## Testing Scenarios

Test ALL of these scenarios:

### 1. Booking Creation
- ✅ User creates booking
- ✅ Booking saved to database
- ✅ Agents notified via push
- ✅ Booking appears in user's list

### 2. App Killed After Creation
- ✅ User creates booking
- ✅ User kills app
- ✅ Booking exists on server
- ✅ User receives push when status changes
- ✅ User can view booking when app reopens

### 3. Booking Cancellation
- ✅ User cancels pending booking
- ✅ Status updates to 'cancelled'
- ✅ Booking removed from active list
- ✅ Agent notified (if assigned)

### 4. Status Updates
- ✅ Agent confirms booking
- ✅ User receives push notification
- ✅ User opens notification
- ✅ App routes to booking details
- ✅ Status shows 'confirmed'

### 5. Subscription Required
- ✅ User without subscription tries to book
- ✅ SubscriptionGuard blocks access
- ✅ Message shown to activate subscription
- ✅ User can navigate to subscription screen

## Security Considerations

- Bookings protected by RLS
- Users can only access their own bookings
- Cancellation only allowed for pending/confirmed bookings
- Subscription required for booking creation
- Server validates all business rules

## iOS Safety

- No background logic or timers
- Pure intent submission
- Server-driven workflow
- Push notifications for updates
- Real-time subscriptions (foreground only)
- Subscription gating

## Common Issues

### Booking Not Created

**Cause**: Network error or validation failure.

**Solution**: Check error message, ensure all required fields provided, verify subscription is active.

### Status Not Updating

**Cause**: Real-time subscription not active or push notification not received.

**Solution**: Ensure app is in foreground for real-time, or manually refresh bookings.

### Cannot Cancel Booking

**Cause**: Booking status is 'active' or 'completed' (only pending/confirmed can be cancelled).

**Solution**: Inform user that only pending/confirmed bookings can be cancelled.

