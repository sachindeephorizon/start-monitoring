import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Alert,
  Platform,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { styles } from './SlideMenu.styles';
import { useSubscription } from '@/hooks/useSubscription';

interface SlideMenuProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  navigation: any;
}

const SlideMenu: React.FC<SlideMenuProps> = ({ visible, onClose, onLogout, navigation }) => {
  const slideAnim = useRef(new Animated.Value(280)).current; // Start off-screen to the right
  const { currentPlan, isFamilyPlan, refresh, subscription, isLoading, trialDaysRemaining } = useSubscription();
  const pendingNavigateRef = useRef<string | null>(null);
  const didRefreshForOpenRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const refreshRef = useRef(refresh);
  // iOS-only: avoid React Native Modal for menu overlay.
  // RN Modal on iOS can leave an invisible overlay that blocks touches after navigation/back.
  const [iosMounted, setIosMounted] = useState<boolean>(Platform.OS === 'ios' ? visible : false);
  const iosUnmountFailsafeCancelRef = useRef<(() => void) | null>(null);

  // Navigating while a RN Modal is dismissing can leave an invisible overlay
  // that blocks all touches on the next screen (observed in practice). We close first,
  // then navigate after the menu is actually hidden.
  useEffect(() => {
    if (visible) return;
    const route = pendingNavigateRef.current;
    if (!route) return;
    pendingNavigateRef.current = null;
    const doNav = () => {
      try {
        navigation.navigate(route);
      } catch {
        // Non-critical
      }
    };
    // iOS can navigate immediately after teardown; Android benefits from a short delay
    // so the fade-out Modal overlay is guaranteed to be gone.
    if (Platform.OS === 'android') {
      const t = setTimeout(doNav, 60);
      return () => clearTimeout(t);
    }
    Promise.resolve().then(doNav);
  }, [visible, navigation]);

  const handleNavigate = useCallback((route: string) => {
    // Always close first, then navigate from the effect above once the menu is hidden.
    pendingNavigateRef.current = route;
    onClose();
  }, [navigation, onClose]);

  // Debug logging
  useEffect(() => {
    if (visible) {
      if (__DEV__) {
        console.log('[SlideMenu] Menu opened - Subscription state:', {
          hasCurrentPlan: !!currentPlan,
          planType: currentPlan?.type,
          planName: currentPlan?.name,
          hasSubscription: !!subscription,
          isLoading,
          trialDaysRemaining,
        });
      }
    }
  }, [visible, currentPlan, subscription, isLoading, trialDaysRemaining]);

  // Always keep latest refresh function without re-triggering effects.
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Refresh subscription data when menu opens
  useEffect(() => {
    // Reset per-open flags when menu closes
    if (!visible) {
      didRefreshForOpenRef.current = false;
      refreshInFlightRef.current = false;
      return;
    }

    // All platforms: run refresh EXACTLY ONCE per menu open.
    // Avoid depending on `refresh` identity (it can change across renders and cause refresh storms).
    if (didRefreshForOpenRef.current || refreshInFlightRef.current) return;
    didRefreshForOpenRef.current = true;
    refreshInFlightRef.current = true;

    const doRefresh = async () => {
      try {
        if (__DEV__) console.log('[SlideMenu] Refreshing subscription data...');
        await refreshRef.current?.();
      } catch {
        // Non-critical
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    // Keep tiny delay on Android for smoothness; iOS can run immediately.
    const delayMs = Platform.OS === 'android' ? 100 : 0;
    const t = setTimeout(() => {
      void doRefresh();
    }, delayMs);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      iosUnmountFailsafeCancelRef.current?.();
      iosUnmountFailsafeCancelRef.current = null;
      Animated.timing(slideAnim, {
        toValue: 0, // Slide to visible position
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 280, // Slide back off-screen to the right
        duration: 300,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // iOS-only: unmount the overlay only after the close animation completes
        if (Platform.OS === 'ios' && finished) {
          setIosMounted(false);
        }
      });

      // iOS-only: hard failsafe.
      // If the close animation callback doesn't fire (rare under AppState churn),
      // the absolute overlay can stay mounted and block touches across the app.
      if (Platform.OS === 'ios') {
        iosUnmountFailsafeCancelRef.current?.();
        const timeoutId = setTimeout(() => {
          setIosMounted(false);
        }, 450);
        iosUnmountFailsafeCancelRef.current = () => clearTimeout(timeoutId);
      }
    }
  }, [visible, slideAnim]);

  // Optional debug location (kept nullable so we don't request permissions from the menu)
  type MenuLocation = { coords: { latitude: number; longitude: number } };
  const [currentLocation] = useState<MenuLocation | null>(null);
  const insets = useSafeAreaInsets();

  // iOS-only mount control for overlay menu (no RN Modal)
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (visible) {
      setIosMounted(true);
    }
  }, [visible]);

  const content = (
    <View
      style={[styles.slideMenuOverlay, iosOverlayStyles.overlayRoot]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={styles.slideMenuBackdrop}
        onPress={onClose}
        activeOpacity={1}
        disabled={!visible}
      />
      <Animated.View
        style={[
          styles.slideMenuContainer,
          {
            transform: [{ translateX: slideAnim }],
          },
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <View style={[styles.slideMenuHeader, { paddingTop: insets.top + 20 }]}>
          <View style={styles.slideMenuLeft} />
          <Text style={styles.slideMenuTitle}>Menu</Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.slideMenuClose}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="Close menu"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="close" size={22} color="#2C3E50" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.slideMenuContent}>
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Profile')}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="My Profile"
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="person" size={22} color="#2C3E50" style={menuIconStyle.icon} />
            <Text style={styles.slideMenuItemText}>My Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Subscription')}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel={trialDaysRemaining ? `Subscription, ${trialDaysRemaining} days left in trial` : 'Subscription'}
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="card-membership" size={22} color="#2C3E50" style={menuIconStyle.icon} />
            <View style={styles.subscriptionMenuItem}>
              <Text style={styles.slideMenuItemText}>Subscription</Text>
              {trialDaysRemaining !== null && trialDaysRemaining > 0 && (
                <View style={styles.trialBadge}>
                  <Text style={styles.trialBadgeText}>
                    {trialDaysRemaining === 1 ? '1 day left' : `${trialDaysRemaining} days left`}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {isFamilyPlan && (
            <TouchableOpacity
              style={styles.slideMenuItem}
              onPress={() => handleNavigate('Family')}
              activeOpacity={0.7}
              accessible={true}
              accessibilityLabel="Family members"
              accessibilityRole="menuitem"
            >
              <MaterialIcons name="family-restroom" size={22} color="#2C3E50" style={menuIconStyle.icon} />
              <Text style={styles.slideMenuItemText}>Family</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('EmergencyContacts')}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="Emergency Contacts"
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="contact-phone" size={22} color="#2C3E50" style={menuIconStyle.icon} />
            <Text style={styles.slideMenuItemText}>Emergency Contacts</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('History')}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="Activity history"
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="history" size={22} color="#2C3E50" style={menuIconStyle.icon} />
            <Text style={styles.slideMenuItemText}>History</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Policies')}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="View policies"
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="policy" size={22} color="#2C3E50" style={menuIconStyle.icon} />
            <Text style={styles.slideMenuItemText}>Policies</Text>
          </TouchableOpacity>

          {currentLocation && (
            <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#666' }}>
                Lat: {currentLocation.coords.latitude.toFixed(5)} Lng: {currentLocation.coords.longitude.toFixed(5)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => {
              Alert.alert(
                'Logout Confirmation',
                'Are you sure you want to logout? All tracking and monitoring will stop.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: () => {
                      onClose();
                      onLogout();
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
            accessible={true}
            accessibilityLabel="Logout"
            accessibilityRole="menuitem"
          >
            <MaterialIcons name="logout" size={22} color="#e74c3c" style={menuIconStyle.icon} />
            <Text style={[styles.slideMenuItemText, styles.slideMenuLogout]}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );

  // iOS: render as absolute overlay view (no Modal)
  if (Platform.OS === 'ios') {
    if (!iosMounted) return null;
    return content;
  }

  // Android: keep existing Modal behavior
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
};

export default SlideMenu;

const iosOverlayStyles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    // Ensure it is above the entire Home screen and any other non-call overlays.
    zIndex: 10000,
    elevation: 10000,
  },
});

const menuIconStyle = StyleSheet.create({
  icon: {
    marginRight: 14,
    width: 22,
  },
});
