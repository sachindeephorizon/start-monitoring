/**
 * Permission Status Screen Component
 * 
 * Displays current permission statuses and allows users to open iOS Settings.
 * 
 * iOS SAFETY:
 * - Read-only status display (no auto-requests)
 * - Deep-links to iOS Settings when permissions denied
 * - Clear explanations of why permissions are required
 * - No permission re-prompt loops
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { usePermissionStatuses } from '../settings.hooks';
import { PermissionStatusEntry } from '../settings.types';

/**
 * Get status badge color
 */
function getStatusColor(status: PermissionStatusEntry['status']): string {
  switch (status) {
    case 'granted':
      return '#4CAF50'; // Green
    case 'denied':
      return '#FF9800'; // Orange
    case 'blocked':
      return '#F44336'; // Red
    default:
      return '#9E9E9E'; // Gray
  }
}

/**
 * Get status label
 */
function getStatusLabel(status: PermissionStatusEntry['status']): string {
  switch (status) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'blocked':
      return 'Blocked (Open Settings)';
    case 'limited':
      return 'Limited';
    case 'unavailable':
      return 'Unavailable';
    case 'not_determined':
      return 'Not Determined';
    default:
      return 'Unknown';
  }
}

export function PermissionStatusScreen() {
  const { statuses, loading, refreshStatuses, openSettings } = usePermissionStatuses();

  const handleOpenSettings = async () => {
    const success = await openSettings();
    if (!success) {
      Alert.alert('Error', 'Unable to open Settings. Please open Settings manually.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading permission statuses...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Permissions</Text>
        <Text style={styles.subtitle}>
          View and manage app permissions. To change permissions, open iOS Settings.
        </Text>
      </View>

      {statuses.map((permission) => (
        <View key={permission.permission} style={styles.permissionCard}>
          <View style={styles.permissionHeader}>
            <Text style={styles.permissionName}>{permission.displayName}</Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(permission.status) },
              ]}
            >
              <Text style={styles.statusText}>{getStatusLabel(permission.status)}</Text>
            </View>
          </View>

          <Text style={styles.explanation}>{permission.explanation}</Text>

          {permission.canOpenSettings && (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={handleOpenSettings}
            >
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Changes made in Settings will be reflected here when you return to the app.
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
  permissionCard: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 20,
    marginVertical: 8,
    padding: 16,
    borderRadius: 12,
  },
  permissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  permissionName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  explanation: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 12,
  },
  settingsButton: {
    backgroundColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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

