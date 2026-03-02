# Authentication Module

This module provides secure, iOS-safe authentication for the DeepHorizon Security app.

## Architecture

The authentication module is split into layers:

1. **Types** (`auth.types.ts`) - Type definitions for auth state and operations
2. **Session** (`auth.session.ts`) - SecureStore-based session persistence
3. **Service** (`auth.service.ts`) - Core authentication logic with Supabase
4. **Context** (`auth.context.tsx`) - Global auth state management
5. **Hooks** (`auth.hooks.ts`) - React hooks for auth operations
6. **Guard** (`auth.guard.tsx`) - React component for protecting routes

## iOS Safety

### Critical iOS Rules

- ✅ Sessions are stored in **SecureStore** (Keychain on iOS)
- ✅ Sessions survive **process death** and **cold starts**
- ✅ Auth state is **resumable**, not remembered
- ✅ Token refresh is handled automatically by Supabase
- ✅ No memory-only auth state

### Why SecureStore?

On iOS, apps are killed frequently:
- Low memory situations
- Background suspension
- System updates
- User force-quit

Only SecureStore (Keychain) data survives process death. AsyncStorage does NOT survive on iOS.

## Usage

### Basic Setup

The `AuthProvider` must wrap your app:

```tsx
import { AuthProvider } from '@/core/auth';

function App() {
  return (
    <AuthProvider>
      {/* Your app */}
    </AuthProvider>
  );
}
```

### Using Auth Guard

Protect routes that require authentication:

```tsx
import { AuthGuard } from '@/core/auth';

function ProtectedScreen() {
  return (
    <AuthGuard>
      <YourContent />
    </AuthGuard>
  );
}
```

### Using Hooks

Access auth state and methods:

```tsx
import { useAuth, useIsAuthenticated, useCurrentUser } from '@/core/auth';

function MyComponent() {
  const auth = useAuth();
  const isAuthenticated = useIsAuthenticated();
  const user = useCurrentUser();

  if (isAuthenticated && user) {
    return <Text>Welcome, {user.email}!</Text>;
  }

  return <Text>Please sign in</Text>;
}
```

### Sign In

```tsx
import { useAuth } from '@/core/auth';

function LoginScreen() {
  const { signIn } = useAuth();

  const handleLogin = async () => {
    const result = await signIn({
      email: 'user@example.com',
      password: 'password',
    });

    if (result.success) {
      // User is signed in, navigation will update automatically
    } else {
      alert(result.error);
    }
  };

  return <Button onPress={handleLogin} title="Sign In" />;
}
```

### Sign Up

```tsx
import { useAuth } from '@/core/auth';

function SignUpScreen() {
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    const result = await signUp({
      email: 'user@example.com',
      password: 'password',
      phone: '+1234567890',
      name: 'John Doe',
    });

    if (result.success) {
      if (result.requiresVerification) {
        // Email verification required
        navigateToVerification();
      } else {
        // Signed in immediately
      }
    } else {
      alert(result.error);
    }
  };

  return <Button onPress={handleSignUp} title="Sign Up" />;
}
```

### Sign Out

```tsx
import { useAuth } from '@/core/auth';

function SettingsScreen() {
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    // Navigation will update automatically
  };

  return <Button onPress={handleSignOut} title="Sign Out" />;
}
```

## Session Restoration

The auth system automatically restores sessions on app startup:

1. App starts
2. `AuthProvider` mounts
3. `AuthService.restore()` is called
4. Session is loaded from SecureStore
5. Session is validated with Supabase
6. Auth state is updated

This handles cold-start scenarios on iOS where the app process was killed.

## Token Refresh

Supabase automatically refreshes tokens when they expire. The auth system:

1. Listens to `TOKEN_REFRESHED` events from Supabase
2. Saves refreshed session to SecureStore
3. Updates auth state

No manual token refresh is needed in most cases.

## Testing Cold Starts

To test that sessions survive process death:

1. Sign in to the app
2. Force-quit the app (swipe up on iOS)
3. Reopen the app
4. You should still be signed in

## Security Considerations

- Sessions are encrypted in SecureStore (Keychain on iOS)
- Session data is validated with Supabase before use
- Expired sessions are automatically cleared
- Sign out clears all session data

## Integration with Navigation

The app's root navigator checks auth state:

```tsx
function RootNavigator() {
  const auth = useAuth();

  return (
    <NavigationContainer>
      {auth.status === 'authenticated' ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
```

This ensures users are directed to the correct flow based on authentication state.

