import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '@/hooks/useSubscription';
import { styles } from '@/styles/FamilyScreen.styles';
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';

interface FamilyScreenProps {
  navigation: any;
}

const FamilyScreen: React.FC<FamilyScreenProps> = ({ navigation }) => {
  const {
    hasAccess,
    subscription,
    currentPlan,
    isFamilyPlan,
    isFamilyPlanOwner,
    isLoading,
    familyMembers,
    familyLoading,
    familyError,
    addFamilyMember,
    removeFamilyMember,
    refresh,
  } = useSubscription();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMember, setNewMember] = useState({
    phone: '',
  });
  const focusRefreshInFlightRef = useRef(false);

  // Debug logging for family members
  useEffect(() => {
    console.log('[FamilyScreen] Family members state:', {
      isFamilyPlan,
      subscriptionId: subscription?.id,
      familyMembersCount: familyMembers.length,
      familyLoading,
      familyError,
      hasAccess,
      currentPlanType: currentPlan?.type,
    });
  }, [isFamilyPlan, subscription?.id, familyMembers.length, familyLoading, familyError, hasAccess, currentPlan?.type]);

  console.log('[FamilyScreen] Render', {familyMembers});

  // iOS-only: refresh subscription/family data on focus (prevents "updates only after swipe up")
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    if (!navigation?.addListener) return;
    if (!refresh) return;

    const unsubscribe = navigation.addListener('focus', () => {
      // iOS-only: always attempt refresh on focus; guard to prevent concurrent refreshes.
      if (focusRefreshInFlightRef.current) return;
      focusRefreshInFlightRef.current = true;
      Promise.resolve()
        .then(() => refresh())
        .finally(() => {
          focusRefreshInFlightRef.current = false;
        });
    });

    return unsubscribe;
  }, [navigation, refresh]);

  const handleAddFamilyMember = async () => {
    const phoneE164 = indianPhoneToE164(newMember.phone);
    if (!phoneE164) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    const result = await addFamilyMember(phoneE164);
    
    if (result.success) {
      Alert.alert('Invite Sent', result.message || 'Invite sent. User will be auto-added after they sign up/login.');
      setShowAddMemberModal(false);
      setNewMember({ phone: '+91' });
    } else {
      Alert.alert('Error', result.error || 'Failed to add family member');
    }
  };

  const handleRemoveFamilyMember = (memberId: string, memberName: string) => {
    Alert.alert(
      'Remove Family Member',
      `Are you sure you want to remove ${memberName} from your family plan?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const result = await removeFamilyMember(memberId);
            if (result.success) {
              Alert.alert('Success', 'Family member removed successfully!');
            } else {
              Alert.alert('Error', result.error || 'Failed to remove family member');
            }
          },
        },
      ]
    );
  };

  // Show loading if subscription is loading OR family members are loading
  // But only show "Family Plan Required" if we've confirmed subscription status
  // iOS: do not hard-block the entire screen; render immediately (cached members hydrate instantly) and refresh in background.
  const isInitialLoading = Platform.OS === 'ios' ? false : (isLoading || (familyLoading && isFamilyPlan));
  const shouldShowFamilyRequired = !isLoading && (!hasAccess || !isFamilyPlan);

  if (isInitialLoading) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.header, { paddingTop: 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4BA8FF" />
          <Text style={styles.loadingText}>
            {isLoading ? 'Loading subscription...' : 'Loading family members...'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Check if user has family plan (only show this after loading is complete)
  if (shouldShowFamilyRequired) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={[styles.header, { paddingTop: 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="family-restroom" size={64} color="#bdc3c7" />
          <Text style={styles.emptyTitle}>Family Plan Required</Text>
          <Text style={styles.emptyText}>
            You need a family plan subscription to manage family members.
          </Text>
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.subscribeButtonText}>View Subscription Plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const maxMembers = currentPlan?.max_members || 5;
  const activeMemberRows = familyMembers.filter((member) => member.type === 'MEMBER' && member.status !== 'REMOVED');
  const pendingInviteRows = familyMembers.filter((member) => member.type === 'INVITE' && member.status === 'PENDING');
  const canAddMore = isFamilyPlanOwner && activeMemberRows.length < maxMembers;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={[styles.header, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Members</Text>
        {/* iOS-only: subtle inline loading indicator while refreshing */}
        {Platform.OS === 'ios' && (isLoading || familyLoading) ? (
          <ActivityIndicator size="small" color="#4BA8FF" />
        ) : (
        <View style={styles.placeholder} />
        )}
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* If we're still loading and have no cached data, show a friendly in-screen loader (not a hard gate) */}
        {Platform.OS === 'ios' && familyMembers.length === 0 && (isLoading || familyLoading) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4BA8FF" />
            <Text style={styles.loadingText}>
              {isLoading ? 'Loading subscription...' : 'Loading family members...'}
            </Text>
          </View>
        )}

        {!isLoading && !familyLoading && <>

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <MaterialIcons name="info" size={20} color="#4BA8FF" />
          <Text style={styles.infoText}>
            {isFamilyPlanOwner
              ? `Invite up to ${maxMembers} family members (including yourself) to share your subscription.`
              : 'You are part of a family plan managed by the primary account holder.'}
          </Text>
        </View>

        {/* Family Members Count */}
        <View style={styles.countSection}>
          <Text style={styles.countText}>
            {activeMemberRows.length} / {maxMembers} active members
          </Text>
          {pendingInviteRows.length > 0 && (
            <Text style={[styles.countText, { marginTop: 4 }]}>Pending invites: {pendingInviteRows.length}</Text>
          )}
        </View>

        {/* Add Member Button */}
        {canAddMore && (
          <TouchableOpacity
            style={styles.addMemberButton}
            onPress={() => setShowAddMemberModal(true)}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.addMemberButtonText}>Invite by Phone</Text>
          </TouchableOpacity>
        )}

        {/* Family Members List */}
        {familyMembers.length === 0 ? (
          <View style={styles.emptyFamilyContainer}>
            <MaterialIcons name="group" size={64} color="#bdc3c7" />
            <Text style={styles.emptyFamilyText}>No family members added yet</Text>
            <Text style={styles.emptyFamilySubtext}>
              Add family members to share your subscription. They'll be able to use the app with the same plan.
            </Text>
          </View>
        ) : (
          <View style={styles.membersList}>
            {familyMembers.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <View style={styles.memberHeader}>
                    <MaterialIcons
                      name={member.type === 'INVITE' ? 'schedule' : 'person'}
                      size={24}
                      color={member.type === 'INVITE' ? '#f39c12' : '#4BA8FF'}
                    />
                    <Text style={styles.memberName}>
                      {member.type === 'INVITE'
                        ? 'Pending Invite'
                        : (member.name || 'Member')}
                    </Text>
                  </View>
                  <Text style={styles.memberPhone}>{member.phone}</Text>
                  {member.type === 'MEMBER' && member.role && (
                    <Text style={styles.memberActivated}>Role: {member.role}</Text>
                  )}
                  {member.type === 'INVITE' && member.expiresAt && (
                    <Text style={styles.memberActivated}>
                      Expires: {new Date(member.expiresAt).toLocaleDateString()}
                    </Text>
                  )}
                  {member.email && (
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  )}
                  {member.activated_at && (
                    <Text style={styles.memberActivated}>
                      Activated: {new Date(member.activated_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                {isFamilyPlanOwner && member.type === 'MEMBER' && member.role !== 'OWNER' && (
                  <TouchableOpacity
                    style={styles.removeMemberButton}
                    onPress={() => handleRemoveFamilyMember(member.id, member.name || 'this member')}
                  >
                    <MaterialIcons name="delete" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Help Section */}
        <View style={styles.helpSection}>
          <Text style={styles.helpTitle}>How it works</Text>
          <Text style={styles.helpText}>
            • Family members can use the app with your subscription{'\n'}
            • Each member needs to sign up with the phone number you add{'\n'}
            • You can add or remove members at any time{'\n'}
            • Maximum {maxMembers} members per family plan
          </Text>
        </View>

        </>}
      </ScrollView>

      {/* Add Family Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Family Member</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <MaterialIcons name="close" size={24} color="#7f8c8d" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={newMember.phone}
                  onChangeText={(text) => setNewMember(prev => ({ ...prev, phone: text }))}
                  placeholder="XXXXX XXXXX"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>

              <Text style={styles.helpText}>
                Invite sent users are auto-added after they sign up/login with this same phone number.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddMemberModal(false);
                  setNewMember({ phone: '+91' });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, !newMember.phone.trim() && styles.addButtonDisabled]}
                onPress={handleAddFamilyMember}
                disabled={!newMember.phone.trim()}
              >
                <Text style={styles.addButtonText}>Send Invite</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default FamilyScreen;





