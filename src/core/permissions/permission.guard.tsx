/**
 * Permission Guard Component
 * 
 * A React component that ensures features only render when required
 * permissions are granted. This prevents features from running illegally
 * and provides a clear UI when permissions are missing.
 * 
 * iOS SAFETY: This component ensures no feature can run without proper
 * permissions, preventing silent failures and App Store rejections.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Capability } from './permission.types';
import { CAPABILITY_DISPLAY_NAMES, PERMISSION_DISPLAY_NAMES } from './permission.constants';
import { useCapabilityPermission } from './permission.hooks';

interface PermissionGuardProps {
  /**
   * The capability this guard is protecting
   */
  capability: Capability;

  /**
   * Children to render when permission is granted
   */
  children: React.ReactNode;

  /**
   * Optional fallback UI to show when permission is denied
   * If not provided, uses default permission request UI
   */
  fallback?: React.ReactNode;

  /**
   * Show loading state while checking permissions
   * Default: true
   */
  showLoading?: boolean;
}

/**
 * Permission Guard Component
 * 
 * Wraps a feature component and only renders it when required permissions
 * are granted. Shows permission request UI when permissions are missing.
 */
export function PermissionGuard({
  capability,
  children,
  fallback,
  showLoading = true,
}: PermissionGuardProps) {
  const { granted, loading, requestCapability, requiredPermissions } =
    useCapabilityPermission(capability);

  // Show nothing while loading (if showLoading is false)
  if (loading && !showLoading) {
    return null;
  }

  // Show loading indicator
  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  // Permission granted - render children
  if (granted === true) {
    return <>{children}</>;
  }

  // Permission denied - show fallback or default UI
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default permission request UI
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>
          {CAPABILITY_DISPLAY_NAMES[capability]} Requires Permissions
        </Text>
        <Text style={styles.description}>
          To use {CAPABILITY_DISPLAY_NAMES[capability].toLowerCase()}, we need the
          following permissions:
        </Text>
        <View style={styles.permissionsList}>
          {requiredPermissions.map((permission) => (
            <Text key={permission} style={styles.permissionItem}>
              • {PERMISSION_DISPLAY_NAMES[permission]}
            </Text>
          ))}
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            const success = await requestCapability();
            if (!success) {
              // If still denied, offer to open settings (if blocked)
              // This would require checking individual permission statuses
              // For now, just show the request button again
            }
          }}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => {
            // Open app settings on both iOS and Android
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            Open Settings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Hook version of PermissionGuard
 * 
 * Use this when you need permission state but don't want to use the guard component.
 * Returns permission status and request function.
 */
export function usePermissionGuard(capability: Capability) {
  const capabilityPermission = useCapabilityPermission(capability);

  return {
    ...capabilityPermission,
    Guard: ({ children, fallback, showLoading }: Omit<PermissionGuardProps, 'capability'>) => (
      <PermissionGuard
        capability={capability}
        fallback={fallback}
        showLoading={showLoading}
      >
        {children}
      </PermissionGuard>
    ),
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionsList: {
    marginBottom: 24,
    paddingLeft: 16,
  },
  permissionItem: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 8,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  secondaryButtonText: {
    color: '#fff',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
});

