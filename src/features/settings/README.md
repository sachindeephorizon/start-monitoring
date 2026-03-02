# Settings & Preferences

Settings and preferences functionality for App Store submission compliance. All screens are read-only or user-control only, with no background logic.

## Architecture

### Core Design Principle

> **Settings screens are read-only or user-control only.**
> **No background logic, no automatic permission re-requests.**

### iOS Safety

- ✅ Read-only permission status display
- ✅ Deep-links to iOS Settings (no auto-requests)
- ✅ User-controlled notification preferences
- ✅ Account operations (logout, delete)
- ✅ Static legal content
- ✅ No background execution
- ✅ No permission re-prompt loops

## Files

- **`settings.types.ts`** - Type definitions
- **`settings.service.ts`** - Settings operations (status checks, account operations)
- **`settings.hooks.ts`** - React hooks for settings
- **`components/PermissionStatusScreen.tsx`** - Permission status display
- **`components/NotificationPreferencesScreen.tsx`** - Notification preferences
- **`components/AccountSettingsScreen.tsx`** - Account controls
- **`components/LegalScreen.tsx`** - Legal documents
- **`components/SettingsHomeScreen.tsx`** - Settings home/navigation
- **`README.md`** - This documentation

## Usage

### Settings Home Screen

```tsx
import { SettingsHomeScreen } from '@/features/settings';
import { useNavigation } from '@react-navigation/native';

function SettingsScreen() {
  const navigation = useNavigation();

  return (
    <SettingsHomeScreen
      onNavigateToPermissions={() => navigation.navigate('PermissionStatus')}
      onNavigateToNotifications={() => navigation.navigate('NotificationPreferences')}
      onNavigateToAccount={() => navigation.navigate('AccountSettings')}
      onNavigateToPrivacy={() => navigation.navigate('Legal', { type: 'privacy' })}
      onNavigateToTerms={() => navigation.navigate('Legal', { type: 'terms' })}
      onNavigateToRefund={() => navigation.navigate('Legal', { type: 'refund' })}
    />
  );
}
```

### Permission Status Screen

```tsx
import { PermissionStatusScreen } from '@/features/settings';

function PermissionStatusRoute() {
  return <PermissionStatusScreen />;
}
```

### Notification Preferences Screen

```tsx
import { NotificationPreferencesScreen } from '@/features/settings';

function NotificationPreferencesRoute() {
  return <NotificationPreferencesScreen />;
}
```

### Account Settings Screen

```tsx
import { AccountSettingsScreen } from '@/features/settings';

function AccountSettingsRoute() {
  return <AccountSettingsScreen />;
}
```

### Legal Screen

```tsx
import { LegalScreen } from '@/features/settings';

function LegalRoute({ route }) {
  const { type } = route.params; // 'privacy', 'terms', or 'refund'
  return <LegalScreen documentType={type} />;
}
```

## Key Principles

### 1. Read-Only Permission Status

Permission status screen:

- ❌ Does NOT auto-request permissions
- ❌ Does NOT re-prompt denied permissions
- ✅ Only displays current status
- ✅ Deep-links to iOS Settings when denied
- ✅ Clearly explains why each permission is required

### 2. Deep-Link to iOS Settings

When permission is denied/blocked:

```ts
import { Linking, Platform } from 'react-native';

if (Platform.OS === 'ios') {
  await Linking.openURL('app-settings:');
} else {
  await Linking.openSettings();
}
```

This opens the iOS Settings app where users can change permissions.

### 3. Notification Preferences

Notification preferences:

- Stored server-side (future implementation)
- Emergency alerts cannot be disabled (App Store requirement)
- Push delivery logic remains unchanged
- Preferences only affect server-side filtering

### 4. Account Operations

Account settings:

- **Logout**: Immediate sign out (handled by AuthService)
- **Delete Account**: Requires double confirmation (destructive action)
- Server handles account deletion and data retention

### 5. Legal Documents

Legal screens:

- Static content (can be fetched from server or stored locally)
- App Store-compliant language
- Required for App Store submission
- No business logic

## iOS Configuration

### Required for App Store

Legal documents must be:
- Accessible from within the app
- Clearly written
- App Store-compliant
- Include Privacy Policy, Terms of Service, Refund Policy

### Permission Explanations

Each permission must have clear explanation:

- **Location (Always)**: "Required for continuous safety tracking even when the app is closed."
- **Location (When In Use)**: "Required to capture your location during emergencies."
- **Notifications**: "Required for emergency alerts, check-in reminders, and agent communications."
- **Microphone**: "Required for audio calls with security agents."
- **Camera**: "Required for video calls with security agents."

## App Store Compliance

### Required Screens

1. **Privacy Policy** - Must be accessible
2. **Terms of Service** - Must be accessible
3. **Refund Policy** - Must be accessible (for paid services)
4. **Permission Status** - Shows current permissions
5. **Account Management** - Logout and delete account

### Permission Handling

- Never auto-request permissions from settings screen
- Only show status and explanation
- Deep-link to iOS Settings for changes
- Clear explanations for each permission

### Legal Content

Legal documents should:
- Be clearly written
- Comply with App Store guidelines
- Include contact information
- Be updated as needed

## Testing Scenarios

Test ALL of these scenarios:

### 1. Permission Status
- ✅ All permissions granted → Shows "Granted" status
- ✅ Permission denied → Shows "Denied" status with "Open Settings" button
- ✅ Permission blocked → Shows "Blocked" status
- ✅ Tap "Open Settings" → iOS Settings opens

### 2. Notification Preferences
- ✅ Preferences load correctly
- ✅ Toggle preference → Updates server
- ✅ Emergency alerts → Cannot be disabled
- ✅ Changes persist after app restart

### 3. Account Operations
- ✅ Logout → Confirms, signs out, navigates to auth screen
- ✅ Delete account → Requires double confirmation
- ✅ Delete account → Account deleted, user signed out

### 4. Legal Screens
- ✅ Privacy Policy → Displays correctly
- ✅ Terms of Service → Displays correctly
- ✅ Refund Policy → Displays correctly

## Security Considerations

- Account deletion requires confirmation
- Permission status is read-only
- Notification preferences stored server-side
- Legal content should be validated before deployment

## iOS Safety

- No background logic
- No automatic permission requests
- No permission re-prompt loops
- Pure UI and user controls
- App Store compliant

## Common Issues

### Settings Not Opening

**Cause**: Linking API not working or incorrect URL scheme.

**Solution**: Verify Platform.OS check and URL scheme ('app-settings:' for iOS).

### Permission Status Not Updating

**Cause**: Permission status not refreshed after returning from Settings.

**Solution**: Refresh permission statuses when screen comes into focus.

### Legal Content Missing

**Cause**: Placeholder content not replaced with actual legal documents.

**Solution**: Replace placeholder content with actual legal documents before App Store submission.

