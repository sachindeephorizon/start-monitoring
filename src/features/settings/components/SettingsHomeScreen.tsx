/**
 * Settings Home Screen Component
 * 
 * Main settings screen with navigation to all settings sections.
 * 
 * iOS SAFETY: Pure navigation screen, no background logic.
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useAppInfo } from '../settings.hooks';
import { useAuth } from '@/core/auth/auth.hooks';

interface SettingsHomeScreenProps {
  onNavigateToPermissions?: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToAccount?: () => void;
  onNavigateToPrivacy?: () => void;
  onNavigateToTerms?: () => void;
  onNavigateToRefund?: () => void;
}

export function SettingsHomeScreen({
  onNavigateToPermissions,
  onNavigateToNotifications,
  onNavigateToAccount,
  onNavigateToPrivacy,
  onNavigateToTerms,
  onNavigateToRefund,
}: SettingsHomeScreenProps) {
  const appInfo = useAppInfo();
  const auth = useAuth();
  const user = auth.status === 'authenticated' ? auth.user : null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        {user && (
          <Text style={styles.userEmail}>{user.email}</Text>
        )}
      </View>

      {/* Permissions Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permissions</Text>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToPermissions}
        >
          <Text style={styles.settingsItemText}>Permission Status</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToNotifications}
        >
          <Text style={styles.settingsItemText}>Notification Preferences</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToAccount}
        >
          <Text style={styles.settingsItemText}>Account Settings</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Legal Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToPrivacy}
        >
          <Text style={styles.settingsItemText}>Privacy Policy</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToTerms}
        >
          <Text style={styles.settingsItemText}>Terms of Service</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsItem}
          onPress={onNavigateToRefund}
        >
          <Text style={styles.settingsItemText}>Refund Policy</Text>
          <Text style={styles.settingsItemArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* App Info Section */}
      <View style={styles.section}>
        <View style={styles.appInfoCard}>
          <Text style={styles.appInfoLabel}>App Version</Text>
          <Text style={styles.appInfoValue}>{appInfo.version}</Text>
        </View>
        <View style={styles.appInfoCard}>
          <Text style={styles.appInfoLabel}>Build Number</Text>
          <Text style={styles.appInfoValue}>{appInfo.buildNumber}</Text>
        </View>
      </View>
    </ScrollView>
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
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#aaa',
  },
  section: {
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  settingsItem: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 4,
    borderRadius: 12,
  },
  settingsItemText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  settingsItemArrow: {
    fontSize: 24,
    color: '#666',
  },
  appInfoCard: {
    backgroundColor: '#1a1a1a',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 4,
    borderRadius: 12,
  },
  appInfoLabel: {
    fontSize: 16,
    color: '#aaa',
  },
  appInfoValue: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});

