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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useSubscription } from '@/hooks/useSubscription';
import { styles } from '@/styles/FamilyScreen.styles';
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';

interface FamilyScreenProps {
  navigation: any;
}

const FamilyScreen: React.FC<FamilyScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const {
    hasAccess,
    subscription,
    currentPlan,
    isFamilyPlan,
    isLoading,
    familyMembers,
    familyLoading,
    familyError,
    addFamilyMember,
    removeFamilyMember,
    loadFamilyMembers,
    refresh,
  } = useSubscription();

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMember, setNewMember] = useState({
    phone: '+91',
    name: '',
    email: '',
  });
  const [hasCheckedAccess, setHasCheckedAccess] = useState(false);
  const focusRefreshInFlightRef = useRef(false);

  // Only refresh if we haven't checked access yet and subscription is not loading
  // Optimized: Family members will be loaded automatically by useSubscription hook
  // when subscription is loaded, so we don't need to call refresh() here
  useEffect(() => {
    // Mark as checked once subscription loading is complete
    if (!isLoading) {
      setHasCheckedAccess(true);
    }
  }, [isLoading]);

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

  // Manually trigger family members load if we have a family plan but no members loaded
  useEffect(() => {
    if (isFamilyPlan && subscription?.id && !familyLoading && familyMembers.length === 0) {
      console.log('[FamilyScreen] Manually triggering family members load');
      loadFamilyMembers(subscription.id).catch(err => {
        console.error('[FamilyScreen] Error manually loading family members:', err);
      });
    }
  }, [isFamilyPlan, subscription?.id, familyLoading, familyMembers.length, loadFamilyMembers]);

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
  }, [navigation, refresh, isLoading, familyLoading]);

  const handleAddFamilyMember = async () => {
    const phoneE164 = indianPhoneToE164(newMember.phone);
    if (!phoneE164) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    const result = await addFamilyMember(phoneE164, newMember.name || undefined, newMember.email || undefined);
    
    if (result.success) {
      Alert.alert('Success', 'Family member added successfully!');
      setShowAddMemberModal(false);
      setNewMember({ phone: '+91', name: '', email: '' });
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
  const canAddMore = familyMembers.length < maxMembers;

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

        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <MaterialIcons name="info" size={20} color="#4BA8FF" />
          <Text style={styles.infoText}>
            Add up to {maxMembers} family members (including yourself) to share your subscription.
          </Text>
        </View>

        {/* Family Members Count */}
        <View style={styles.countSection}>
          <Text style={styles.countText}>
            {familyMembers.length} / {maxMembers} members
          </Text>
        </View>

        {/* Add Member Button */}
        {canAddMore && (
          <TouchableOpacity
            style={styles.addMemberButton}
            onPress={() => setShowAddMemberModal(true)}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.addMemberButtonText}>Add Family Member</Text>
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
                    <MaterialIcons name="person" size={24} color="#4BA8FF" />
                    <Text style={styles.memberName}>
                      {member.name || 'Unnamed Member'}
                    </Text>
                  </View>
                  <Text style={styles.memberPhone}>{member.phone}</Text>
                  {member.email && (
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  )}
                  {member.activated_at && (
                    <Text style={styles.memberActivated}>
                      Activated: {new Date(member.activated_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.removeMemberButton}
                  onPress={() => handleRemoveFamilyMember(member.id, member.name || 'this member')}
                >
                  <MaterialIcons name="delete" size={20} color="#e74c3c" />
                </TouchableOpacity>
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
              <Text style={styles.modalTitle}>Add Family Member</Text>
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
                  onChangeText={(text) => setNewMember(prev => ({ ...prev, phone: normalizeIndianPhoneInput(text) }))}
                  placeholder="+91 XXXXX XXXXX"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newMember.name}
                  onChangeText={(text) => setNewMember(prev => ({ ...prev, name: text }))}
                  placeholder="Enter member name"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newMember.email}
                  onChangeText={(text) => setNewMember(prev => ({ ...prev, email: text }))}
                  placeholder="Enter member email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setShowAddMemberModal(false);
                  setNewMember({ phone: '+91', name: '', email: '' });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addButton, !newMember.phone.trim() && styles.addButtonDisabled]}
                onPress={handleAddFamilyMember}
                disabled={!newMember.phone.trim()}
              >
                <Text style={styles.addButtonText}>Add Member</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default FamilyScreen;





