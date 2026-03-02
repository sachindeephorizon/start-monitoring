/**
 * History Screen - UI Only
 * 
 * Displays user activity history.
 * This is a pure UI component with no background processing.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { HistoryService, HistoryItem } from '@/features/history/history.service';
import { useAuth } from '@/core/auth';

interface HistoryScreenProps {
  navigation: any;
}

const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { isAuthReady } = auth;
  const userId = auth.status === 'authenticated' ? auth.user.id : null;
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      // 20s timeout to prevent infinite loading spinner
      const data = await Promise.race([
        HistoryService.getUserHistory(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('History load timed out')), 20000)),
      ]);
      setHistoryData(data || []);
    } catch (error: any) {
      console.error('Failed to load history:', error);
      setLoadError(error?.message?.includes('timed out') ? 'Request timed out. Pull down to refresh.' : 'Failed to load history. Pull down to refresh.');
      setHistoryData([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  useEffect(() => {
    if (!isAuthReady || !userId) {
      return;
    }
    loadHistory();
  }, [isAuthReady, userId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#27ae60';
      case 'active':
        return '#4BA8FF';
      default:
        return '#7f8c8d';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <MaterialIcons name="check-circle" size={16} color="#27ae60" />;
      case 'active':
        return <MaterialIcons name="play-circle" size={16} color="#4BA8FF" />;
      default:
        return <MaterialIcons name="help" size={16} color="#7f8c8d" />;
    }
  };

  const getTypeIcon = (type: HistoryItem['type']) => {
    switch (type) {
      case 'tracking':
        return <MaterialIcons name="location-on" size={24} color="#3498db" />;
      case 'checkin':
        return <MaterialIcons name="check-circle" size={24} color="#27ae60" />;
      case 'emergency':
        return <MaterialIcons name="warning" size={24} color="#e74c3c" />;
      case 'video_call':
        return <MaterialIcons name="videocam" size={24} color="#9b59b6" />;
      case 'audio_call':
        return <MaterialIcons name="call" size={24} color="#4BA8FF" />;
      case 'bodyguard':
        return <MaterialIcons name="security" size={24} color="#f39c12" />;
      default:
        return <MaterialIcons name="info" size={24} color="#7f8c8d" />;
    }
  };

  const getTypeLabel = (type: HistoryItem['type']) => {
    switch (type) {
      case 'tracking':
        return 'Tracking Session';
      case 'checkin':
        return 'Check-in';
      case 'emergency':
        return 'Emergency Alert';
      case 'video_call':
        return 'Video Call';
      case 'audio_call':
        return 'Audio Call';
      case 'bodyguard':
        return 'Bodyguard Booking';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid date';
      }
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  const formatTime = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid time';
      }
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (error) {
      console.error('Error formatting time:', error);
      return 'Invalid time';
    }
  };

  const formatDuration = (startTime: string, endTime?: string): string | null => {
    if (!endTime) return null;
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return null;
      }
      const diffMs = end.getTime() - start.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      
      if (diffHours > 0) {
        const remainingMinutes = diffMinutes % 60;
        return `${diffHours}h ${remainingMinutes}m`;
      } else if (diffMinutes > 0) {
        return `${diffMinutes}m`;
      } else {
        return `${diffSeconds}s`;
      }
    } catch (error) {
      console.error('Error formatting duration:', error);
      return null;
    }
  };

  const getDetails = (item: HistoryItem): string => {
    if (item.metadata?.description) {
      return item.metadata.description;
    }
    if (item.metadata?.notes) {
      return item.metadata.notes;
    }
    if (item.metadata?.reason) {
      return item.metadata.reason;
    }
    if (item.metadata?.city) {
      return `City: ${item.metadata.city}`;
    }
    if (item.type === 'video_call' || item.type === 'audio_call') {
      const duration = item.metadata?.duration;
      if (duration) {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `Duration: ${minutes}m ${seconds}s`;
      }
    }
    return 'No additional details';
  };

  const renderHistoryItem = ({ item }: { item: HistoryItem }) => {
    const dateStr = formatDate(item.started_at);
    const timeStr = formatTime(item.started_at);
    const duration = formatDuration(item.started_at, item.ended_at) || item.metadata?.duration;
    const details = getDetails(item);
    
    return (
      <View style={styles.historyItem}>
      <View style={styles.historyItemHeader}>
        <View style={styles.typeIcon}>
          {getTypeIcon(item.type)}
        </View>
        <View style={styles.historyItemInfo}>
          <Text style={styles.historyItemTitle}>{item.title}</Text>
          <Text style={styles.historyItemType}>{getTypeLabel(item.type)}</Text>
        </View>
        <View style={styles.statusBadge}>
          {getStatusIcon(item.status)}
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>
      
      <View style={styles.historyItemDetails}>
        <View style={styles.detailRow}>
          <MaterialIcons name="calendar-today" size={16} color="#7f8c8d" />
          <Text style={styles.detailText}>{dateStr}</Text>
          <MaterialIcons name="access-time" size={16} color="#7f8c8d" style={{ marginLeft: 16 }} />
          <Text style={styles.detailText}>{timeStr}</Text>
        </View>
        
        {duration && (
          <View style={styles.detailRow}>
            <MaterialIcons name="timer" size={16} color="#7f8c8d" />
            <Text style={styles.detailText}>
              Duration: {typeof duration === 'number' 
                ? `${Math.floor(duration / 60)}m ${duration % 60}s`
                : duration}
            </Text>
          </View>
        )}
        
        <Text style={styles.historyItemDescription}>{details}</Text>
      </View>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Home');
          }
        }} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
          <MaterialIcons name="refresh" size={24} color="#2C3E50" />
        </TouchableOpacity>
      </View>

      {loading && !loadError ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : loadError && historyData.length === 0 ? (
        <View style={styles.loadingContainer}>
          <MaterialIcons name="error-outline" size={48} color="#e74c3c" />
          <Text style={[styles.loadingText, { color: '#e74c3c', marginTop: 12 }]}>{loadError}</Text>
          <TouchableOpacity onPress={onRefresh} style={{ marginTop: 16, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#3498db', borderRadius: 8 }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={historyData}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContainer,
            historyData.length === 0 && styles.emptyListContainer
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={64} color="#bdc3c7" />
              <Text style={styles.emptyTitle}>No History Found</Text>
              <Text style={styles.emptyText}>
                Start using the app to see your activity history here.
              </Text>
            </View>
          }
        />
      )}
    </View>
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
  },
  refreshButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#7f8c8d',
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 400,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C3E50',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  historyItem: {
    backgroundColor: '#ffffff',
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeIcon: {
    marginRight: 12,
  },
  historyItemInfo: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  historyItemType: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  historyItemDetails: {
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  historyItemDescription: {
    fontSize: 14,
    color: '#34495e',
    lineHeight: 20,
    marginTop: 8,
  },
});

export default HistoryScreen;

