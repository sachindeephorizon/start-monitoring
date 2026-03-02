# History & Activity

Activity history functionality for viewing all past safety events. This is a read-only feature with zero iOS risk.

## Architecture

### Core Design Principle

> **History is READ-ONLY. No business logic lives here.**
> **The server already decided everything.**

### iOS Safety

- ✅ Read-only queries (no mutations)
- ✅ No background logic or timers
- ✅ No real-time dependencies (optional foreground realtime only)
- ✅ No permissions required
- ✅ Works after app kill
- ✅ Pure data presentation

### History Categories

The history feature displays:

1. **Tracking Sessions** - Past location tracking sessions
2. **Check-Ins** - Completed, missed, and overdue check-ins
3. **Emergency Alerts** - All emergency alerts and their resolution
4. **Audio Calls** - Past audio call sessions
5. **Video Calls** - Past video call sessions
6. **Bodyguard Bookings** - All bodyguard service bookings

Each category is:
- Fetched from server
- Filtered by user
- Ordered by time (most recent first)

## Files

- **`history.types.ts`** - Type definitions
- **`history.service.ts`** - Read-only queries from database
- **`history.hooks.ts`** - React hooks for fetching history
- **`history.sections.ts`** - Helper functions for grouping history
- **`README.md`** - This documentation

## Usage

### Basic History Screen

```tsx
import { useHistory } from '@/features/history';
import { FlatList, Text, View, ActivityIndicator } from 'react-native';

function HistoryScreen() {
  const { items, loading, error, refreshHistory } = useHistory();

  if (loading) {
    return <ActivityIndicator size="large" />;
  }

  if (error) {
    return <Text>Error: {error}</Text>;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View>
          <Text>{item.title}</Text>
          <Text>Status: {item.status}</Text>
          <Text>Date: {new Date(item.started_at).toLocaleString()}</Text>
        </View>
      )}
      refreshing={loading}
      onRefresh={refreshHistory}
    />
  );
}
```

### Filtered History by Type

```tsx
import { useHistoryByType } from '@/features/history';

function EmergencyHistoryScreen() {
  const { items, loading } = useHistoryByType('emergency');

  return (
    // Render emergency history items
  );
}
```

### Grouped History by Type

```tsx
import { useHistory } from '@/features/history';
import { groupHistoryByType } from '@/features/history';

function HistoryScreen() {
  const { items, loading } = useHistory();

  const sections = groupHistoryByType(items);

  return (
    <FlatList
      data={sections}
      keyExtractor={(section) => section.type}
      renderItem={({ item: section }) => (
        <View>
          <Text>{section.title}</Text>
          {section.items.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </View>
      )}
    />
  );
}
```

### Grouped History by Date

```tsx
import { useHistory } from '@/features/history';
import { groupHistoryByDate, formatHistoryDate } from '@/features/history';

function HistoryScreen() {
  const { items, loading } = useHistory();

  const groupedByDate = groupHistoryByDate(items);

  return (
    <FlatList
      data={Object.entries(groupedByDate)}
      keyExtractor={([date]) => date}
      renderItem={({ item: [date, items] }) => (
        <View>
          <Text>{formatHistoryDate(date)}</Text>
          {items.map((item) => (
            <HistoryItem key={item.id} item={item} />
          ))}
        </View>
      )}
    />
  );
}
```

## Key Principles

### 1. Read-Only

History is read-only:

- ❌ No mutations
- ❌ No editing
- ❌ No deletion
- ✅ Only display

History must feel immutable.

### 2. Server as Source of Truth

All data comes from the server:

- Queries database directly
- No client-side state machines
- No local calculations
- Server already decided everything

### 3. No Real-Time Required

History does not require real-time:

- Optional foreground real-time for live updates
- Manual refresh available
- Works perfectly without real-time

### 4. Performance

History handles large datasets:

- Efficient queries with indexes
- Pagination can be added if needed
- Sorting done server-side
- UI optimizations (FlatList, memoization)

## Database Integration

History queries from multiple tables:

- `emergencies` - Emergency alerts
- `checkins` - Scheduled check-ins
- `tracking_sessions` - Tracking sessions
- `call_sessions` - Audio and video calls
- `bodyguard_bookings` - Bodyguard bookings

All queries:
- Filter by `mobile_user_id` (current user)
- Order by timestamp (most recent first)
- Use RLS policies for security

## UI Guidelines

### Default View

- Most recent first (default sorting)
- Clear status badges (completed, missed, resolved, etc.)
- Tapping item → detail screen (read-only)
- No edit actions
- No delete actions

### Status Badges

Use clear status indicators:

- **Completed** - Green badge
- **Active** - Blue badge
- **Missed/Failed** - Red badge
- **Pending** - Yellow badge
- **Cancelled** - Gray badge

### Date Formatting

- Today → "Today"
- Yesterday → "Yesterday"
- This week → "Monday", "Tuesday", etc.
- Older → "Jan 15, 2025"

## History Item Transformation

Raw database records are transformed into `HistoryItem` format:

```ts
{
  id: string;
  type: HistoryItemType;
  title: string; // User-friendly title
  status: string; // Current status
  started_at: string; // ISO timestamp
  ended_at?: string; // ISO timestamp (if applicable)
  metadata: {
    // Type-specific metadata
  };
  raw?: any; // Original database record
}
```

This format:
- Standardizes different record types
- Makes UI rendering easier
- Preserves raw data for detail views

## Filtering

History supports filtering by:

- **Type** - Filter by item type (tracking, checkin, emergency, etc.)
- **Status** - Filter by status (completed, active, missed, etc.)
- **Date Range** - Filter by start date range

Filters are applied client-side after fetching (can be moved to server for better performance with large datasets).

## Testing Scenarios

Test ALL of these scenarios:

### 1. Normal History Load
- ✅ App opens history screen
- ✅ All history types load correctly
- ✅ Items sorted by date (most recent first)
- ✅ Status badges display correctly

### 2. App Killed
- ✅ App killed
- ✅ User reopens app
- ✅ History loads correctly
- ✅ No data loss

### 3. No Network
- ✅ Network unavailable
- ✅ History shows empty state or cached data
- ✅ Error message shown (if applicable)
- ✅ Refresh available when network returns

### 4. Large History
- ✅ User has many history items
- ✅ List performance is acceptable
- ✅ Scrolling is smooth
- ✅ No memory issues

### 5. Partial Failures
- ✅ Some queries succeed, some fail
- ✅ Show what loads successfully
- ✅ Error shown for failed queries
- ✅ User can retry

## Security Considerations

- History protected by RLS
- Users can only see their own history
- No sensitive data exposed
- Status information is read-only

## iOS Safety

- No background logic
- No timers or subscriptions required
- No permissions needed
- Works after app kill
- Pure data presentation
- Zero iOS risk

## Common Issues

### History Not Loading

**Cause**: Network error or authentication issue.

**Solution**: Check network connection, verify user is authenticated, check error message.

### Slow Performance

**Cause**: Too many history items or inefficient queries.

**Solution**: Add pagination, add date range filters, optimize queries with proper indexes.

### Missing Items

**Cause**: RLS policy issue or query filter too restrictive.

**Solution**: Check RLS policies, verify query filters, check user authentication.

