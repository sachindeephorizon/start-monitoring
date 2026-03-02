import React from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { styles } from './ServiceModal.styles';

interface ServiceModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  onShow?: () => void;
}

const ServiceModal: React.FC<ServiceModalProps> = React.memo(({ visible, onClose, title, children, onShow }) => {
  const insets = useSafeAreaInsets();
  
  // 🔥 PRODUCTION OPTIMIZATION: Keep modal mounted, hide with style
  // This prevents Hermes GC from rehydrating code paths on every toggle
  // Prevents teardown/reinit which causes lag in production builds
  return (
  <Modal
      animationType="none"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}
      hardwareAccelerated={true}
      statusBarTranslucent={true}
      // 🔥 iOS FIX: Proper presentation style to prevent modal stacking issues
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onShow={onShow}
  >
      <SafeAreaView 
        style={[
          styles.modalOverlay,
          { 
            display: visible ? 'flex' : 'none',
            paddingTop: Math.max(insets.top, 12),
            paddingBottom: Math.max(insets.bottom, 12),
          }
        ]} 
        edges={['top', 'bottom']}
        collapsable={false} 
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View 
            style={[
              styles.modalContent,
            ]} 
            collapsable={false}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={() => {
                Keyboard.dismiss();
                onClose();
              }} style={styles.closeButton}>
                <MaterialIcons name="close" size={24} color="#7f8c8d" />
              </TouchableOpacity>
            </View>
            <ScrollView 
              style={styles.modalBody}
              contentContainerStyle={[
                styles.modalBodyContent,
                { paddingBottom: Math.max(insets.bottom + 20, 40) }
              ]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
              nestedScrollEnabled={true}
              keyboardDismissMode="interactive"
              bounces={Platform.OS === 'ios'}
              automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
  </Modal>
);
});

ServiceModal.displayName = 'ServiceModal';

export default ServiceModal;
