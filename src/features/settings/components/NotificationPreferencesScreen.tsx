/**
 * Notification Preferences Screen Component
 * 
 * Allows users to manage notification preferences.
 * 
 * iOS SAFETY:
 * - Preferences stored server-side
 * - Push delivery logic remains unchanged
 * - Emergency alerts cannot be fully disabled (App Store requirement)
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useNotificationPreferences } from '../settings.hooks';
import { NotificationPreference } from '../settings.types';

export function NotificationPreferencesScreen() {
  const { preferences, loading, updatePreference } = useNotificationPreferences();

  const handleToggle = async (type: string, currentValue: boolean, required: boolean) => {
    if (required) {
      // Cannot disable required notifications
      return;
    }

    await updatePreference(type, !currentValue);
  };

  if (loading && preferences.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading preferences...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notification Preferences</Text>
        <Text style={styles.subtitle}>
          Control which notifications you receive. Emergency alerts cannot be disabled for your safety.
        </Text>
      </View>

      {preferences.map((pref) => (
        <View key={pref.type} style={styles.preferenceCard}>
          <View style={styles.preferenceHeader}>
            <View style={styles.preferenceInfo}>
              <Text style={styles.preferenceLabel}>
                {pref.label}
                {pref.required && (
                  <Text style={styles.requiredBadge}> (Required)</Text>
                )}
              </Text>
              <Text style={styles.preferenceDescription}>{pref.description}</Text>
            </View>
            <Switch
              value={pref.enabled}
              onValueChange={() => handleToggle(pref.type, pref.enabled, pref.required || false)}
              disabled={pref.required}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={pref.enabled ? '#fff' : '#f4f3f4'}
            />
          </View>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Changes are saved automatically and will affect future notifications.
        </Text>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#ccc',
    lineHeight: 22,
  },
  preferenceCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
  },
  preferenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  preferenceInfo: {
    flex: 1,
    marginRight: 16,
  },
  preferenceLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  requiredBadge: {
    fontSize: 14,
    color: '#FF9800',
    fontWeight: '400',
  },
  preferenceDescription: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    paddingTop: 10,
  },
  footerText: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
});

