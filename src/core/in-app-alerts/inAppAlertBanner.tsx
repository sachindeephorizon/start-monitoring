import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { navigate } from '@/navigation/navigationRef';
import { hideAlert, useCurrentInAppAlert } from './inAppAlert.store';

export default function InAppAlertBanner() {
  const insets = useSafeAreaInsets();
  const alert = useCurrentInAppAlert();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!alert) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.08,
          duration: 550,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
      pulse.setValue(1);
    };
  }, [alert, pulse]);

  useEffect(() => {
    if (!alert) return;

    const timeout = setTimeout(() => {
      hideAlert(alert.id);
    }, alert.autoDismissMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [alert]);

  const handlePress = useCallback(() => {
    if (!alert) return;

    hideAlert(alert.id);

    if (alert.kind === 'chat') {
      navigate('Main', {
        screen: 'Chat',
        params: alert.threadId ? { threadId: alert.threadId } : undefined,
      });
      return;
    }

    navigate('Main', {
      screen: 'VideoMonitor',
      params: alert.callId ? { callId: alert.callId, autoStart: true } : { autoStart: true },
    });
  }, [alert]);

  const handlePickupVideo = useCallback(() => {
    if (!alert) return;
    hideAlert(alert.id);
    navigate('Main', {
      screen: 'VideoMonitor',
      params: alert.callId ? { callId: alert.callId, autoStart: true } : { autoStart: true },
    });
  }, [alert]);

  const handlePickupAudio = useCallback(() => {
    if (!alert) return;
    hideAlert(alert.id);
    navigate('Main', {
      screen: 'AudioCall',
      params: alert.callId ? { callId: alert.callId } : undefined,
    });
  }, [alert]);

  const handleDismiss = useCallback(() => {
    if (!alert) return;
    hideAlert(alert.id);
  }, [alert]);

  if (!alert) {
    return null;
  }

  const title = alert.title?.trim() || '';
  const avatarText = title ? title.slice(0, 1).toUpperCase() : 'A';

  const iconName: keyof typeof MaterialIcons.glyphMap = alert.kind === 'chat' ? 'message' : 'ring-volume';
  const iconTint = alert.kind === 'chat' ? '#63D2FF' : '#FFD166';

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={[styles.container, { top: insets.top + 8 }]}>
        <View style={styles.banner}>
          <View style={styles.leftWrap}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarText}>{avatarText}</Text>
              <Animated.View style={[styles.iconBadge, { transform: [{ scale: pulse }] }]}>
                <MaterialIcons name={iconName} size={13} color={iconTint} />
              </Animated.View>
            </View>

            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.textWrap}
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={`${alert.title}. ${alert.body}`}
            >
              <Text numberOfLines={1} style={styles.title}>{alert.title}</Text>
              <Text numberOfLines={2} style={styles.body}>{alert.body}</Text>
            </TouchableOpacity>
          </View>

          {alert.kind === 'call' ? (
            <View style={styles.callActions}>
              <TouchableOpacity
                style={[styles.callActionButton, styles.pickupButton]}
                onPress={handlePickupVideo}
                accessibilityRole="button"
                accessibilityLabel="Pick up video call"
              >
                <MaterialIcons name="videocam" size={16} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callActionButton, styles.pickupButton]}
                onPress={handlePickupAudio}
                accessibilityRole="button"
                accessibilityLabel="Pick up audio call"
              >
                <MaterialIcons name="phone" size={16} color="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.callActionButton, styles.rejectButton]}
                onPress={handleDismiss}
                accessibilityRole="button"
                accessibilityLabel="Decline call"
              >
                <MaterialIcons name="call-end" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleDismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Dismiss alert"
            >
              <MaterialIcons name="close" size={18} color="#BBC6D4" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 12,
    right: 12,
    position: 'absolute',
    zIndex: 10000,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: '#111826',
    borderColor: '#2D3A50',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 9,
  },
  leftWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    marginRight: 10,
  },
  avatarWrap: {
    alignItems: 'center',
    backgroundColor: '#1C2739',
    borderColor: '#3B4A61',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginRight: 10,
    width: 44,
  },
  avatarText: {
    color: '#F6FAFF',
    fontSize: 15,
    fontWeight: '700',
  },
  iconBadge: {
    alignItems: 'center',
    backgroundColor: '#0D1220',
    borderColor: '#324057',
    borderRadius: 9,
    borderWidth: 1,
    bottom: -3,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: -3,
    width: 18,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: '#F2F7FF',
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    color: '#AAB9CC',
    fontSize: 13,
    marginTop: 2,
  },
  callActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  callActionButton: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  pickupButton: {
    backgroundColor: '#16A34A',
  },
  rejectButton: {
    backgroundColor: '#DC2626',
  },
});
