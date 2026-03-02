/**
 * SubscriptionStoreView
 * 
 * Cross-platform interface for subscription store view.
 * On iOS 17.0+, uses Apple's native SubscriptionStoreView.
 * On older iOS versions or Android, falls back to custom UI.
 */

import { Platform } from 'react-native';
import { 
  presentSubscriptionStoreView, 
  presentSubscriptionStoreViewWithGroupID 
} from './SubscriptionStoreView.native';

/**
 * Present subscription store view
 * 
 * On iOS 17.0+: Uses Apple's native SubscriptionStoreView
 * On older versions: Falls back to custom subscription screen
 */
async function showSubscriptionStore(): Promise<void> {
  if (Platform.OS === 'ios') {
    // Check iOS version
    const majorVersion = parseInt(Platform.Version as string, 10);
    
    if (majorVersion >= 17) {
      // Use native SubscriptionStoreView (recommended - uses group ID)
      try {
        await presentSubscriptionStoreViewWithGroupID();
        return;
      } catch (error) {
        console.warn('[SubscriptionStoreView] Failed to present native view, falling back to custom UI:', error);
        // Fall through to custom UI
      }
    }
  }
  
  // Fallback: Navigate to custom subscription screen
  // This will be handled by the navigation system
  throw new Error('Native SubscriptionStoreView not available. Use custom subscription screen.');
}

// Named export
export { showSubscriptionStore };

// Default export for compatibility
export default {
  showSubscriptionStore,
};
