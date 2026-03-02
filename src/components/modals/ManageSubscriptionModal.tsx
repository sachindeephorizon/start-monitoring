import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SubscriptionService } from '@/services/subscription.service';
import type { SubscriptionPlan } from '@/services/subscription.service';

interface ManageSubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  currentPlanId: string;
  currentAutoRenew: boolean;
  onCancelSuccess: () => void;
  onChangePlan: () => void;
}

export const ManageSubscriptionModal: React.FC<ManageSubscriptionModalProps> = ({
  visible,
  onClose,
  currentPlanId,
  currentAutoRenew,
  onCancelSuccess,
  onChangePlan,
}) => {
  const [loading, setLoading] = useState(false);

  const openAppleSubscriptionManagement = async () => {
    // Apple subscription state (cancel/reactivate) must be managed in the App Store.
    const urlPrimary = 'itms-apps://apps.apple.com/account/subscriptions';
    const urlFallback = 'https://apps.apple.com/account/subscriptions';
    try {
      const canOpenPrimary = await Linking.canOpenURL(urlPrimary);
      await Linking.openURL(canOpenPrimary ? urlPrimary : urlFallback);
    } catch {
      await Linking.openURL(urlFallback);
    }
  };

  const handleCancelSubscription = () => {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Manage Subscription in App Store',
        'On iPhone, cancelling or reactivating a subscription is handled by Apple. We’ll open your App Store subscription settings.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open App Store',
            onPress: async () => {
              await openAppleSubscriptionManagement();
              onClose();
              onCancelSuccess();
            },
          },
        ]
      );
      return;
    }
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? Your subscription will remain active until the end of the current billing period, but it will not auto-renew.',
      [
        {
          text: 'Keep Subscription',
          style: 'cancel',
        },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await SubscriptionService.cancelSubscription();
              if (result.success) {
                Alert.alert(
                  'Subscription Cancelled',
                  'Your subscription has been cancelled. You will continue to have access until the end of your current billing period.',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        onCancelSuccess();
                        onClose();
                      },
                    },
                  ]
                );
              } else {
                Alert.alert('Error', result.error || 'Failed to cancel subscription');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel subscription');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleReactivateSubscription = () => {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Reactivate in App Store',
        'To turn auto-renewal back on, please reactivate your subscription in the App Store.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open App Store',
            onPress: async () => {
              await openAppleSubscriptionManagement();
              onClose();
              onCancelSuccess();
            },
          },
        ]
      );
      return;
    }

    // Android: reactivation depends on payment provider; send to plan selection.
    onClose();
    onChangePlan();
  };

  const handleChangePlan = () => {
    onClose();
    onChangePlan();
  };

  const currentPlan = SubscriptionService.getPlan(currentPlanId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Manage Subscription</Text>
            <TouchableOpacity onPress={onClose} disabled={loading}>
              <MaterialIcons name="close" size={24} color="#7f8c8d" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {currentPlan && (
              <View style={styles.currentPlanSection}>
                <Text style={styles.sectionTitle}>Current Plan</Text>
                <View style={styles.planInfoCard}>
                  <Text style={styles.planName}>{currentPlan.name}</Text>
                  <Text style={styles.planPrice}>
                    ₹{currentPlan.price}/{currentPlan.billing_cycle === 'monthly' ? 'month' : 'year'}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.optionsSection}>
              <TouchableOpacity
                style={styles.optionButton}
                onPress={handleChangePlan}
                disabled={loading}
              >
                <MaterialIcons name="swap-horiz" size={24} color="#4BA8FF" />
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Change Plan</Text>
                  <Text style={styles.optionDescription}>
                    Switch to a different subscription plan
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#bdc3c7" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionButton, styles.cancelOptionButton]}
                onPress={handleCancelSubscription}
                disabled={loading}
              >
                <MaterialIcons name="cancel" size={24} color="#e74c3c" />
                <View style={styles.optionContent}>
                  <Text style={[styles.optionTitle, styles.cancelOptionTitle]}>
                    {Platform.OS === 'ios' ? 'Manage Auto‑Renewal (App Store)' : 'Cancel Subscription'}
                  </Text>
                  <Text style={styles.optionDescription}>
                    {Platform.OS === 'ios'
                      ? 'Open the App Store to cancel or reactivate your subscription.'
                      : 'Cancel auto-renewal. Access continues until the end of your billing period.'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#bdc3c7" />
              </TouchableOpacity>

              {!currentAutoRenew && (
                <TouchableOpacity
                  style={[styles.optionButton, styles.reactivateOptionButton]}
                  onPress={handleReactivateSubscription}
                  disabled={loading}
                >
                  <MaterialIcons name="autorenew" size={24} color="#16a34a" />
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionTitle, styles.reactivateOptionTitle]}>
                      {Platform.OS === 'ios' ? 'Reactivate Subscription (App Store)' : 'Reactivate Subscription'}
                    </Text>
                    <Text style={styles.optionDescription}>
                      {Platform.OS === 'ios'
                        ? 'Turn auto-renewal back on in the App Store.'
                        : 'Reactivate your subscription by selecting a plan.'}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color="#bdc3c7" />
                </TouchableOpacity>
              )}
            </View>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#4BA8FF" />
                <Text style={styles.loadingText}>Processing...</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  currentPlanSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  planInfoCard: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 16,
    color: '#4BA8FF',
    fontWeight: '500',
  },
  optionsSection: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cancelOptionButton: {
    borderColor: '#fee2e2',
    backgroundColor: '#fef2f2',
  },
  reactivateOptionButton: {
    borderColor: '#dcfce7',
    backgroundColor: '#f0fdf4',
  },
  optionContent: {
    flex: 1,
    marginLeft: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  cancelOptionTitle: {
    color: '#e74c3c',
  },
  reactivateOptionTitle: {
    color: '#16a34a',
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

