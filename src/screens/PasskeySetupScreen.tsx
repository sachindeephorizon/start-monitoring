/**
 * PasskeySetupScreen Component
 * Appears only on first signup to set up a 4-digit emergency passkey
 * Uses same design as login page for consistency
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { skipPasskeySetup, updatePasskey } from '@/api/user';

interface PasskeySetupScreenProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const PasskeySetupScreen: React.FC<PasskeySetupScreenProps> = ({
  onComplete,
  onSkip,
}) => {
  const [passkey, setPasskey] = useState('');
  const [confirmPasskey, setConfirmPasskey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'confirm'>('setup');
  const [showPasskey, setShowPasskey] = useState(false);
  const [showConfirmPasskey, setShowConfirmPasskey] = useState(false);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Input refs for focus management
  const passkeyRef = useRef<TextInput>(null);
  const confirmPasskeyRef = useRef<TextInput>(null);

  useEffect(() => {
    // Animate in on mount
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    // Focus appropriate input when step changes
    if (step === 'setup') {
      setTimeout(() => passkeyRef.current?.focus(), 100);
    } else if (step === 'confirm') {
      setTimeout(() => confirmPasskeyRef.current?.focus(), 100);
    }
  }, [step]);

  const validatePasskey = (value: string): string | null => {
  if (!/^\d{4}$/.test(value)) {
    return 'Passkey must be exactly 4 digits';
  }

  // All digits same (0000, 1111, etc.)
  if (/^(\d)\1{3}$/.test(value)) {
    return 'Passkey cannot have all identical digits';
  }

  // Sequential increasing (1234, 2345, etc.)
  if ('0123456789'.includes(value)) {
    return 'Passkey cannot be sequential numbers';
  }

  // Sequential decreasing (4321, 5432, etc.)
  if ('9876543210'.includes(value)) {
    return 'Passkey cannot be reverse sequential numbers';
  }

  // Common weak patterns
  const weakPins = ['1212', '1122', '6969', '2580'];
  if (weakPins.includes(value)) {
    return 'Passkey is too easy to guess';
  }

  return null;
};

  const handleSetupNext = () => {
    const error = validatePasskey(passkey);
    if (error) {
      Alert.alert('Invalid Passkey', error);
      return;
    }

    setStep('confirm');
    setConfirmPasskey('');
  };

  const handleConfirmNext = async () => {
    if (passkey !== confirmPasskey) {
      Alert.alert('Passkey Mismatch', 'The passkeys do not match. Please try again.');
      setConfirmPasskey('');
      return;
    }

    try {
      setIsLoading(true);

      // Call API to save passkey
      const res = await updatePasskey(passkey);

      // Success
      Alert.alert(
        'Passkey Set Successfully',
        'Your emergency passkey has been set up. You can change it anytime in settings.',
        [{ text: 'Continue', onPress: onComplete }]
      );

    } catch (error) {
      console.error('Error setting up passkey:', error);
      Alert.alert(
        'Setup Failed',
        'Failed to set up your passkey. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      setStep('setup');
      setConfirmPasskey('');
    }
  };

  const handleSkip = async () => {
    Alert.alert(
      'Skip Passkey Setup',
      'You can set up your emergency passkey later in settings. Are you sure you want to skip?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Skip', 
          style: 'destructive',
          onPress: async () => {
            try {

              const res = await skipPasskeySetup();
              if (onSkip) {
                onSkip();
              } else {
                onComplete();
              }
            } catch (error) {
              console.error('Error updating skip status:', error);
              // Still proceed even if update fails
              if (onSkip) {
                onSkip();
              } else {
                onComplete();
              }
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.logoContainer}>
                <Text style={styles.logoText}>🔐</Text>
              </View>
              
              <Text style={styles.title}>
                {step === 'setup' ? 'Set Emergency Passkey' : 'Confirm Passkey'}
              </Text>
              
              <Text style={styles.subtitle}>
                {step === 'setup' 
                  ? 'Create a 4-digit passkey for emergency check-ins and security verification'
                  : 'Please re-enter your passkey to confirm'
                }
              </Text>
            </View>

            {/* Form Card */}
            <View style={styles.formContainer}>
              {step === 'setup' ? (
                // Setup Step
                <View>
                  <Text style={styles.inputLabel}>
                    Enter 4-Digit Passkey
                  </Text>
                  
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      ref={passkeyRef}
                      style={[styles.input, styles.passkeyInput]}
                      placeholder="••••"
                      placeholderTextColor="#bdc3c7"
                      value={passkey}
                      onChangeText={(text) => {
                        // Only allow 4 digits
                        const cleaned = text.replace(/[^0-9]/g, '').substring(0, 4);
                        setPasskey(cleaned);
                      }}
                      keyboardType="numeric"
                      secureTextEntry={!showPasskey}
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="none"
                      maxLength={4}
                      textAlign="center"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPasskey(!showPasskey)}
                      style={styles.passwordToggle}
                    >
                      <MaterialIcons 
                        name={showPasskey ? 'visibility-off' : 'visibility'} 
                        size={20} 
                        color="#666" 
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.infoContainer}>
                    <MaterialIcons name="info" size={16} color="#007AFF" />
                    <Text style={styles.infoText}>
                      • Use 4 unique digits{'\n'}
                      • Avoid obvious patterns (1234, 0000){'\n'}
                      • Remember this for emergency situations
                    </Text>
                  </View>
                </View>
              ) : (
                // Confirm Step
                <View>
                  <Text style={styles.inputLabel}>
                    Confirm Your Passkey
                  </Text>
                  
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock-outline" size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      ref={confirmPasskeyRef}
                      style={[styles.input, styles.passkeyInput]}
                      placeholder="••••"
                      placeholderTextColor="#bdc3c7"
                      value={confirmPasskey}
                      onChangeText={(text) => {
                        // Only allow 4 digits
                        const cleaned = text.replace(/[^0-9]/g, '').substring(0, 4);
                        setConfirmPasskey(cleaned);
                      }}
                      keyboardType="numeric"
                      secureTextEntry={!showConfirmPasskey}
                      autoCorrect={false}
                      autoComplete="off"
                      textContentType="none"
                      maxLength={4}
                      textAlign="center"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPasskey(!showConfirmPasskey)}
                      style={styles.passwordToggle}
                    >
                      <MaterialIcons 
                        name={showConfirmPasskey ? 'visibility-off' : 'visibility'} 
                        size={20} 
                        color="#666" 
                      />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.infoContainer}>
                    <MaterialIcons name="info" size={16} color="#007AFF" />
                    <Text style={styles.infoText}>
                      Re-enter the same 4-digit passkey to confirm
                    </Text>
                  </View>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.buttonRow}>
                {step === 'confirm' && (
                  <TouchableOpacity
                    style={[styles.button, styles.backButton]}
                    onPress={handleBack}
                    disabled={isLoading}
                  >
                    <Text style={styles.backButtonText}>
                      Back
                    </Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity
                  style={[
                    styles.button, 
                    styles.primaryButton,
                    step === 'confirm' && styles.buttonFlex,
                    (
                      (step === 'setup' && passkey.length !== 4) ||
                      (step === 'confirm' && confirmPasskey.length !== 4) ||
                      isLoading
                    ) && styles.buttonDisabled
                  ]}
                  onPress={step === 'setup' ? handleSetupNext : handleConfirmNext}
                  disabled={
                    isLoading || 
                    (step === 'setup' && passkey.length !== 4) ||
                    (step === 'confirm' && confirmPasskey.length !== 4)
                  }
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {step === 'setup' ? 'Next' : 'Complete Setup'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Skip Button */}
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={isLoading}
            >
              <Text style={styles.skipButtonText}>
                Skip for now
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff', // Alice Blue background matching AuthScreen
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#203b84',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  passkeyInput: {
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 8,
  },
  passwordToggle: {
    padding: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#007AFF',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFlex: {
    flex: 1,
  },
  backButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e1e5e9',
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  primaryButton: {
    backgroundColor: '#203b84',
    flex: 1,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  skipButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipButtonText: {
    fontSize: 16,
    color: '#203b84',
    fontWeight: '500',
  },
});

