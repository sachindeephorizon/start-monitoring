# SubscriptionStoreView Import Fix

## Issue
`showSubscriptionStore` is undefined when imported, causing runtime error:
```
[SubscriptionPlansScreen] showSubscriptionStore is not a function: undefined
```

## Root Cause
Metro bundler may not be resolving the named export correctly, or there's a cache issue.

## ✅ Fix Applied

1. **Explicit Named Export**: Changed from `export async function` to separate declaration + `export { showSubscriptionStore }`
2. **Dynamic Import**: Changed to use `require()` with fallback to handle bundling issues
3. **Better Error Handling**: Added detailed logging to diagnose import issues

## 🔧 Solution

The import has been changed to use `require()` instead of ES6 import to avoid Metro bundler issues:

```typescript
let showSubscriptionStore: (() => Promise<void>) | undefined;
try {
  const SubscriptionStoreViewModule = require('@/features/subscription/SubscriptionStoreView');
  showSubscriptionStore = SubscriptionStoreViewModule.showSubscriptionStore || SubscriptionStoreViewModule.default?.showSubscriptionStore;
} catch (error) {
  console.error('[SubscriptionPlansScreen] Failed to import SubscriptionStoreView:', error);
}
```

## 🚀 Next Steps

1. **Clear Metro Cache**:
   ```bash
   npx expo start --clear
   ```

2. **Rebuild App**:
   ```bash
   npx expo run:ios
   ```

3. **If Still Failing**:
   - Check Metro bundler logs for import errors
   - Verify the file exists at `src/features/subscription/SubscriptionStoreView.ts`
   - Check that the export is correct

## 📝 Alternative Solution

If the `require()` approach doesn't work, you can use a direct inline implementation:

```typescript
// In SubscriptionPlansScreen.tsx, replace the import with:
import { presentSubscriptionStoreViewWithGroupID } from '@/features/subscription/SubscriptionStoreView.native';
import { Platform } from 'react-native';

// Then in the button handler:
if (Platform.OS === 'ios') {
  const iosVersion = parseInt(Platform.Version as string, 10);
  if (iosVersion >= 17) {
    try {
      await presentSubscriptionStoreViewWithGroupID();
    } catch (error) {
      // Fallback to custom flow
    }
  }
}
```

This bypasses the wrapper function entirely and calls the native module directly.
