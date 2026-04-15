/**
 * Initiate Safety Check — Dashboard (Family/Group Head)
 *
 * Lists all schedule check-ins the current user has assigned to
 * family/group members, with realtime status updates.
 * Includes recent terminal (COMPLETED / CANCELLED / ESCALATED)
 * check-ins within a 48h window so ONE_TIME outcomes stay visible.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { styles as familyStyles } from '@/styles/FamilyScreen.styles';
import { useSubscription } from '@/hooks/useSubscription';
import { useAssignedCheckIns } from '@/hooks/useAssignedCheckIns';
import type {
  AssignedCheckinItem,
  AssignedCheckinJobStatus,
  CheckinFrequency,
  CheckinStatus,
} from '@/api/schedule-checking';

interface InitiateSafetyCheckScreenProps {
  navigation: any;
}

const formatFrequencyLabel = (frequency: CheckinFrequency): string => {
  switch (frequency) {
    case 'DAILY': return 'Daily';
    case 'WEEKLY': return 'Weekly';
    case 'ONE_TIME':
    default: return 'One-time';
  }
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
};

const isTerminalSchedule = (status: CheckinStatus): boolean =>
  status === 'COMPLETED' || status === 'CANCELLED' || status === 'ESCALATED';

type Badge = { bg: string; fg: string; label: string };

// Badge driven by the schedule-level status when terminal,
// otherwise by the latest job's status.
const resolveBadge = (item: AssignedCheckinItem): Badge => {
  if (item.status === 'COMPLETED') {
    return { bg: '#E8F5E9', fg: '#2E7D32', label: 'Completed' };
  }
  if (item.status === 'CANCELLED') {
    return { bg: '#ECEFF1', fg: '#546E7A', label: 'Cancelled' };
  }
  if (item.status === 'ESCALATED') {
    return { bg: '#FFEBEE', fg: '#C62828', label: 'Escalated' };
  }
  // ACTIVE — use the latest job's status
  const jobStatus: AssignedCheckinJobStatus | undefined = item.lastJob?.status;
  switch (jobStatus) {
    case 'COMPLETED':
      return { bg: '#E8F5E9', fg: '#2E7D32', label: 'Last: Completed' };
    case 'SCHEDULED':
      return { bg: '#E3F2FD', fg: '#1565C0', label: 'Scheduled' };
    case 'MISSED':
      return { bg: '#FFEBEE', fg: '#C62828', label: 'Last: Missed' };
    case 'TIMEOUT':
      return { bg: '#FFF3E0', fg: '#E65100', label: 'Last: Timed Out' };
    case 'WRONG_PIN':
      return { bg: '#FFF3E0', fg: '#E65100', label: 'Last: Wrong Pin' };
    case 'CANCELED':
      return { bg: '#ECEFF1', fg: '#546E7A', label: 'Canceled' };
    default:
      return { bg: '#E3F2FD', fg: '#1565C0', label: 'Active' };
  }
};

const InitiateSafetyCheckScreen: React.FC<InitiateSafetyCheckScreenProps> = ({ navigation }) => {
  const {
    hasAccess,
    isFamilyPlan,
    isFamilyPlanOwner,
    isLoading: subLoading,
  } = useSubscription();

  const {
    assignedCheckIns,
    isLoading,
    refresh,
    cancel,
    recentWindowHours,
    setRecentWindowHours,
  } = useAssignedCheckIns();

  // Split ACTIVE vs terminal; sort each group newest-first.
  const { activeItems, terminalItems } = useMemo(() => {
    const active: AssignedCheckinItem[] = [];
    const terminal: AssignedCheckinItem[] = [];
    for (const item of assignedCheckIns) {
      (item.status === 'ACTIVE' ? active : terminal).push(item);
    }
    const byUpdatedDesc = (a: AssignedCheckinItem, b: AssignedCheckinItem) =>
      new Date(b.updatedAt || b.createdAt).getTime() -
      new Date(a.updatedAt || a.createdAt).getTime();
    active.sort(byUpdatedDesc);
    terminal.sort(byUpdatedDesc);
    return { activeItems: active, terminalItems: terminal };
  }, [assignedCheckIns]);

  const handleCancel = (item: AssignedCheckinItem) => {
    Alert.alert(
      'Cancel Safety Check',
      `Cancel the scheduled safety check for ${item.user.name || item.user.phone}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            const ok = await cancel(item.id);
            if (ok) {
              Alert.alert('Cancelled', 'The safety check has been cancelled.');
            }
          },
        },
      ],
    );
  };

  const renderCompactTerminalCard = (item: AssignedCheckinItem) => {
    const badge = resolveBadge(item);
    const hasStats =
      item.stats &&
      (item.stats.completed > 0 ||
        item.stats.missed > 0 ||
        item.stats.wrongPin > 0 ||
        item.stats.timeout > 0);
    return (
      <View key={item.id} style={rowStyles.compactCard}>
        <View style={rowStyles.compactTopRow}>
          <MaterialIcons name="person" size={18} color="#90A4AE" />
          <Text style={rowStyles.compactName} numberOfLines={1}>
            {item.user.name || 'Member'}
          </Text>
          <Text style={rowStyles.compactPhone} numberOfLines={1}>
            {item.user.phone}
          </Text>
          <View style={[rowStyles.compactPill, { backgroundColor: '#EEF5FF' }]}>
            <Text style={[rowStyles.compactPillText, { color: '#1565C0' }]}>
              {formatFrequencyLabel(item.frequency)}
            </Text>
          </View>
          <View style={[rowStyles.compactPill, { backgroundColor: badge.bg }]}>
            <Text style={[rowStyles.compactPillText, { color: badge.fg }]}>
              {badge.label}
            </Text>
          </View>
        </View>

        <View style={rowStyles.compactMetaRow}>
          <Text style={rowStyles.compactMeta} numberOfLines={1}>
            Ended: {formatDateTime(item.updatedAt)}
          </Text>
          {item.lastRunAt && (
            <>
              <View style={rowStyles.compactDot} />
              <Text style={rowStyles.compactMeta} numberOfLines={1}>
                Last run: {formatDateTime(item.lastRunAt)}
              </Text>
            </>
          )}
        </View>

        {hasStats && (
          <View style={rowStyles.compactStatsRow}>
            {item.stats.completed > 0 && (
              <Text style={[rowStyles.compactStatChip, rowStyles.statOk]}>
                ✓ {item.stats.completed}
              </Text>
            )}
            {item.stats.missed > 0 && (
              <Text style={[rowStyles.compactStatChip, rowStyles.statBad]}>
                Missed {item.stats.missed}
              </Text>
            )}
            {item.stats.wrongPin > 0 && (
              <Text style={[rowStyles.compactStatChip, rowStyles.statWarn]}>
                Wrong pin {item.stats.wrongPin}
              </Text>
            )}
            {item.stats.timeout > 0 && (
              <Text style={[rowStyles.compactStatChip, rowStyles.statWarn]}>
                Timeout {item.stats.timeout}
              </Text>
            )}
          </View>
        )}

        {item.remarks ? (
          <Text style={rowStyles.compactRemarks} numberOfLines={2}>
            {item.remarks}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderCard = (item: AssignedCheckinItem) => {
    const terminal = isTerminalSchedule(item.status);
    if (terminal) {
      return renderCompactTerminalCard(item);
    }
    const badge = resolveBadge(item);
    const hasStats =
      item.stats &&
      (item.stats.completed > 0 ||
        item.stats.missed > 0 ||
        item.stats.wrongPin > 0 ||
        item.stats.timeout > 0);

    return (
      <View
        key={item.id}
        style={[
          familyStyles.memberCard,
          terminal && rowStyles.terminalCard,
        ]}
      >
        <View style={familyStyles.memberInfo}>
          <View style={familyStyles.memberHeader}>
            <MaterialIcons
              name="person"
              size={24}
              color={terminal ? '#90A4AE' : '#4BA8FF'}
            />
            <Text
              style={[
                familyStyles.memberName,
                terminal && rowStyles.terminalText,
              ]}
            >
              {item.user.name || 'Member'}
            </Text>
          </View>
          <Text style={familyStyles.memberPhone}>{item.user.phone}</Text>

          <View style={rowStyles.metaRow}>
            <View style={[rowStyles.pill, { backgroundColor: '#EEF5FF' }]}>
              <Text style={[rowStyles.pillText, { color: '#1565C0' }]}>
                {formatFrequencyLabel(item.frequency)}
              </Text>
            </View>
            <View style={[rowStyles.pill, { backgroundColor: badge.bg }]}>
              <Text style={[rowStyles.pillText, { color: badge.fg }]}>
                {badge.label}
              </Text>
            </View>
          </View>

          {item.status === 'ACTIVE' ? (
            <Text style={rowStyles.metaLine}>
              Next: {formatDateTime(item.nextRunAt ?? item.startAt)}
            </Text>
          ) : (
            <Text style={rowStyles.metaLine}>
              Ended: {formatDateTime(item.updatedAt)}
            </Text>
          )}

          {item.lastRunAt && (
            <Text style={rowStyles.metaLine}>
              Last run: {formatDateTime(item.lastRunAt)}
            </Text>
          )}

          {hasStats && (
            <View style={rowStyles.statsRow}>
              {item.stats.completed > 0 && (
                <Text style={[rowStyles.statChip, rowStyles.statOk]}>
                  ✓ {item.stats.completed}
                </Text>
              )}
              {item.stats.missed > 0 && (
                <Text style={[rowStyles.statChip, rowStyles.statBad]}>
                  Missed {item.stats.missed}
                </Text>
              )}
              {item.stats.wrongPin > 0 && (
                <Text style={[rowStyles.statChip, rowStyles.statWarn]}>
                  Wrong pin {item.stats.wrongPin}
                </Text>
              )}
              {item.stats.timeout > 0 && (
                <Text style={[rowStyles.statChip, rowStyles.statWarn]}>
                  Timeout {item.stats.timeout}
                </Text>
              )}
            </View>
          )}

          {item.remarks ? (
            <Text style={rowStyles.remarks}>{item.remarks}</Text>
          ) : null}
        </View>

        {!terminal && (
          <TouchableOpacity
            style={familyStyles.removeMemberButton}
            onPress={() => handleCancel(item)}
          >
            <MaterialIcons name="cancel" size={20} color="#e74c3c" />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // Gate: only for family plan owners.
  if (!subLoading && (!hasAccess || !isFamilyPlan || !isFamilyPlanOwner)) {
    return (
      <SafeAreaView edges={['top']} style={familyStyles.container}>
        <View style={[familyStyles.header, { paddingTop: 10 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={familyStyles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
          </TouchableOpacity>
          <Text style={familyStyles.headerTitle}>Initiate Safety Check</Text>
          <View style={familyStyles.placeholder} />
        </View>
        <View style={familyStyles.emptyContainer}>
          <MaterialIcons name="lock" size={64} color="#bdc3c7" />
          <Text style={familyStyles.emptyTitle}>Only for Family Owners</Text>
          <Text style={familyStyles.emptyText}>
            Only the owner of a family plan can initiate safety checks for members.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const showEmpty =
    !isLoading && activeItems.length === 0 && terminalItems.length === 0;

  return (
    <SafeAreaView edges={['top']} style={familyStyles.container}>
      <View style={[familyStyles.header, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={familyStyles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#2C3E50" />
        </TouchableOpacity>
        <Text style={familyStyles.headerTitle}>Initiate Safety Check</Text>
        <View style={familyStyles.placeholder} />
      </View>

      <ScrollView
        style={familyStyles.content}
        contentContainerStyle={familyStyles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#4BA8FF" />
        }
      >
        <View style={familyStyles.infoBanner}>
          <MaterialIcons name="info" size={20} color="#4BA8FF" />
          <Text style={familyStyles.infoText}>
            Schedule a safety check for a family member. They'll be prompted to confirm they're safe
            at the scheduled time — and you'll see live status updates here.
          </Text>
        </View>

        <TouchableOpacity
          style={familyStyles.addMemberButton}
          onPress={() => navigation.navigate('AssignSafetyCheck')}
        >
          <MaterialIcons name="add" size={24} color="#fff" />
          <Text style={familyStyles.addMemberButtonText}>Assign New Safety Check</Text>
        </TouchableOpacity>

        {showEmpty ? (
          <View style={familyStyles.emptyFamilyContainer}>
            <MaterialIcons name="health-and-safety" size={64} color="#bdc3c7" />
            <Text style={familyStyles.emptyFamilyText}>No active safety checks</Text>
            <Text style={familyStyles.emptyFamilySubtext}>
              Tap the button above to schedule one for a family member.
            </Text>
          </View>
        ) : (
          <>
            {activeItems.length > 0 && (
              <>
                <Text style={rowStyles.sectionHeader}>
                  Active ({activeItems.length})
                </Text>
                <View style={familyStyles.membersList}>
                  {activeItems.map(renderCard)}
                </View>
              </>
            )}

            <View style={rowStyles.recentHeaderRow}>
              <Text style={rowStyles.sectionHeader}>
                Recent (last {recentWindowHours}h)
              </Text>
              <View style={rowStyles.toggleGroup}>
                {[24, 48].map((hrs) => {
                  const selected = recentWindowHours === hrs;
                  return (
                    <TouchableOpacity
                      key={hrs}
                      style={[
                        rowStyles.toggleOption,
                        selected && rowStyles.toggleOptionSelected,
                      ]}
                      onPress={() => setRecentWindowHours(hrs)}
                      disabled={selected}
                    >
                      <Text
                        style={[
                          rowStyles.toggleOptionText,
                          selected && rowStyles.toggleOptionTextSelected,
                        ]}
                      >
                        {hrs}h
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {isLoading ? (
              <View style={rowStyles.recentLoader}>
                <ActivityIndicator size="small" color="#4BA8FF" />
                <Text style={rowStyles.recentLoaderText}>Loading safety checks...</Text>
              </View>
            ) : terminalItems.length > 0 ? (
              <View style={familyStyles.membersList}>
                {terminalItems.map(renderCard)}
              </View>
            ) : (
              <Text style={rowStyles.recentEmpty}>
                No completed safety checks in this window.
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const rowStyles = StyleSheet.create({
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#546E7A',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaLine: {
    fontSize: 13,
    color: '#546E7A',
    marginTop: 2,
  },
  remarks: {
    fontSize: 13,
    color: '#37474F',
    marginTop: 6,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  statChip: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  statOk: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
  },
  statBad: {
    backgroundColor: '#FFEBEE',
    color: '#C62828',
  },
  statWarn: {
    backgroundColor: '#FFF3E0',
    color: '#E65100',
  },
  terminalCard: {
    opacity: 0.72,
    backgroundColor: '#FAFAFA',
  },
  terminalText: {
    color: '#546E7A',
  },
  compactCard: {
    backgroundColor: '#FAFAFA',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  compactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  compactName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
    maxWidth: 120,
  },
  compactPhone: {
    fontSize: 12,
    color: '#78909C',
    maxWidth: 110,
  },
  compactPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  compactPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
    flexWrap: 'wrap',
  },
  compactMeta: {
    fontSize: 11,
    color: '#78909C',
  },
  compactDot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: '#B0BEC5',
  },
  compactStatsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  compactStatChip: {
    fontSize: 10,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  compactRemarks: {
    fontSize: 11,
    color: '#546E7A',
    marginTop: 6,
    fontStyle: 'italic',
  },
  recentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
  },
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#ECEFF1',
    borderRadius: 999,
    padding: 2,
  },
  toggleOption: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  toggleOptionSelected: {
    backgroundColor: '#4BA8FF',
  },
  toggleOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#546E7A',
  },
  toggleOptionTextSelected: {
    color: '#ffffff',
  },
  recentEmpty: {
    fontSize: 13,
    color: '#90A4AE',
    fontStyle: 'italic',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  recentLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  recentLoaderText: {
    fontSize: 13,
    color: '#78909C',
  },
});

export default InitiateSafetyCheckScreen;
