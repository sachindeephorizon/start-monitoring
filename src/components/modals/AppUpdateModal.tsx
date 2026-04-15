import React, { useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';

const IOS_APP_STORE_ID = '6755099422';
const ANDROID_PACKAGE_NAME = 'com.deephorizon.security';

interface AppUpdateModalProps {
  visible: boolean;
  remoteVersion: string;
  isEssential: boolean;
  onDismiss: () => void;
}

const openStore = async () => {
  if (Platform.OS === 'ios') {
    const url = `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}`;
    const can = await Linking.canOpenURL(url);
    await Linking.openURL(
      can ? url : `https://apps.apple.com/app/id${IOS_APP_STORE_ID}`,
    );
    return;
  }
  const marketUrl = `market://details?id=${ANDROID_PACKAGE_NAME}`;
  const can = await Linking.canOpenURL(marketUrl);
  await Linking.openURL(
    can
      ? marketUrl
      : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`,
  );
};

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  visible,
  remoteVersion,
  isEssential,
  onDismiss,
}) => {
  const onUpdate = useCallback(() => {
    openStore().catch(() => {});
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isEssential ? () => {} : onDismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {isEssential ? 'Update Required' : 'Update Available'}
          </Text>
          <Text style={styles.body}>
            {isEssential
              ? `Please update to version ${remoteVersion} to continue.`
              : `Version ${remoteVersion} is now available.`}
          </Text>

          <TouchableOpacity style={styles.primary} onPress={onUpdate}>
            <Text style={styles.primaryText}>Update Now</Text>
          </TouchableOpacity>

          {!isEssential && (
            <TouchableOpacity style={styles.secondary} onPress={onDismiss}>
              <Text style={styles.secondaryText}>Later</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  body: {
    color: '#CCCCCC',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  primary: {
    backgroundColor: '#E11D48',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondary: {
    paddingVertical: 12,
    marginTop: 8,
    alignItems: 'center',
  },
  secondaryText: {
    color: '#AAAAAA',
    fontSize: 15,
    fontWeight: '500',
  },
});
