import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from './QuickStartScreen.styles';
import { searchPlaces, PlaceSuggestion } from '@/api/placesSearch';
import { useMonitoringSession, TripType as MonitoringTripType } from '@/features/monitoring/MonitoringSession';
import { useAuth } from '@/core/auth';
import { entryDetails } from '@/api/monitoring';

type TripType = 'cab' | 'walking' | 'meeting' | 'custom';

interface ContactItem {
  id: string;
  name: string;
  relation: string;
  initial: string;
  color: string;
  enabled: boolean;
}

const QUICK_DESTS = [
  { icon: 'home', label: 'Home' },
  { icon: 'business-center', label: 'Office' },
  { icon: 'star', label: 'Last visited' },
] as const;

const TRIP_TYPES: { value: TripType; label: string; icon: string }[] = [
  { value: 'cab', label: 'Cab / Car', icon: 'local-taxi' },
  { value: 'walking', label: 'Walking', icon: 'directions-walk' },
  { value: 'meeting', label: 'Meeting', icon: 'people' },
  { value: 'custom', label: 'Custom', icon: 'tune' },
];

const QuickStartScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [destination, setDestination] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [tripType, setTripType] = useState<TripType>('cab');
  const [contacts, setContacts] = useState<ContactItem[]>([
    { id: '1', name: 'Mom', relation: 'Primary contact', initial: 'M', color: '#7c3aed', enabled: true },
    { id: '2', name: 'Rahul bhai', relation: 'Emergency contact', initial: 'R', color: '#1d6fa4', enabled: false },
  ]);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suppressNextSearchRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    const q = destination.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const results = await searchPlaces(q, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setShowSuggestions(true);
          setSearching(false);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          setSearching(false);
          setSuggestions([]);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destination]);

  const handlePickSuggestion = (item: PlaceSuggestion) => {
    suppressNextSearchRef.current = true;
    setDestination(item.name);
    setDestinationCoords({ lat: item.lat, lng: item.lng });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const toggleContact = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)),
    );
  };

  const monitoring = useMonitoringSession();
  const auth = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const handleBegin = async () => {
    if (submitting) return;
    setSubmitting(true);
    monitoring.setTripType(tripType as MonitoringTripType);

    if (destinationCoords) {
      await monitoring.setDestination({
        lat: destinationCoords.lat,
        lng: destinationCoords.lng,
        name: destination || undefined,
      });
    }

    // Push the trip context to the /handling lifecycle store so the SOC
    // dashboard, check-in tier, and escalation paths see destination + contacts.
    if (auth.user?.id) {
      entryDetails(auth.user.id, {
        destination: destinationCoords
          ? {
              name: destination || 'Destination',
              lat: destinationCoords.lat,
              long: destinationCoords.lng,
            }
          : undefined,
        trip_type: tripType as MonitoringTripType,
        trusted_contacts: contacts.map((c) => ({
          name: c.name,
          relation: c.relation,
          notify: c.enabled,
        })),
      }).catch(() => {});
    }

    setSubmitting(false);
    navigation.replace('ActiveMonitoring');
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0f4c81', '#1d6fa4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView edges={['top']}>
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <MaterialIcons name="chevron-left" size={20} color="rgba(255,255,255,0.85)" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Monitoring Started</Text>
          <Text style={styles.headerSub}>Add details while we watch over you</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE · Session active</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>
            <MaterialIcons name="place" size={12} color="#6b7280" /> Where are you headed?
          </Text>
          <View style={styles.searchInput}>
            <MaterialIcons name="search" size={16} color="#9ca3af" />
            <TextInput
              style={styles.searchText}
              placeholder="Search destination..."
              placeholderTextColor="#9ca3af"
              value={destination}
              onChangeText={(t) => {
                setDestination(t);
                setShowSuggestions(true);
                if (destinationCoords) setDestinationCoords(null);
              }}
              onFocus={() => setShowSuggestions(true)}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color="#1d6fa4" />
            ) : destination.length > 0 ? (
              <Pressable
                onPress={() => {
                  setDestination('');
                  setDestinationCoords(null);
                  setSuggestions([]);
                }}
                hitSlop={8}
                style={styles.searchClear}
                accessibilityRole="button"
                accessibilityLabel="Clear destination"
              >
                <Text style={styles.searchClearText}>×</Text>
              </Pressable>
            ) : null}
          </View>

          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionList}>
              <FlatList
                data={suggestions}
                keyExtractor={(item, idx) => `${item.lat},${item.lng},${idx}`}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.suggestionItem}
                    onPress={() => handlePickSuggestion(item)}
                  >
                    <Text style={styles.suggestionText} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.suggestionCoords}>
                      {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          )}

          <View style={styles.chipRow}>
            {QUICK_DESTS.map((dest) => (
              <TouchableOpacity
                key={dest.label}
                style={styles.chip}
                onPress={() => {
                  suppressNextSearchRef.current = true;
                  setDestination(dest.label);
                  setShowSuggestions(false);
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons name={dest.icon as any} size={12} color="#1d4ed8" />
                <Text style={styles.chipText}>{dest.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardLabel, { marginBottom: 8 }]}>Trip type (auto-detected)</Text>
          <View style={styles.tripTypeRow}>
            {TRIP_TYPES.map((t) => {
              const selected = tripType === t.value;
              return (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.tripTypeChip, selected && styles.tripTypeChipSelected]}
                  onPress={() => setTripType(t.value)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Select trip type ${t.label}`}
                >
                  <MaterialIcons
                    name={t.icon as any}
                    size={18}
                    color={selected ? '#fff' : '#374151'}
                  />
                  <Text
                    style={[
                      styles.tripTypeText,
                      selected && styles.tripTypeTextSelected,
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardLabel, { marginBottom: 10 }]}>Notify trusted contacts</Text>
          {contacts.map((c) => (
            <View key={c.id} style={styles.contactRow}>
              <View style={[styles.contactAvatar, { backgroundColor: c.color }]}>
                <Text style={styles.contactInitial}>{c.initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.name}</Text>
                <Text style={styles.contactRel}>{c.relation}</Text>
              </View>
              <Switch
                value={c.enabled}
                onValueChange={() => toggleContact(c.id)}
                trackColor={{ false: '#d1d5db', true: '#1d6fa4' }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.beginButtonWrapper}
          onPress={handleBegin}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Begin monitoring with these settings"
        >
          <LinearGradient
            colors={['#0f4c81', '#1d6fa4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.beginButton}
          >
            <MaterialCommunityIcons name="play" size={18} color="#fff" />
            <Text style={styles.beginText}>Begin with these settings</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

export default QuickStartScreen;
