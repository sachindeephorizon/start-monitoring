import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase, ensureValidSession } from '@/lib/supabase';

interface PasskeyChangeModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const PasskeyChangeModal: React.FC<PasskeyChangeModalProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  const [newPasskey, setNewPasskey] = useState('');
  const [confirmPasskey, setConfirmPasskey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const newPasskeyInputRef = useRef<TextInput>(null);
  const confirmPasskeyInputRef = useRef<TextInput>(null);

  const resetForm = () => {
    setNewPasskey('');
    setConfirmPasskey('');
    setError('');
  };

  const handleClose = () => {
    Keyboard.dismiss();
    resetForm();
    onClose();
  };

  const validatePasskey = (passkey: string): boolean => {
    return /^\d{4}$/.test(passkey);
  };

  const handleSubmit = async () => {
    setError('');

    // Validate new passkey format
    if (!validatePasskey(newPasskey)) {
      setError('Passkey must be 4 digits');
      return;
    }

    // Check if new passkey matches confirmation
    if (newPasskey !== confirmPasskey) {
      setError('Passkey and confirmation do not match');
      return;
    }

    try {
      setIsLoading(true);

      // Get current user
      const authSession = await ensureValidSession();
      const user = authSession?.user;
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Update to new passkey using bcrypt RPC function
      // This ensures consistent encryption/decryption across the app
      const { error: updateError } = await supabase.rpc('update_mobile_user_passkey_bcrypt', {
        user_id: user.id,
        plain_passkey: newPasskey
      });

      if (updateError) {
        console.error('Passkey update error:', updateError);
        throw new Error('Failed to update passkey');
      }

      // Success
      Alert.alert(
        'Passkey Updated Successfully',
        'Your emergency passkey has been changed successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              onSuccess();
              onClose();
            }
          }
        ]
      );

    } catch (error: any) {
      console.error('Error changing passkey:', error);
      setError(error.message || 'Failed to change passkey. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal 
      visible={visible} 
      animationType="fade" 
      transparent
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity 
            style={styles.overlay}
            activeOpacity={1}
            onPress={handleClose}
          >
            <TouchableOpacity 
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
            <View style={styles.modal}>
              <View style={styles.header}>
                <Text style={styles.title}>Change Passkey</Text>
                <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

                <ScrollView 
                  style={styles.scrollView}
                  contentContainerStyle={styles.content}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                <Text style={styles.description}>
                    Choose a new 4-digit passkey for emergency verification.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Passkey</Text>
                  <TextInput
                      ref={newPasskeyInputRef}
                    style={[styles.input, error && styles.inputError]}
                    value={newPasskey}
                      onChangeText={(text) => {
                        setNewPasskey(text);
                        setError('');
                      }}
                      placeholder="Enter new 4-digit passkey"
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    autoComplete="off"
                      autoCorrect={false}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmPasskeyInputRef.current?.focus()}
                      blurOnSubmit={false}
                  />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Confirm Passkey</Text>
                  <TextInput
                      ref={confirmPasskeyInputRef}
                    style={[styles.input, error && styles.inputError]}
                    value={confirmPasskey}
                      onChangeText={(text) => {
                        setConfirmPasskey(text);
                        setError('');
                      }}
                    placeholder="Confirm new passkey"
                    keyboardType="numeric"
                    maxLength={4}
                    secureTextEntry
                    autoComplete="off"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                  />
                </View>

                {error ? (
                  <View style={styles.errorContainer}>
                    <MaterialIcons name="error" size={16} color="#e74c3c" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={handleClose}
                    disabled={isLoading}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.button, styles.submitButton, isLoading && styles.submitButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.submitButtonText}>Change Passkey</Text>
                    )}
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  scrollView: {
    flexGrow: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 20,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2C3E50',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#ffffff',
    color: '#2C3E50',
  },
  inputError: {
    borderColor: '#e74c3c',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fdf2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#6c757d',
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#3498db',
    marginLeft: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default PasskeyChangeModal;

