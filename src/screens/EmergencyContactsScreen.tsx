import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  AppState,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { EmergencyContactsService, EmergencyContact, CreateEmergencyContactData } from '@/features/emergency-contacts/emergency-contacts.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';
import { withTimeout } from '@/core/net/supabaseQuery';

interface EmergencyContactsScreenProps {
  navigation: any;
}

const EmergencyContactsScreen: React.FC<EmergencyContactsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  // iOS: never hard-block the entire screen behind a full-page spinner on cold start.
  // We render immediately and refresh in the background (similar to Profile).
  const [loading, setLoading] = useState(Platform.OS === 'ios' ? false : true);
  const [refreshing, setRefreshing] = useState(false);
  const focusReloadInFlightRef = useRef(false);
  // iOS-only: avoid duplicate initial loads and enable instant cached render
  const iosLoadInFlightRef = useRef(false);
  const iosLastLoadTsRef = useRef(0);
  const latestContactsLenRef = useRef(0);
  // iOS-only: auto-retry a few times on cold start timeouts (removes "swipe up to load")
  const iosRetryCancelRef = useRef<(() => void) | null>(null);
  const iosRetryCountRef = useRef(0);
  const iosLastFailureWasTimeoutRef = useRef(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [newContact, setNewContact] = useState<CreateEmergencyContactData>({
    contact_name: '',
    contact_phone: '+91',
    contact_email: '',
    relationship: ''
  });

  const CONTACTS_SNAPSHOT_KEY = 'deephorizon.emergencyContactsSnapshot.v1';
  const persistContactsSnapshot = async (next: EmergencyContact[]) => {
    if (Platform.OS !== 'ios') return;
    try {
      await AsyncStorage.setItem(
        CONTACTS_SNAPSHOT_KEY,
        JSON.stringify({ savedAt: Date.now(), contacts: next || [] })
      );
    } catch {
      // non-critical
    }
  };

  useEffect(() => {
    latestContactsLenRef.current = contacts.length;
  }, [contacts.length]);

  const loadContacts = async () => {
    let shouldEndLoading = true;
    try {
      // iOS: avoid duplicate requests when mount+focus fire close together
      if (Platform.OS === 'ios') {
        const now = Date.now();
        if (iosLoadInFlightRef.current) return;
        if (now - iosLastLoadTsRef.current < 750) return;
        iosLastLoadTsRef.current = now;
        iosLoadInFlightRef.current = true;
      }

      // Only show blocking loader if we have nothing yet (keeps UI instant when cached)
      if (latestContactsLenRef.current === 0) {
        setLoading(true);
      }
      console.log('[EmergencyContactsScreen] Loading contacts...');
      const timeoutMs = Platform.OS === 'ios' ? 15000 : 5000;
      const { contacts: userContacts, error } = await withTimeout(
        EmergencyContactsService.getUserContacts(),
        timeoutMs
      );
      
      console.log('[EmergencyContactsScreen] Loaded contacts:', userContacts?.length || 0, 'Error:', error);
      
      if (error) {
        console.error('[EmergencyContactsScreen] Error loading contacts:', error);
        // Don't show alert for sync errors or timeouts, just log them
        if (!error.includes('sync') && !error.includes('timed out')) {
          Alert.alert('Error', `Failed to load contacts: ${error}`);
        }
      }
      
      const nextContacts = userContacts || [];
      setContacts(nextContacts);
      persistContactsSnapshot(nextContacts).catch(() => {});
      iosRetryCountRef.current = 0;
      iosLastFailureWasTimeoutRef.current = false;
    } catch (error: any) {
      console.error('[EmergencyContactsScreen] Exception loading contacts:', error);
      const isTimeout = String(error?.message || '').includes('timed out') || String(error?.message || '').includes('Request timed out');

      if (Platform.OS === 'ios' && isTimeout) {
        iosLastFailureWasTimeoutRef.current = true;
        if (!iosRetryCancelRef.current && iosRetryCountRef.current < 3) {
          iosRetryCountRef.current += 1;
          const delay = iosRetryCountRef.current === 1 ? 400 : iosRetryCountRef.current === 2 ? 1200 : 2500;
          shouldEndLoading = false;
          iosRetryCancelRef.current = setTimeout(() => {
            iosRetryCancelRef.current = null;
            loadContacts().catch(() => {});
          }, delay) as any;
        } else {
          // Exhausted retries: allow empty fallback
          shouldEndLoading = true;
          setContacts([]);
        }
        return;
      }
      Alert.alert('Error', 'Failed to load emergency contacts');
      setContacts([]); // Set empty array on error
    } finally {
      // 🔥 CRITICAL FIX: Always set loading to false
      if (shouldEndLoading) {
        setLoading(false);
      }
      if (Platform.OS === 'ios') {
        iosLoadInFlightRef.current = false;
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  // iOS-only: hydrate cached contacts instantly, then refresh in background.
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      loadContacts();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CONTACTS_SNAPSHOT_KEY);
        if (cancelled) return;
        if (raw) {
          const parsed = JSON.parse(raw) as any;
          const cached = (parsed?.contacts as EmergencyContact[]) || [];
          if (Array.isArray(cached) && cached.length > 0) {
            setContacts(cached);
            setLoading(false);
          }
        }
      } catch {
        // non-critical
      }
      loadContacts().catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // iOS-only: if the app becomes active and we previously timed out, retry once more.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (iosLastFailureWasTimeoutRef.current && contacts.length === 0 && !focusReloadInFlightRef.current) {
          loadContacts().catch(() => {});
        }
      }
    });
    return () => {
      sub.remove();
      if (iosRetryCancelRef.current) {
        clearTimeout(iosRetryCancelRef.current as any);
        iosRetryCancelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts.length]);

  // Reload contacts when screen comes into focus (but only if not already loading)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // iOS-only: always attempt refresh on focus; guard to prevent concurrent loads.
      // This fixes cases where the first load doesn't run until an iOS UI/AppState "nudge".
      if (Platform.OS === 'ios') {
        if (focusReloadInFlightRef.current) return;
        focusReloadInFlightRef.current = true;
        Promise.resolve()
          .then(() => loadContacts())
          .finally(() => {
            focusReloadInFlightRef.current = false;
          });
        return;
      }

      // Android: keep existing behavior
      if (!loading) {
        loadContacts();
      }
    });

    return unsubscribe;
  }, [navigation, loading]);

  const handleAddContact = async () => {
    const phoneE164 = indianPhoneToE164(newContact.contact_phone);
    if (!newContact.contact_name || !phoneE164) {
      Alert.alert('Error', 'Please fill in name and phone number.');
      return;
    }

    try {
      const { contact, error } = await EmergencyContactsService.createContact({
        ...newContact,
        contact_phone: phoneE164,
      });
      
      if (error) {
        Alert.alert('Error', `Failed to add contact: ${error}`);
        return;
      }

      if (contact) {
        setContacts(prev => {
          const next = [contact, ...prev];
          persistContactsSnapshot(next).catch(() => {});
          return next;
        });
        setNewContact({
          contact_name: '',
          contact_phone: '+91',
          contact_email: '',
          relationship: ''
        });
        setShowAddForm(false);
        Alert.alert('Success', 'Emergency contact added successfully!');
      }
    } catch (error) {
      console.error('Error adding contact:', error);
      Alert.alert('Error', 'Failed to add emergency contact');
    }
  };

  const handleEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setNewContact({
      contact_name: contact.contact_name,
      contact_phone: normalizeIndianPhoneInput(contact.contact_phone),
      contact_email: contact.contact_email || '',
      relationship: contact.relationship || ''
    });
    setShowAddForm(true);
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;
    
    const phoneE164 = indianPhoneToE164(newContact.contact_phone);
    if (!newContact.contact_name || !phoneE164) {
      Alert.alert('Error', 'Please fill in name and phone number.');
      return;
    }

    try {
      const { contact, error } = await EmergencyContactsService.updateContact(
        editingContact.id,
        { ...newContact, contact_phone: phoneE164 }
      );
      
      if (error) {
        Alert.alert('Error', `Failed to update contact: ${error}`);
        return;
      }

      if (contact) {
        setContacts(prev => {
          const next = prev.map(c => c.id === contact.id ? contact : c);
          persistContactsSnapshot(next).catch(() => {});
          return next;
        });
        setNewContact({
          contact_name: '',
          contact_phone: '+91',
          contact_email: '',
          relationship: ''
        });
        setEditingContact(null);
        setShowAddForm(false);
        Alert.alert('Success', 'Emergency contact updated successfully!');
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      Alert.alert('Error', 'Failed to update emergency contact');
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    Alert.alert(
      'Delete Contact',
      'Are you sure you want to remove this emergency contact?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            try {
              const { success, error } = await EmergencyContactsService.deleteContact(contactId);
              
              if (error) {
                Alert.alert('Error', `Failed to delete contact: ${error}`);
                return;
              }

              if (success) {
                setContacts(prev => {
                  const next = prev.filter(contact => contact.id !== contactId);
                  persistContactsSnapshot(next).catch(() => {});
                  return next;
                });
                Alert.alert('Success', 'Contact deleted successfully');
              }
            } catch (error) {
              console.error('Error deleting contact:', error);
              Alert.alert('Error', 'Failed to delete contact');
            }
          }
        }
      ]
    );
  };

  const handleTestNotifications = async () => {
    if (contacts.length === 0) {
      Alert.alert('No Contacts', 'Please add emergency contacts first.');
      return;
    }

    Alert.alert(
      'Test Notifications',
      'Test emergency notifications will be sent to all configured contacts.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Send Test', 
          onPress: async () => {
            try {
              const { success, error } = await EmergencyContactsService.sendTestNotifications();
              
              if (error) {
                Alert.alert('Error', `Failed to send test: ${error}`);
                return;
              }

              if (success) {
                Alert.alert('Test Sent', 'Test emergency notification sent to all contacts.');
              }
            } catch (error) {
              console.error('Error sending test notifications:', error);
              Alert.alert('Error', 'Failed to send test notifications');
            }
          }
        }
      ]
    );
  };

  // Android-only: keep full-screen loader. iOS renders immediately (shows cached content if present).
  if (loading && Platform.OS !== 'ios') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3498db" />
        <Text style={styles.loadingText}>Loading emergency contacts...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Contacts</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowAddForm(true)}
        >
          <MaterialIcons name="add" size={24} color="#4BA8FF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* iOS-only: subtle inline loader while refreshing in background */}
        {Platform.OS === 'ios' && loading && contacts.length > 0 && (
          <View style={{ paddingVertical: 8, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#3498db" />
          </View>
        )}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <MaterialIcons name="info" size={20} color="#4BA8FF" />
            <Text style={styles.infoText}>
              Manage your emergency contacts for safety alerts and notifications.
            </Text>
          </View>
        </View>

        <View style={styles.contactsSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Configured Contacts ({contacts.length})</Text>
            {contacts.length > 0 && (
              <TouchableOpacity 
                style={styles.testButton}
                onPress={handleTestNotifications}
              >
                <MaterialIcons name="send" size={16} color="#ffffff" />
                <Text style={styles.testButtonText}>Test All</Text>
              </TouchableOpacity>
            )}
          </View>

          {contacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="contacts" size={64} color="#bdc3c7" />
              <Text style={styles.emptyTitle}>No Emergency Contacts</Text>
              <Text style={styles.emptyText}>
                Add emergency contacts to be notified when you trigger an emergency alert.
              </Text>
            </View>
          ) : (
            contacts.map((contact) => (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.contactHeader}>
                    <Text style={styles.contactName}>{contact.contact_name}</Text>
                  </View>
                  {contact.relationship && (
                    <Text style={styles.contactRelationship}>{contact.relationship}</Text>
                  )}
                  <Text style={styles.contactPhone}>{contact.contact_phone}</Text>
                  {contact.contact_email && (
                    <Text style={styles.contactEmail}>{contact.contact_email}</Text>
                  )}
                </View>

                <View style={styles.contactActions}>
                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => handleEditContact(contact)}
                  >
                    <MaterialIcons name="edit" size={20} color="#4BA8FF" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.actionButton}
                    onPress={() => handleDeleteContact(contact.id)}
                  >
                    <MaterialIcons name="delete" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {showAddForm && (
          <View style={styles.addFormSection}>
            <View style={styles.formHeader}>
              <Text style={styles.formTitle}>
                {editingContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
              </Text>
              <TouchableOpacity 
                onPress={() => {
                  setShowAddForm(false);
                  setEditingContact(null);
                  setNewContact({
                    contact_name: '',
                    contact_phone: '+91',
                    contact_email: '',
                    relationship: ''
                  });
                }}
              >
                <MaterialIcons name="close" size={24} color="#7f8c8d" />
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name *</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.contact_name}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, contact_name: text }))}
                  placeholder="Enter contact name"
                  placeholderTextColor="#bdc3c7"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.contact_phone}
                  onChangeText={(text) =>
                    setNewContact(prev => ({ ...prev, contact_phone: normalizeIndianPhoneInput(text) }))
                  }
                  placeholder="+91 XXXXX XXXXX"
                  placeholderTextColor="#bdc3c7"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.contact_email}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, contact_email: text }))}
                  placeholder="contact@example.com"
                  placeholderTextColor="#bdc3c7"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Relationship (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.relationship}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, relationship: text }))}
                  placeholder="e.g., Family, Friend, Colleague"
                  placeholderTextColor="#bdc3c7"
                />
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity 
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddForm(false);
                    setEditingContact(null);
                    setNewContact({
                      contact_name: '',
                      contact_phone: '+91',
                      contact_email: '',
                      relationship: ''
                    });
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.saveButton}
                  onPress={editingContact ? handleUpdateContact : handleAddContact}
                >
                  <Text style={styles.saveButtonText}>
                    {editingContact ? 'Update Contact' : 'Add Contact'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#7f8c8d',
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
  addButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  infoSection: {
    padding: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e3f2fd',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#2C3E50',
    marginLeft: 12,
    lineHeight: 20,
  },
  contactsSection: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3498db',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  testButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  contactCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  contactInfo: {
    flex: 1,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginRight: 8,
  },
  contactRelationship: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  contactPhone: {
    fontSize: 14,
    color: '#3498db',
    fontWeight: '500',
  },
  contactEmail: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  addFormSection: {
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
  },
  form: {
    padding: 16,
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
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  settingsSection: {
    backgroundColor: '#ffffff',
    marginBottom: 32,
  },
  settingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
  },
  settingButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#2C3E50',
    marginLeft: 12,
  },
});

export default EmergencyContactsScreen;
