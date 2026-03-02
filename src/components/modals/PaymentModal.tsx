import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import type { SubscriptionPlan } from '@/services/subscription.service';

interface PaymentModalProps {
  visible: boolean;
  plan: SubscriptionPlan | null;
  paymentUrl: string | null;
  onClose: () => void;
  onPaymentSuccess?: () => void;
  onPaymentFailure?: (error: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  visible,
  plan,
  paymentUrl,
  onClose,
  onPaymentSuccess,
  onPaymentFailure,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const webViewRef = useRef<WebView>(null);

  const handleNavigationStateChange = (navState: any) => {
    const { url } = navState;

    // Check for success/failure indicators in URL
    try {
      if (url.includes('payment=success') || url.includes('payment-success')) {
        if (onPaymentSuccess) {
          onPaymentSuccess();
        }
        handleClose();
      } else if (url.includes('payment=failed') || url.includes('payment-failed')) {
        try {
          const urlObj = new URL(url);
          const reason = urlObj.searchParams.get('reason') || 'Payment failed';
          if (onPaymentFailure) {
            onPaymentFailure(reason);
          }
        } catch (e) {
          // If URL parsing fails, use default error message
          if (onPaymentFailure) {
            onPaymentFailure('Payment failed');
          }
        }
        handleClose();
      }
    } catch (error) {
      // URL parsing failed, continue normally
      console.log('Error parsing URL:', error);
    }
  };

  const handleClose = () => {
    setLoading(true);
    setError(null);
    onClose();
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('WebView error:', nativeEvent);
    setError(nativeEvent.description || 'Failed to load payment gateway');
    setLoading(false);
  };

  const handleLoadEnd = () => {
    setLoading(false);
  };

  if (!plan) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Complete Payment</Text>
            <Text style={styles.headerSubtitle}>{plan.name}</Text>
          </View>
          <View style={styles.placeholder} />
        </View>

        {/* Loading Indicator */}
        {loading && !error && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4BA8FF" />
            <Text style={styles.loadingText}>Loading payment gateway...</Text>
          </View>
        )}

        {/* Error State */}
        {error && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#e74c3c" />
            <Text style={styles.errorTitle}>Payment Error</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleClose}>
              <Text style={styles.retryButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* WebView */}
        {paymentUrl && !error && (
          <WebView
            ref={webViewRef}
            source={{ uri: paymentUrl }}
            style={styles.webView}
            onNavigationStateChange={handleNavigationStateChange}
            onError={handleError}
            onLoadEnd={handleLoadEnd}
            onLoadStart={() => setLoading(true)}
            onMessage={(event) => {
              // Handle messages from WebView (for payment callbacks)
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'payment-success') {
                  // Handle new user account creation
                  if (data.isNewUser) {
                    // User account was created - they'll need to set password via email
                    // For now, just show success
                  }
                  if (onPaymentSuccess) {
                    onPaymentSuccess();
                  }
                  handleClose();
                } else if (data.type === 'payment-failed') {
                  if (onPaymentFailure) {
                    onPaymentFailure(data.reason || 'Payment failed');
                  }
                  handleClose();
                }
              } catch (e) {
                // Not a JSON message, ignore
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            mixedContentMode="always"
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  closeButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#ffffff',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
});

