import React, { useRef, useEffect, useCallback } from 'react';
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

const SlideMenu: React.FC<SlideMenuProps> = ({
  visible,
  onClose,
  onLogout,
  navigation,
}) => {
  const slideAnim = useRef(new Animated.Value(280)).current;

  const { currentPlan, isFamilyPlan, subscription, isLoading } = useSubscription();

  const pendingNavigateRef = useRef<string | null>(null);
  const insets = useSafeAreaInsets();

  /**
   * ✅ Navigate AFTER menu closes
   */
  useEffect(() => {
    if (visible) return;

    const route = pendingNavigateRef.current;
    if (!route) return;

    pendingNavigateRef.current = null;

    const doNav = () => {
      try {
        navigation.navigate(route);
      } catch {}
    };

    if (Platform.OS === 'android') {
      const t = setTimeout(doNav, 60);
      return () => clearTimeout(t);
    }

    Promise.resolve().then(doNav);
  }, [visible, navigation]);

  const handleNavigate = useCallback(
    (route: string) => {
      pendingNavigateRef.current = route;
      onClose();
    },
    [onClose]
  );

  /**
   * ✅ Animation
   */
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 0 : 280,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  /**
   * ✅ Debug (optional)
   */
  useEffect(() => {
    if (visible && __DEV__) {
      console.log('[SlideMenu]', {
        plan: currentPlan?.name,
        type: currentPlan?.type,
        isFamilyPlan,
        hasSubscription: !!subscription,
        isLoading,
      });
    }
  }, [visible, currentPlan, subscription, isFamilyPlan, isLoading]);

  /**
   * ✅ CONTENT
   */
  const content = (
    <View
      style={[styles.slideMenuOverlay, overlayStyles.overlayRoot]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* BACKDROP */}
      <TouchableOpacity
        style={styles.slideMenuBackdrop}
        onPress={onClose}
        activeOpacity={1}
      />

      {/* MENU */}
      <Animated.View
        style={[
          styles.slideMenuContainer,
          { transform: [{ translateX: slideAnim }] },
        ]}
      >
        {/* HEADER */}
        <View style={[styles.slideMenuHeader, { paddingTop: insets.top + 20 }]}>
          <View style={styles.slideMenuLeft} />

          <View style={{ alignItems: 'center' }}>
            <Text style={styles.slideMenuTitle}>Menu</Text>
            {currentPlan && (
              <Text style={styles.planText}>{currentPlan.name}</Text>
            )}
          </View>

          <TouchableOpacity onPress={onClose} style={styles.slideMenuClose}>
            <MaterialIcons name="close" size={22} color="#2C3E50" />
          </TouchableOpacity>
        </View>

        {/* CONTENT */}
        <ScrollView style={styles.slideMenuContent}>
          {/* Profile */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Profile')}
          >
            <MaterialIcons name="person" size={22} color="#2C3E50" style={iconStyles.icon} />
            <Text style={styles.slideMenuItemText}>My Profile</Text>
          </TouchableOpacity>

          {/* Subscription */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Subscription')}
          >
            <MaterialIcons name="card-membership" size={22} color="#2C3E50" style={iconStyles.icon} />
            <View style={styles.subscriptionMenuItem}>
              <Text style={styles.slideMenuItemText}>Subscription</Text>
              {currentPlan && (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>
                    {currentPlan.name}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Family */}
          {!isLoading && isFamilyPlan && (
            <TouchableOpacity
              style={styles.slideMenuItem}
              onPress={() => handleNavigate('Family')}
            >
              <MaterialIcons name="family-restroom" size={22} color="#2C3E50" style={iconStyles.icon} />
              <Text style={styles.slideMenuItemText}>Family</Text>
            </TouchableOpacity>
          )}

          {/* Emergency Contacts */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('EmergencyContacts')}
          >
            <MaterialIcons name="contact-phone" size={22} color="#2C3E50" style={iconStyles.icon} />
            <Text style={styles.slideMenuItemText}>Emergency Contacts</Text>
          </TouchableOpacity>

          {/* History */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('History')}
          >
            <MaterialIcons name="history" size={22} color="#2C3E50" style={iconStyles.icon} />
            <Text style={styles.slideMenuItemText}>History</Text>
          </TouchableOpacity>

          {/* Policies */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => handleNavigate('Policies')}
          >
            <MaterialIcons name="policy" size={22} color="#2C3E50" style={iconStyles.icon} />
            <Text style={styles.slideMenuItemText}>Policies</Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={styles.slideMenuItem}
            onPress={() => {
              Alert.alert(
                'Logout Confirmation',
                'Are you sure you want to logout?',
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
          >
            <MaterialIcons name="logout" size={22} color="#e74c3c" style={iconStyles.icon} />
            <Text style={[styles.slideMenuItemText, styles.slideMenuLogout]}>
              Logout
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );

  /**
   * iOS: no Modal (prevents touch freeze bug)
   */
  if (Platform.OS === 'ios') {
    if (!visible) return null;
    return content;
  }

  /**
   * Android: use Modal
   */
  return (
    <Modal visible={visible} transparent animationType="fade">
      {content}
    </Modal>
  );
};

export default SlideMenu;

/**
 * Styles
 */
const overlayStyles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
});

const iconStyles = StyleSheet.create({
  icon: {
    marginRight: 14,
    width: 22,
  },
});