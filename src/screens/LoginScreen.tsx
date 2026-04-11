/**
 * Login Screen - UI Only
 * 
 * Authentication screen for email/password login.
 * This is a pure UI component with no background processing.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/core/auth';

interface LoginScreenProps {
  navigation: any;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  // const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [safetyCompanionAcknowledged, setSafetyCompanionAcknowledged] = useState(false);

  const handleSignIn = async () => {
    if (!email || email.trim().length === 0) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!password || password.trim().length === 0) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!safetyCompanionAcknowledged) {
      Alert.alert('Error', 'Please acknowledge the safety companion disclaimer');
      return;
    }

    setLoading(true);
    try {
      // const result = await signIn({
      //   email: email.trim(),
      //   password: password,
      // });

      // if (!result.success) {
      //   throw new Error(result.error || 'Sign in failed');
      // }

      // Navigation will be handled by RootNavigator based on auth state
      // No need to navigate manually
    } catch (error: any) {
      console.error('Sign in error:', error);
      let errorMessage = 'Sign in failed. Please try again.';
      
      if (error.message?.includes('Invalid login credentials') || error.message?.includes('Invalid')) {
        errorMessage = 'Invalid email or password. Please try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Logo/Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>DeepHorizon</Text>
              <Text style={styles.logoSubtext}>Security</Text>
            </View>
          </View>

          {/* Auth Form */}
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Sign In</Text>

            {/* Email Input */}
            <View style={styles.inputContainer}>
              <MaterialIcons name="email" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#999"
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputContainer}>
              <MaterialIcons name="lock" size={20} color="#666" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
              >
                <MaterialIcons 
                  name={showPassword ? "visibility" : "visibility-off"} 
                  size={20} 
                  color="#666" 
                />
              </TouchableOpacity>
            </View>

            {/* Safety Companion Acknowledgment Checkbox */}
            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => {
                  Keyboard.dismiss();
                  setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                }}
                activeOpacity={0.7}
              >
                {safetyCompanionAcknowledged ? (
                  <MaterialIcons name="check-box" size={28} color="#007AFF" />
                ) : (
                  <MaterialIcons name="check-box-outline-blank" size={28} color="#666" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.checkboxLabelContainer}
                onPress={() => {
                  Keyboard.dismiss();
                  setSafetyCompanionAcknowledged(!safetyCompanionAcknowledged);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.checkboxLabel}>
                  I understand that Deep Horizon is a safety companion app that provides digital coordination and support. It does not replace police, emergency, or licensed private security services.
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity 
              style={[
                styles.authButton, 
                (loading || !safetyCompanionAcknowledged || !email.trim() || !password) && styles.authButtonDisabled
              ]}
              onPress={handleSignIn}
              disabled={loading || !safetyCompanionAcknowledged || !email.trim() || !password}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.authButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            {/* Register Link */}
            <TouchableOpacity 
              style={styles.registerLink}
              onPress={() => navigation.navigate('Register')}
            >
              <Text style={styles.registerLinkText}>Don't have an account? Sign Up</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 40,
  },
  logoContainer: {
    alignItems: 'center',
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#203b84',
    marginBottom: 4,
  },
  logoSubtext: {
    fontSize: 18,
    color: '#4BA8FF',
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 24,
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
  passwordToggle: {
    padding: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    marginRight: 12,
    marginTop: 2,
  },
  checkboxLabelContainer: {
    flex: 1,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  authButton: {
    backgroundColor: '#203b84',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  authButtonDisabled: {
    opacity: 0.6,
  },
  authButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerLink: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 8,
  },
  registerLinkText: {
    color: '#203b84',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default LoginScreen;

