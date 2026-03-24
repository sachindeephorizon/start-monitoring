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
import { indianPhoneToE164, normalizeIndianPhoneInput } from '@/utils/phone';
import { deleteEmergencyContact, EmergencyContact, getEmergencyContacts, updateEmergencyContact } from '@/api/emergency-contacts';

interface EmergencyContactsScreenProps {
  navigation: any;
}

const EmergencyContactsScreen: React.FC<EmergencyContactsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  // iOS: never hard-block the entire screen behind a full-page spinner on cold start.
  // We render immediately and refresh in the background (similar to Profile).
  const [loading, setLoading] = useState(Platform.OS === 'ios' ? false : true);
  const [refreshing, setRefreshing] = useState(false);
  const focusReloadInFlightRef = useRef(false);
  const latestContactsLenRef = useRef(0);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);


  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

const [newContact, setNewContact] = useState({
  emergencyContact: '',
  emergencyContactPhone: '+91',
  emergencyContactRelation: '',
  emergencyContactEmail: ''
});
  

  useEffect(() => {
    latestContactsLenRef.current = contacts.length;
  }, [contacts.length]);

  const loadContacts = async () => {
  try {
    if (latestContactsLenRef.current === 0) {
      setLoading(true);
    }

    const userContacts = await getEmergencyContacts();

    const nextContacts = userContacts || [];
    setContacts(nextContacts);
  
  } catch (error) {
    console.error('[EmergencyContactsScreen] Error:', error);
    Alert.alert('Error', 'Failed to load emergency contacts');
    setContacts([]);
  } finally {
    setLoading(false);
  }
};

useEffect(() => {
  loadContacts();
}, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };


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
  const phone = indianPhoneToE164(newContact.emergencyContactPhone);

  if (!newContact.emergencyContact || !phone) {
    Alert.alert('Error', 'Please fill in name and phone number.');
    return;
  }

  try {
    const payload = [
      ...contacts.map(c => ({
        emergencyContact: c.emergencyContact,
        emergencyContactPhone: c.emergencyContactPhone,
        emergencyContactRelation: c.emergencyContactRelation || '',
        emergencyContactEmail: c.emergencyContactEmail || ''
      })),
      {
        emergencyContact: newContact.emergencyContact,
        emergencyContactPhone: phone,
        emergencyContactRelation: newContact.emergencyContactRelation || '',
        emergencyContactEmail: newContact.emergencyContactEmail || ''
      }
    ];

    await updateEmergencyContact(payload);
    await loadContacts();

    setNewContact({
      emergencyContact: '',
      emergencyContactPhone: '+91',
      emergencyContactRelation: '',
      emergencyContactEmail: ''
    });

    setShowAddForm(false);

    Alert.alert('Success', 'Emergency contact added successfully!');
  } catch (error) {
    console.error(error);
    Alert.alert('Error', 'Failed to add emergency contact');
  }
};

  const handleEditContact = (contact: EmergencyContact) => {
  setEditingContact(contact);
  setNewContact({
    emergencyContact: contact.emergencyContact,
    emergencyContactPhone: normalizeIndianPhoneInput(contact.emergencyContactPhone),
    emergencyContactRelation: contact.emergencyContactRelation || '',
    emergencyContactEmail: contact.emergencyContactEmail || ''
  });
  setShowAddForm(true);
};

 const handleUpdateContact = async () => {
  if (!editingContact) return;

  const phone = indianPhoneToE164(newContact.emergencyContactPhone);

  if (!newContact.emergencyContact || !phone) {
    Alert.alert('Error', 'Please fill in name and phone number.');
    return;
  }

  try {
    const payload = contacts.map(c =>
      c.id === editingContact.id
        ? {
            emergencyContact: newContact.emergencyContact,
            emergencyContactPhone: phone,
            emergencyContactRelation: newContact.emergencyContactRelation || '',
            emergencyContactEmail: newContact.emergencyContactEmail || ''
          }
        : {
            emergencyContact: c.emergencyContact,
            emergencyContactPhone: c.emergencyContactPhone,
            emergencyContactRelation: c.emergencyContactRelation || '',
            emergencyContactEmail: c.emergencyContactEmail || ''
          }
    );

    await updateEmergencyContact(payload);
    await loadContacts();

    setNewContact({
      emergencyContact: '',
      emergencyContactPhone: '+91',
      emergencyContactRelation: '',
      emergencyContactEmail: ''
    });

    setEditingContact(null);
    setShowAddForm(false);

    Alert.alert('Success', 'Emergency contact updated successfully!');
  } catch (error) {
    console.error(error);
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
            await deleteEmergencyContact(contactId);
            await loadContacts();
            Alert.alert('Success', 'Contact deleted successfully');
          } catch (error) {
            console.error(error);
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
                    <Text style={styles.contactName}>{contact.emergencyContact}</Text>
                  </View>
                  {contact.emergencyContactRelation && (
                    <Text style={styles.contactRelationship}>{contact.emergencyContactRelation}</Text>
                  )}
                  <Text style={styles.contactPhone}>{contact.emergencyContactPhone}</Text>
                  {contact.emergencyContactEmail && (
                    <Text style={styles.contactEmail}>{contact.emergencyContactEmail}</Text>
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
                    emergencyContact: '',
                    emergencyContactPhone: '+91',
                    emergencyContactRelation: '',
                    emergencyContactEmail: ''
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
                  value={newContact.emergencyContact}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, emergencyContact: text }))}
                  placeholder="Enter contact name"
                  placeholderTextColor="#bdc3c7"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.emergencyContactPhone}
                  onChangeText={(text) =>
                    setNewContact(prev => ({ ...prev, emergencyContactPhone: normalizeIndianPhoneInput(text) }))
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
                  value={newContact.emergencyContactEmail}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, emergencyContactEmail: text }))}
                  placeholder="contact@example.com"
                  placeholderTextColor="#bdc3c7"
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Relationship (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newContact.emergencyContactRelation}
                  onChangeText={(text) => setNewContact(prev => ({ ...prev, emergencyContactRelation: text }))}
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
                      emergencyContact: '',
                      emergencyContactPhone: '+91',
                      emergencyContactEmail: '',
                      emergencyContactRelation: ''
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
