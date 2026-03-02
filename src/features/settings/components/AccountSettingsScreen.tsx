/**
 * Account Settings Screen Component
 * 
 * Account management controls (logout, delete account).
 * 
 * iOS SAFETY:
 * - Logout is immediate
 * - Delete account requires confirmation (destructive action)
 * - Server handles account deletion
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAccountOperations } from '../settings.hooks';
import { useAuth } from '@/core/auth/auth.hooks';

export function AccountSettingsScreen() {
  const { deleteAccount, loading } = useAccountOperations();
  const { signOut } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            // Navigation will be handled by AuthGuard/AuthNavigator
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. Your profile details and personal data will be permanently deleted. Your activity history may be retained in an anonymized form. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Second confirmation
            Alert.alert(
              'Final Confirmation',
              'This will permanently delete your account and remove your profile details and personal data. Your activity history may be retained in an anonymized form. This cannot be reversed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete Forever',
                  style: 'destructive',
                  onPress: async () => {
                    const result = await deleteAccount();
                    if (result.success) {
                      Alert.alert(
                        'Account Deleted',
                        'Your account has been deleted successfully.',
                        [{ text: 'OK' }]
                      );
                      // Navigation will be handled by auth state change
                    } else {
                      Alert.alert('Error', result.error || 'Failed to delete account');
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Account</Text>
        <Text style={styles.subtitle}>Manage your account settings</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleLogout}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.dangerSectionTitle}>Account Deletion</Text>
        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={handleDeleteAccount}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, styles.dangerButtonText]}>Delete Account</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.dangerDescription}>
          Permanently delete your account and remove your profile details and personal data. Your activity history may be retained in an anonymized form.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 22,
  },
  section: {
    padding: 20,
    paddingTop: 10,
  },
  button: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerSectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F44336',
    marginBottom: 12,
  },
  dangerButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  dangerButtonText: {
    color: '#F44336',
  },
  dangerDescription: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    lineHeight: 20,
  },
});

