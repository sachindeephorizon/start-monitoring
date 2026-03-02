/**
 * Profile Screen - UI Only
 * 
 * Displays and allows editing of user profile information.
 * This is a pure UI component with no background processing.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useCurrentUser } from '@/core/auth';
import { supabase } from '@/lib/supabase';
import PasskeyChangeModal from '@/components/modals/PasskeyChangeModal';
import { SettingsService } from '@/features/settings/settings.service';
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';
import { withTimeout } from '@/core/net/supabaseQuery';

interface ProfileScreenProps {
  navigation: any;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({ navigation }) => {
  const { refreshProfile, profile, isAuthReady } = useAuth();
  const user = useCurrentUser();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasskeyChangeModal, setShowPasskeyChangeModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showNotificationSettingsModal, setShowNotificationSettingsModal] = useState(false);
  const [showPrivacySettingsModal, setShowPrivacySettingsModal] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notifPushEnabled, setNotifPushEnabled] = useState<boolean>(true);
  const [notifEmailEnabled, setNotifEmailEnabled] = useState<boolean>(true);
  const [privacyShareLocation, setPrivacyShareLocation] = useState<boolean>(true);
  const [privacyShareActivity, setPrivacyShareActivity] = useState<boolean>(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  
  const [userInfo, setUserInfo] = useState({
    name: '',
    email: '',
    phone: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relation: '',
    date_of_birth: '',
    home_address: '',
    work_address: '',
    blood_type: '',
    allergies: '',
    plan: 'Basic Security',
    joinDate: ''
  });

  // Keep latest auth metadata/email so UI doesn't flicker during background refreshes.
  const authMetaRef = useRef<Record<string, any> | null>(null);
  const authEmailRef = useRef<string | null>(null);

  // When entering edit mode, prefill India country code for empty phone fields.
  // This matches the phone login UX (country code shown up-front).
  useEffect(() => {
    if (!isEditing) return;
    setUserInfo(prev => ({
      ...prev,
      phone: prev.phone ? normalizeIndianPhoneInput(prev.phone) : '+91',
      emergency_contact_phone: prev.emergency_contact_phone
        ? normalizeIndianPhoneInput(prev.emergency_contact_phone)
        : '+91',
    }));
  }, [isEditing]);

  const applyProfileToState = useCallback(
    (dbProfile: any | null, metadata: Record<string, any> | null, authEmail: string | null) => {
      if (!user) return;

      if (dbProfile) {
        const joinDate = dbProfile.created_at
          ? new Date(dbProfile.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
            })
          : '';

        const resolvedName =
          dbProfile.name ||
          (typeof metadata?.name === 'string' ? metadata.name : '') ||
          user.name ||
          '';

        const resolvedEmail =
          dbProfile.email ||
          (typeof metadata?.profile_email === 'string' ? metadata.profile_email : '') ||
          authEmail ||
          user.email ||
          '';

        /**
         * IMPORTANT (no-blink UX):
         * Never overwrite already-rendered values with empty strings just because
         * one async source arrived without that field populated.
         */
        setUserInfo((prev) => ({
          ...prev,
          name: resolvedName || prev.name,
          email: resolvedEmail || prev.email,
          phone: dbProfile.phone ?? prev.phone ?? '',
          emergency_contact_name: dbProfile.emergency_contact_name ?? prev.emergency_contact_name ?? '',
          emergency_contact_phone: dbProfile.emergency_contact_phone ?? prev.emergency_contact_phone ?? '',
          emergency_contact_relation: dbProfile.emergency_contact_relationship ?? prev.emergency_contact_relation ?? '',
          date_of_birth: dbProfile.date_of_birth ?? prev.date_of_birth ?? '',
          home_address: dbProfile.home_address ?? prev.home_address ?? '',
          work_address: dbProfile.work_address ?? prev.work_address ?? '',
          blood_type: dbProfile.blood_type ?? prev.blood_type ?? '',
          allergies: dbProfile.allergies ?? prev.allergies ?? '',
          plan: 'Basic Security',
          joinDate: joinDate || prev.joinDate,
        }));
      } else {
        const resolvedName =
          user.name ||
          (typeof metadata?.name === 'string' ? metadata.name : '') ||
          '';
        const resolvedEmail =
          user.email ||
          authEmail ||
          (typeof metadata?.profile_email === 'string' ? metadata.profile_email : '') ||
          '';

        /**
         * IMPORTANT (no-blink UX):
         * If we don't have a DB profile yet (or it's temporarily unavailable),
         * do NOT overwrite already-rendered fields with empty strings.
         */
        setUserInfo(prev => ({
          ...prev,
          name: resolvedName || prev.name,
          email: resolvedEmail || prev.email,
          phone: (user.phone || prev.phone),
        }));
      }

      // Preferences are stored in auth metadata; update best-effort.
      if (metadata) {
        setNotifPushEnabled(metadata.notif_push_enabled !== undefined ? Boolean(metadata.notif_push_enabled) : true);
        setNotifEmailEnabled(metadata.notif_email_enabled !== undefined ? Boolean(metadata.notif_email_enabled) : true);
        setPrivacyShareLocation(metadata.privacy_share_location !== undefined ? Boolean(metadata.privacy_share_location) : true);
        setPrivacyShareActivity(metadata.privacy_share_activity !== undefined ? Boolean(metadata.privacy_share_activity) : true);
      }
    },
    [user]
  );

  /**
   * Use a ref for profile to avoid dependency-cascade:
   * OLD: loadUserProfile depended on `profile` → called refreshProfile() → profile changed
   *      → loadUserProfile recreated → useFocusEffect fired again → infinite loop
   * NEW: Read profile from ref (no dependency), apply once on focus.
   *      Auth context handles background refresh; we just render what's available.
   */
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const loadUserProfile = useCallback(async () => {
    if (!user || !isAuthReady) {
      setLoading(false);
      return;
    }

    try {
      // Render immediately from hydrated auth.profile (cache) — never block UI
      setLoading(false);
      applyProfileToState(profileRef.current, authMetaRef.current, authEmailRef.current);

      // Fetch latest auth metadata once (best-effort, timeout protected)
      withTimeout(supabase.auth.getSession(), 6000)
        .then(({ data }) => {
          const authUser = data.session?.user ?? null;
          const metadata = (authUser?.user_metadata ?? {}) as Record<string, any>;
          const authEmail = authUser?.email ?? null;
          authMetaRef.current = metadata;
          authEmailRef.current = authEmail;
          applyProfileToState(profileRef.current, metadata, authEmail);
        })
        .catch(() => {});
    } catch (error: any) {
      console.error('Error loading profile:', error);
      setLoading(false);
    }
  }, [user, isAuthReady, applyProfileToState]);

  // Load profile data when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadUserProfile();
    }, [loadUserProfile])
  );

  // Re-apply when auth.profile updates from background refresh (e.g. after save)
  // This is separate from loadUserProfile to avoid the dependency cascade.
  useEffect(() => {
    if (profile && !loading) {
      applyProfileToState(profile, authMetaRef.current, authEmailRef.current);
    }
  }, [profile, loading, applyProfileToState]);

  const handleSave = async () => {
    if (!user) return;

    if (!userInfo.name.trim()) {
      Alert.alert('Validation Error', 'Name is required.');
      return;
    }

    const trimmedEmail = userInfo.email.trim();
    const fallbackEmail = (user.email || '').trim();
    const effectiveEmail = (trimmedEmail || fallbackEmail).trim();
    if (!effectiveEmail) {
      Alert.alert('Validation Error', 'Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(effectiveEmail)) {
      Alert.alert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    const phoneE164 = indianPhoneToE164(userInfo.phone);
    const emergencyPhoneE164 = indianPhoneToE164(userInfo.emergency_contact_phone);
    const hasPhoneInput = Boolean(userInfo.phone && userInfo.phone !== '+91');
    const hasEmergencyPhoneInput = Boolean(userInfo.emergency_contact_phone && userInfo.emergency_contact_phone !== '+91');

    if (hasPhoneInput && !phoneE164) {
      Alert.alert('Validation Error', 'Please enter a valid phone number.');
      return;
    }

    if (hasEmergencyPhoneInput && !emergencyPhoneE164) {
      Alert.alert('Validation Error', 'Please enter a valid emergency contact phone number.');
      return;
    }

    if (userInfo.emergency_contact_name.trim() && !emergencyPhoneE164) {
      Alert.alert('Validation Error', 'Please provide a phone number for the emergency contact.');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('mobile_users')
        .update({
          name: userInfo.name.trim(),
          email: effectiveEmail,
          phone: phoneE164 || null,
          emergency_contact_name: userInfo.emergency_contact_name.trim() || null,
          emergency_contact_phone: emergencyPhoneE164 || null,
          emergency_contact_relationship: userInfo.emergency_contact_relation.trim() || null,
          date_of_birth: userInfo.date_of_birth || null,
          home_address: userInfo.home_address.trim() || null,
          work_address: userInfo.work_address.trim() || null,
          blood_type: userInfo.blood_type || null,
          allergies: userInfo.allergies || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      // Update user metadata
      await supabase.auth.updateUser({
        data: {
          name: userInfo.name.trim(),
          phone: phoneE164 || null,
          profile_email: effectiveEmail,
        } as any,
      });

      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully!');
      // Refresh profile from server after save so UI shows the latest data
      await refreshProfile();
      // loadUserProfile will pick up the fresh profile via profileRef
    } catch (error: any) {
      console.error('Save profile error:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Validation Error', 'Please enter and confirm your new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation Error', 'Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Validation Error', 'Password must be at least 8 characters.');
      return;
    }

    try {
      setChangePasswordLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      Alert.alert('Success', 'Password updated successfully.');
      setShowChangePasswordModal(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Change password error:', error);
      Alert.alert('Error', error?.message || 'Failed to update password.');
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const handleSaveNotificationSettings = async () => {
    try {
      if (!user) return;
      setSavingPreferences(true);
      const { error } = await supabase.auth.updateUser({
        data: {
          notif_push_enabled: notifPushEnabled,
          notif_email_enabled: notifEmailEnabled,
        },
      });
      if (error) throw error;
      Alert.alert('Success', 'Notification settings updated.');
      setShowNotificationSettingsModal(false);
    } catch (error: any) {
      console.error('Notification settings error:', error);
      Alert.alert('Error', error?.message || 'Failed to update notification settings.');
    } finally {
      setSavingPreferences(false);
    }
  };

  const handleSavePrivacySettings = async () => {
    try {
      if (!user) return;
      setSavingPreferences(true);
      const { error } = await supabase.auth.updateUser({
        data: {
          privacy_share_location: privacyShareLocation,
          privacy_share_activity: privacyShareActivity,
        },
      });
      if (error) throw error;
      Alert.alert('Success', 'Privacy settings updated.');
      setShowPrivacySettingsModal(false);
    } catch (error: any) {
      console.error('Privacy settings error:', error);
      Alert.alert('Error', error?.message || 'Failed to update privacy settings.');
    } finally {
      setSavingPreferences(false);
    }
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
                    try {
                      setDeletingAccount(true);
                      const result = await SettingsService.deleteAccount();
                      if (result.success) {
                        // Account deletion successful - user will be signed out automatically
                        // Navigation will be handled by auth state change
                        Alert.alert(
                          'Account Deleted',
                          'Your account has been permanently deleted.',
                          [{ text: 'OK' }]
                        );
                      } else {
                        Alert.alert('Error', result.error || 'Failed to delete account');
                      }
                    } catch (error: any) {
                      console.error('Delete account error:', error);
                      Alert.alert('Error', error?.message || 'An unexpected error occurred');
                    } finally {
                      setDeletingAccount(false);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#203b84" />
        <Text style={styles.loadingText}>Loading your profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Home');
          }
        }} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <TouchableOpacity
          onPress={() => isEditing ? handleSave() : setIsEditing(true)}
          style={[styles.editButton, saving && styles.editButtonDisabled]}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.editButtonText}>
              {isEditing ? 'Save' : 'Edit'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <MaterialIcons name="person" size={48} color="#ffffff" />
            </View>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={[styles.input, !isEditing && styles.disabledInput]}
                value={userInfo.name}
                onChangeText={(text) => setUserInfo(prev => ({ ...prev, name: text }))}
                editable={isEditing}
                placeholderTextColor="#bdc3c7"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={[styles.input, !isEditing && styles.disabledInput]}
                value={userInfo.email}
                onChangeText={(text) => setUserInfo(prev => ({ ...prev, email: text }))}
                editable={isEditing}
                keyboardType="email-address"
                placeholderTextColor="#bdc3c7"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={[
                  styles.input,
                  !isEditing && styles.disabledInput,
                  userInfo.phone && !indianPhoneToE164(userInfo.phone) && styles.errorInput
                ]}
                value={userInfo.phone}
                onChangeText={(text) => setUserInfo(prev => ({ ...prev, phone: normalizeIndianPhoneInput(text) }))}
                editable={isEditing}
                keyboardType="phone-pad"
                placeholderTextColor="#bdc3c7"
                placeholder="+91XXXXXXXXXX"
              />
              {userInfo.phone && !indianPhoneToE164(userInfo.phone) && (
                <Text style={styles.errorText}>Please enter a valid phone number</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Emergency Contact Name</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input]}
                  value={userInfo.emergency_contact_name}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, emergency_contact_name: text }))}
                  placeholder="Emergency contact name"
                  placeholderTextColor="#bdc3c7"
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.emergency_contact_name || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Emergency Contact Phone</Text>
              {isEditing ? (
                <>
                  <TextInput
                    style={[
                      styles.input,
                      userInfo.emergency_contact_phone && !indianPhoneToE164(userInfo.emergency_contact_phone) && styles.errorInput
                    ]}
                    value={userInfo.emergency_contact_phone}
                    onChangeText={(text) =>
                      setUserInfo(prev => ({ ...prev, emergency_contact_phone: normalizeIndianPhoneInput(text) }))
                    }
                    keyboardType="phone-pad"
                    placeholder="+91XXXXXXXXXX"
                    placeholderTextColor="#bdc3c7"
                  />
                  {userInfo.emergency_contact_phone && !indianPhoneToE164(userInfo.emergency_contact_phone) && (
                    <Text style={styles.errorText}>Please enter a valid phone number</Text>
                  )}
                </>
              ) : (
                <Text style={styles.infoText}>{userInfo.emergency_contact_phone || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Emergency Contact Relation</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input]}
                  value={userInfo.emergency_contact_relation}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, emergency_contact_relation: text }))}
                  placeholder="e.g., Parent, Spouse, Friend"
                  placeholderTextColor="#bdc3c7"
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.emergency_contact_relation || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Date of Birth</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input]}
                  value={userInfo.date_of_birth}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, date_of_birth: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#bdc3c7"
                />
              ) : (
                <Text style={styles.infoText}>
                  {userInfo.date_of_birth ? new Date(userInfo.date_of_birth).toLocaleDateString() : 'Not set'}
                </Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Home Address</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={userInfo.home_address}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, home_address: text }))}
                  placeholder="Full home address"
                  placeholderTextColor="#bdc3c7"
                  multiline
                  numberOfLines={3}
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.home_address || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Work Address (Optional)</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={userInfo.work_address}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, work_address: text }))}
                  placeholder="Work address (optional)"
                  placeholderTextColor="#bdc3c7"
                  multiline
                  numberOfLines={3}
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.work_address || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Blood Group</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input]}
                  value={userInfo.blood_type}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, blood_type: text }))}
                  placeholder="e.g., A+, O-"
                  placeholderTextColor="#bdc3c7"
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.blood_type || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Allergies</Text>
              {isEditing ? (
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={userInfo.allergies}
                  onChangeText={(text) => setUserInfo(prev => ({ ...prev, allergies: text }))}
                  placeholder="Known allergies (or 'None')"
                  placeholderTextColor="#bdc3c7"
                  multiline
                  numberOfLines={2}
                />
              ) : (
                <Text style={styles.infoText}>{userInfo.allergies || 'Not set'}</Text>
              )}
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Security Plan</Text>
                <Text style={styles.infoValue}>{userInfo.plan}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Member Since</Text>
                <Text style={styles.infoValue}>{userInfo.joinDate}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowPasskeyChangeModal(true)}
          >
            <MaterialIcons name="vpn-key" size={20} color="#4BA8FF" />
            <Text style={styles.actionButtonText}>Change Passkey</Text>
            <MaterialIcons name="chevron-right" size={20} color="#bdc3c7" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowChangePasswordModal(true)}
          >
            <MaterialIcons name="security" size={20} color="#4BA8FF" />
            <Text style={styles.actionButtonText}>Change Password</Text>
            <MaterialIcons name="chevron-right" size={20} color="#bdc3c7" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowNotificationSettingsModal(true)}
          >
            <MaterialIcons name="notifications" size={20} color="#4BA8FF" />
            <Text style={styles.actionButtonText}>Notification Settings</Text>
            <MaterialIcons name="chevron-right" size={20} color="#bdc3c7" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowPrivacySettingsModal(true)}
          >
            <MaterialIcons name="privacy-tip" size={20} color="#4BA8FF" />
            <Text style={styles.actionButtonText}>Privacy Settings</Text>
            <MaterialIcons name="chevron-right" size={20} color="#bdc3c7" />
          </TouchableOpacity>
        </View>

        <View style={styles.dangerSection}>
          <Text style={styles.dangerSectionTitle}>Account Deletion</Text>
          <TouchableOpacity
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleDeleteAccount}
            disabled={deletingAccount}
          >
            <MaterialIcons name="delete-forever" size={20} color="#e74c3c" />
            <Text style={[styles.actionButtonText, styles.dangerButtonText]}>
              Delete Account
            </Text>
            {deletingAccount && (
              <ActivityIndicator size="small" color="#e74c3c" style={{ marginLeft: 8 }} />
            )}
          </TouchableOpacity>
          <Text style={styles.dangerDescription}>
            Permanently delete your account and remove your profile details and personal data. Your activity history may be retained in an anonymized form.
          </Text>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Passkey Change Modal */}
      <PasskeyChangeModal
        visible={showPasskeyChangeModal}
        onClose={() => setShowPasskeyChangeModal(false)}
        onSuccess={() => {
          // Optionally reload profile or show success message
          console.log('Passkey changed successfully');
        }}
      />

      {/* Change Password Modal */}
      <Modal
        visible={showChangePasswordModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowChangePasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="New password"
              placeholderTextColor="#7f8c8d"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Confirm new password"
              placeholderTextColor="#7f8c8d"
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => {
                  setShowChangePasswordModal(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimary]}
                onPress={handleChangePassword}
                disabled={changePasswordLoading}
              >
                {changePasswordLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Notification Settings Modal */}
      <Modal
        visible={showNotificationSettingsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowNotificationSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Notification Settings</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Push notifications</Text>
              <Switch
                value={notifPushEnabled}
                onValueChange={setNotifPushEnabled}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Email notifications</Text>
              <Switch
                value={notifEmailEnabled}
                onValueChange={setNotifEmailEnabled}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setShowNotificationSettingsModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimary]}
                onPress={handleSaveNotificationSettings}
                disabled={savingPreferences}
              >
                {savingPreferences ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Privacy Settings Modal */}
      <Modal
        visible={showPrivacySettingsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPrivacySettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Privacy Settings</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Share location with agents</Text>
              <Switch
                value={privacyShareLocation}
                onValueChange={setPrivacyShareLocation}
              />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Share usage for service reliability</Text>
              <Switch
                value={privacyShareActivity}
                onValueChange={setPrivacyShareActivity}
              />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancel]}
                onPress={() => setShowPrivacySettingsModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalPrimary]}
                onPress={handleSavePrivacySettings}
                disabled={savingPreferences}
              >
                {savingPreferences ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3498db',
  },
  editButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  profileSection: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingVertical: 24,
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  formSection: {
    paddingHorizontal: 16,
  },
  inputGroup: {
    marginBottom: 20,
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
  disabledInput: {
    backgroundColor: '#f8f9fa',
    color: '#7f8c8d',
  },
  infoSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#2C3E50',
    fontWeight: '600',
  },
  actionsSection: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingVertical: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#2C3E50',
    textAlign: 'center',
  },
  errorInput: {
    borderColor: '#e74c3c',
    borderWidth: 1,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  infoText: {
    fontSize: 16,
    color: '#2C3E50',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#2C3E50',
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 10,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalCancel: {
    backgroundColor: '#f1f2f6',
  },
  modalCancelText: {
    color: '#2C3E50',
    fontWeight: '600',
  },
  modalPrimary: {
    backgroundColor: '#4BA8FF',
  },
  modalPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#2C3E50',
    flex: 1,
    marginRight: 12,
  },
  dangerSection: {
    backgroundColor: '#ffffff',
    marginTop: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  dangerSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  dangerButton: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  dangerButtonText: {
    color: '#e74c3c',
  },
  dangerDescription: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 8,
    marginHorizontal: 16,
    lineHeight: 16,
  },
});

export default ProfileScreen;

