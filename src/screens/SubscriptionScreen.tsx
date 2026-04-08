import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { Buffer } from 'buffer';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '@/hooks/useSubscription';
import { SubscriptionService } from '@/features/subscription/subscription.service';
import { useCurrentUser } from '@/core/auth';
import { downloadLatestInvoice } from '@/api/userSubscription';

const isPdfBytes = (bytes: Uint8Array): boolean => {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
};

interface SubscriptionScreenProps {
  navigation: any;
}

const SubscriptionScreen: React.FC<SubscriptionScreenProps> = ({ navigation }) => {
  const user = useCurrentUser();
  const {
    subscription,
    currentPlan,
    isLoading,
    error,
    refresh
  } = useSubscription();

  const [trialStatus, setTrialStatus] = useState<{
    isTrialActive: boolean;
    trialEndDate: Date | null;
    daysRemaining: number;
  } | null>(null);
  const [trialLoading, setTrialLoading] = useState(true);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // iOS-specific error handling
  useEffect(() => {
    if (error && Platform.OS === 'ios') {
      console.log('Subscription error on iOS:', error);
      // Don't show alert, just log for debugging
    }
  }, [error]);

  // iOS-specific navigation focus handling
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const unsubscribe = navigation.addListener('focus', () => {
        // 🔥 CRITICAL iOS FIX: NO setTimeout - refresh immediately
        // setTimeout can cause iOS JS thread suspension
        if (refresh) {
          refresh(); // Run immediately on iOS
        }
      });

      return unsubscribe;
    }
  }, [navigation, refresh]);

  /**
   * ✅ UX FIX: Removed auto-navigation to SubscriptionPlans
   *
   * OLD BEHAVIOR: When user had no subscription, automatically navigated to SubscriptionPlans screen
   * NEW BEHAVIOR: Show "No active subscription" status with trial info and a button to browse plans
   *
   * This gives users visibility into their subscription status rather than immediately
   * forcing them into the purchase flow.
   */
  // Auto-navigation removed - now showing proper "No subscription" UI below

  // Load trial status when subscription loading completes
  // Note: hasAccess can be true for trial users, so we check !subscription only
  useEffect(() => {
    // Don't load trial status while subscription is still loading
    if (isLoading) {
      return;
    }

    const loadTrialStatus = async () => {
      // Load trial status if user has no subscription (regardless of hasAccess)
      if (!subscription) {
        // Only show loading if we haven't loaded trial status yet
        if (trialStatus === null) {
          setTrialLoading(true);
        }
        try {
          const status = await SubscriptionService.getTrialStatus();
          console.log('Trial status loaded:', {
            isTrialActive: status.isTrialActive,
            daysRemaining: status.daysRemaining,
            trialEndDate: status.trialEndDate
          });
          setTrialStatus({
            isTrialActive: status.isTrialActive,
            trialEndDate: status.trialEndDate,
            daysRemaining: status.daysRemaining,
          });
        } catch (error) {
          console.error('Error loading trial status:', error);
          setTrialStatus(null);
        } finally {
          setTrialLoading(false);
        }
      } else {
        // User has subscription, no trial
        setTrialStatus(null);
        setTrialLoading(false);
      }
    };

    loadTrialStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscription, isLoading]); // Only depend on subscription and isLoading

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysRemaining = (endDate: Date | string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleContactSupport = async () => {
    const supportEmail = 'support@deephorizon.io';
    const userEmail = user?.email || '';
    const planName = currentPlan?.name || 'Unknown Plan';
    const subject = encodeURIComponent('Subscription Support Request');
    const body = encodeURIComponent(
      `Hello DeepHorizon Support Team,\n\n` +
      `I need assistance with my subscription.\n\n` +
      `User Email: ${userEmail}\n` +
      `Current Plan: ${planName}\n` +
      `Subscription Status: ${subscription?.status || 'Unknown'}\n\n` +
      `Please describe your issue below:\n\n`
    );

    const mailtoUrl = `mailto:${supportEmail}?subject=${subject}&body=${body}`;

    try {
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Not Available',
          'Please contact us at support@deephorizon.io',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening email:', error);
      Alert.alert(
        'Error',
        'Unable to open email app. Please contact us at support@deephorizon.io',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDownloadInvoice = async () => {
    if (invoiceLoading) return;

    setInvoiceLoading(true);
    try {
      const { arrayBuffer, filename, contentType } = await downloadLatestInvoice();
      const bytes = new Uint8Array(arrayBuffer);
      console.log('[InvoiceDownload] API download complete', {
        filename,
        byteLength: bytes?.length ?? 0,
        isPdfSignature: isPdfBytes(bytes),
        contentType: contentType || 'application/pdf',
      });

      let opened = false;
      let savedPath = '';
      try {
        const fsLegacyModule = await import('expo-file-system/legacy');
        const FileSystemLegacy: any = (fsLegacyModule as any).default || (fsLegacyModule as any);
        const baseDir =
          FileSystemLegacy.cacheDirectory ||
          FileSystemLegacy.documentDirectory ||
          '';
        if (baseDir) {
          const safeName = filename && filename.toLowerCase().endsWith('.pdf') ? filename : 'latest-invoice.pdf';
          const fileUri = `${baseDir}${safeName}`;
          savedPath = fileUri;
          const base64Data = Buffer.from(arrayBuffer).toString('base64');

          console.log('[InvoiceDownload] Preparing to write file', {
            baseDir,
            safeName,
            fileUri,
            base64Length: base64Data.length,
          });

          await FileSystemLegacy.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystemLegacy.EncodingType?.Base64 || 'base64',
          });

          try {
            const info = await FileSystemLegacy.getInfoAsync(fileUri, { size: true });
            console.log('[InvoiceDownload] File write result', info);
          } catch (infoErr) {
            console.warn('[InvoiceDownload] Could not read file info after write', infoErr);
          }

          if (!opened) {
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
              console.log('[InvoiceDownload] Opening expo-sharing', { fileUri });
              await Sharing.shareAsync(fileUri, {
                mimeType: contentType || 'application/pdf',
                dialogTitle: 'Download Invoice',
                UTI: 'com.adobe.pdf',
              });
              opened = true;
              console.log('[InvoiceDownload] expo-sharing opened');
            }
          }
        } else {
          console.warn('[InvoiceDownload] No writable base directory found in expo-file-system');
        }
      } catch (fileErr) {
        console.warn('[InvoiceDownload] File save/open stage failed', fileErr);
        // Will show manual fallback below.
      }

      if (!opened) {
        if (savedPath) {
          try {
            const fsLegacyModule = await import('expo-file-system/legacy');
            const FileSystemLegacy: any = (fsLegacyModule as any).default || (fsLegacyModule as any);
            if (typeof FileSystemLegacy.getContentUriAsync === 'function') {
              const contentUri = await FileSystemLegacy.getContentUriAsync(savedPath);
              console.log('[InvoiceDownload] Attempting open via content URI fallback', { contentUri });
              await Linking.openURL(contentUri);
              opened = true;
            }
          } catch (fallbackErr) {
            // Keep alert fallback below.
            console.warn('[InvoiceDownload] Content URI fallback failed', fallbackErr);
          }
        }

        if (!opened) {
          Alert.alert(
            'Invoice Downloaded',
            savedPath
              ? `The invoice was downloaded to:\n${savedPath}\n\nPlease open it from your Files app if it did not open automatically.`
              : 'The invoice was downloaded, but could not be opened automatically. Please try again.'
          );
        }
      }
    } catch (error: any) {
      console.error('Failed to download latest invoice:', error);
      Alert.alert(
        'Download Failed',
        error?.message || 'Unable to download invoice right now. Please try again.'
      );
    } finally {
      setInvoiceLoading(false);
    }
  };

  // Show loading only if subscription is loading
  // Trial status loading happens after subscription loads, so it won't cause a second loading screen
  const isInitialLoading = isLoading;

  if (isInitialLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.header, { paddingTop: 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator 
            size={Platform.OS === 'ios' ? 'large' : 'large'} 
            color="#3498db" 
          />
          <Text style={styles.loadingText}>
            Loading subscription details...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // If we have an error and no subscription data, show error UI with retry instead of infinite spinner
  if (error && !subscription && !currentPlan) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.header, { paddingTop: 10 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <TouchableOpacity onPress={refresh} style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={24} color="#4BA8FF" />
          </TouchableOpacity>
        </View>

        <View style={styles.loadingContainer}>
          <MaterialIcons name="cloud-off" size={48} color="#e74c3c" />
          <Text style={[styles.loadingText, { color: '#e74c3c' }]}>
            {error === 'timeout' ? 'Loading is taking longer than expected...' : 'Could not load subscription details'}
          </Text>
          <TouchableOpacity
            onPress={refresh}
            style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 24, backgroundColor: '#3498db', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /**
   * ✅ UX FIX: Show "No active subscription" view
   *
   * Display subscription status, trial information, and option to browse plans.
   * User can see their trial days remaining and choose to subscribe when ready.
   */
  if (!subscription || !currentPlan) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription</Text>
          <TouchableOpacity onPress={refresh} style={styles.refreshButton}>
            <MaterialIcons name="refresh" size={24} color="#4BA8FF" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={Platform.OS === 'android' ? styles.scrollContent : { padding: 20 }}
        >
          {/* Trial Status Banner */}
          {trialLoading ? (
            <View style={styles.trialBanner}>
              <ActivityIndicator size="small" color="#4BA8FF" />
              <Text style={[styles.trialBannerText, { marginLeft: 12 }]}>Loading trial status...</Text>
            </View>
          ) : trialStatus && trialStatus.isTrialActive ? (
            <View style={styles.trialBanner}>
              <View style={styles.trialBannerContent}>
                <MaterialIcons name="access-time" size={32} color="#4BA8FF" />
                <View style={styles.trialBannerTextContainer}>
                  <Text style={styles.trialBannerTitle}>
                    {trialStatus.daysRemaining} Day{trialStatus.daysRemaining !== 1 ? 's' : ''} Remaining
                  </Text>
                  <Text style={styles.trialBannerSubtext}>
                    Your 7-day free trial is active
                  </Text>
                </View>
              </View>
            </View>
          ) : trialStatus && !trialStatus.isTrialActive ? (
            <View style={[styles.trialBanner, styles.trialBannerExpired]}>
              <View style={styles.trialBannerContent}>
                <MaterialIcons name="warning" size={32} color="#e74c3c" />
                <View style={styles.trialBannerTextContainer}>
                  <Text style={[styles.trialBannerTitle, { color: '#c53030' }]}>
                    Trial Ended
                  </Text>
                  <Text style={[styles.trialBannerSubtext, { color: '#c53030', opacity: 0.9 }]}>
                    Subscribe to continue using all features
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* No Subscription Card */}
          <View style={styles.noSubscriptionContainer}>
            <MaterialIcons name="lock-outline" size={64} color="#bdc3c7" />
            <Text style={styles.noSubscriptionTitle}>No Active Subscription</Text>
            <Text style={styles.noSubscriptionText}>
              {trialStatus?.isTrialActive
                ? `You have ${trialStatus.daysRemaining} day${trialStatus.daysRemaining !== 1 ? 's' : ''} left in your free trial. Browse our plans to subscribe and unlock unlimited access.`
                : 'Subscribe to a plan to access all features including 24/7 emergency support, location tracking, video monitoring, and more.'}
            </Text>

            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => navigation.navigate('SubscriptionPlans')}
            >
              <Text style={styles.subscribeButtonText}>Browse Plans</Text>
            </TouchableOpacity>
          </View>

          {/* Features List */}
          <View style={styles.familySection}>
            <Text style={styles.sectionTitle}>Premium Features</Text>
            <View style={{ marginTop: 16 }}>
              {[
                '24/7 Emergency Support',
                'Real-time Location Tracking',
                'Video Call Sessions with Agents',
                'Schedule Security Check-ins',
                'Family Plan Options (up to 5 members)',
                'Instant Emergency Alerts',
              ].map((feature, index) => (
                <View key={index} style={styles.feature}>
                  <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Support Section */}
          <View style={styles.supportSection}>
            <Text style={styles.supportTitle}>Need Help?</Text>
            <Text style={styles.supportText}>
              Contact our support team for any subscription-related queries.
            </Text>
            <TouchableOpacity
              style={styles.supportButton}
              onPress={handleContactSupport}
              activeOpacity={0.7}
            >
              <MaterialIcons name="support-agent" size={20} color="#4BA8FF" />
              <Text style={styles.supportButtonText}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const daysRemaining = getDaysRemaining(subscription.currentPeriodEnd);
  const planFeatures = Object.entries(currentPlan.features || {})
    .filter(([, value]) => value !== false && value !== null && typeof value !== 'undefined')
    .map(([key, value]) => {
      const label = key
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (value === true) return label;
      return `${label}: ${String(value)}`;
    });

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription</Text>
        <TouchableOpacity onPress={refresh} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={24} color="#4BA8FF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        // Android: ensure content can scroll smoothly and has padding/bottom space.
        // iOS: keep existing layout unchanged per requirement.
        contentContainerStyle={Platform.OS === 'android' ? styles.scrollContent : undefined}
        nestedScrollEnabled={Platform.OS === 'android'}
        keyboardShouldPersistTaps={Platform.OS === 'android' ? 'handled' : undefined}
      >
        {/* Current Plan Card */}
        <View style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>ACTIVE PLAN</Text>
            </View>
          </View>
          
          <View style={styles.planContent}>
            <Text style={styles.planName}>{currentPlan.name}</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.currency}>₹</Text>
              <Text style={styles.price}>{currentPlan.price}</Text>
              <Text style={styles.period}>/{currentPlan.frequency === 'MONTHLY' ? 'month' : 'year'}</Text>
            </View>
            
            <View style={styles.featuresContainer}>
              {planFeatures.map((feature, index) => (
                <View key={index} style={styles.feature}>
                  <MaterialIcons name="check-circle" size={20} color="#4BA8FF" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <View style={styles.renewalInfo}>
              <Text style={styles.renewalText}>
                {daysRemaining > 0 ? `Valid for ${daysRemaining} more day${daysRemaining === 1 ? '' : 's'}` : 'Expired'}
              </Text>
              <Text style={styles.renewalSubtext}>
                Subscription status: {subscription.status}
              </Text>
              <Text style={styles.renewalSubtext}>
                Current period ends: {formatDate(String(subscription.currentPeriodEnd))}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('SubscriptionPlans')}
          >
            <Text style={styles.primaryButtonText}>Change Plan</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.secondaryButton, invoiceLoading && styles.disabledButton]}
            onPress={handleDownloadInvoice}
            disabled={invoiceLoading}
          >
            {invoiceLoading ? (
              <ActivityIndicator size="small" color="#4BA8FF" />
            ) : (
              <Text style={styles.secondaryButtonText}>Download Invoice</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Support Section */}
        <View style={styles.supportSection}>
          <Text style={styles.supportTitle}>Need Help?</Text>
          <Text style={styles.supportText}>
            Contact our support team for any subscription-related queries.
          </Text>
          <TouchableOpacity 
            style={styles.supportButton}
            onPress={handleContactSupport}
            activeOpacity={0.7}
          >
            <MaterialIcons name="support-agent" size={20} color="#4BA8FF" />
            <Text style={styles.supportButtonText}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  refreshButton: {
    padding: 8,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#7f8c8d',
  },
  noSubscriptionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  noSubscriptionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginTop: 16,
    marginBottom: 8,
  },
  noSubscriptionText: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  subscribeButton: {
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  subscribeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  planCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginBottom: 24,
  },
  planHeader: {
    backgroundColor: '#4BA8FF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  planBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  planBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
  },
  planContent: {
    padding: 24,
  },
  planName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 32,
  },
  currency: {
    fontSize: 24,
    fontWeight: '600',
    color: '#4BA8FF',
  },
  price: {
    fontSize: 48,
    fontWeight: '700',
    color: '#4BA8FF',
    marginHorizontal: 4,
  },
  period: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '500',
  },
  featuresContainer: {
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 12,
    fontWeight: '500',
  },
  renewalInfo: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  renewalText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  renewalSubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  familySection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  addMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  addMemberButtonText: {
    color: '#4BA8FF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyFamilyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyFamilyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyFamilySubtext: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  memberCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 8,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  memberPhone: {
    fontSize: 14,
    color: '#4BA8FF',
    fontWeight: '500',
  },
  memberEmail: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  removeMemberButton: {
    padding: 8,
  },
  actionButtons: {
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#4BA8FF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4BA8FF',
  },
  secondaryButtonText: {
    color: '#4BA8FF',
    fontSize: 16,
    fontWeight: '600',
  },
  supportSection: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  supportTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  supportText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  supportButtonText: {
    color: '#4BA8FF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  modalBody: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '500',
  },
  addButton: {
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  // New styles for no subscription view
  trialBanner: {
    backgroundColor: '#e3f2fd',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4BA8FF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  trialBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trialBannerTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  trialBannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1565c0',
    marginBottom: 4,
  },
  trialBannerSubtext: {
    fontSize: 14,
    color: '#1976d2',
    opacity: 0.8,
  },
  trialBannerExpired: {
    backgroundColor: '#fee2e2',
    borderLeftColor: '#e74c3c',
  },
  trialBannerText: {
    fontSize: 14,
    color: '#1565c0',
    marginLeft: 8,
    flex: 1,
  },
  trialBannerTextExpired: {
    color: '#c53030',
  },
  plansSectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  planCardNoSubscription: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  planHeaderNoSubscription: {
    marginBottom: 16,
    alignItems: 'center',
  },
  planNameNoSubscription: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  priceContainerNoSubscription: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
  },
  currencyNoSubscription: {
    fontSize: 18,
    color: '#4BA8FF',
    fontWeight: '600',
    marginRight: 2,
  },
  priceNoSubscription: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  periodNoSubscription: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  savingsBadgeNoSubscription: {
    marginTop: 8,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  savingsTextNoSubscription: {
    color: '#2e7d32',
    fontSize: 12,
    fontWeight: '600',
  },
  featuresContainerNoSubscription: {
    marginBottom: 20,
  },
  featureRowNoSubscription: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTextNoSubscription: {
    fontSize: 15,
    color: '#4a5568',
    marginLeft: 12,
    flex: 1,
  },
  subscribeButtonNoSubscription: {
    backgroundColor: '#4BA8FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  subscribeButtonTextNoSubscription: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryOutlineButton: {
    width: '100%',
    maxWidth: 420,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4BA8FF',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  secondaryOutlineButtonText: {
    color: '#4BA8FF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  infoCard: {
    width: '100%',
    maxWidth: 420,
    marginTop: 14,
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoCardText: {
    flex: 1,
    color: '#1565c0',
    fontSize: 13,
    lineHeight: 18,
  },
});

export default SubscriptionScreen;
