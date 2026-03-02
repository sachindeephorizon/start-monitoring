import { StyleSheet } from 'react-native';

export const trackingStyles = StyleSheet.create({
  // Tracking Button Container and Controls
  trackingButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  trackingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  startButtonActive: {
    backgroundColor: 'rgba(39, 174, 96, 0.9)',
  },
  endButtonActive: {
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
  },
  inactiveTrackingButton: {
    backgroundColor: 'rgba(189, 195, 199, 0.5)',
  },
  trackingButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeButtonText: {
    color: '#ffffff',
  },
  inactiveButtonText: {
    color: '#95a5a6',
  },

  // Tracking Status Card
  trackingStatusCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Enhanced 3D effect with blue shadow
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 168, 218, 0.08)',
  },
  trackingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  trackingTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#2c3e50',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#bdc3c7',
    marginRight: 8,
  },
  activeDot: {
    backgroundColor: '#27ae60',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
  },
  trackingDescription: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 16,
  },

  // Next Check-in and Progress
  nextCheckInContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  nextCheckInLabel: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 8,
  },
  countdownTimer: {
    fontSize: 32,
    fontWeight: '300',
    color: '#2c3e50',
    marginBottom: 12,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: 2,
  },

  // Location Card and Map Styles
  locationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Enhanced 3D effect with blue shadow
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 168, 218, 0.08)',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationCardTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginLeft: 8,
  },
  refreshLocationButton: {
    marginLeft: 'auto',
    padding: 4,
  },

  // Map Display
  mapPlaceholder: {
    height: 120,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  mapViewText: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 8,
  },
  mapSubtext: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Live Map Container
  liveMapContainer: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  liveIndicator: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  openMapsButton: {
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  openMapsText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '500',
  },
  mapWebView: {
    height: 200,
  },

  // Location Details
  locationDetails: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  addressText: {
    fontSize: 14,
    color: '#5a6c7d',
    textAlign: 'center',
    marginBottom: 4,
  },

  // History Card
  historyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Enhanced 3D effect with blue shadow
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 168, 218, 0.08)',
  },

  // History Section
  historyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: 4,
  },
  historySubtitle: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 16,
  },
  historyList: {
    gap: 12,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  historyContent: {
    flex: 1,
    marginLeft: 12,
  },
  historyTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
  },
  historyLocation: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  respondedBadge: {
    backgroundColor: '#2c3e50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  respondedText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '500',
  },

  // Emergency Contacts Section
  emergencyContactsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Enhanced 3D effect with blue shadow
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 168, 218, 0.08)',
  },
  emergencyContactsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: 4,
  },
  emergencyContactsSubtitle: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 16,
  },
  contactsList: {
    gap: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e67e22',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarOrange: {
    backgroundColor: '#f39c12',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
  },
  contactRelation: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phoneNumber: {
    fontSize: 12,
    color: '#5a6c7d',
  },

  // Action Button Styles (for main start/stop tracking actions)
  trackingActionButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  startTrackingButton: {
    backgroundColor: 'rgba(39, 174, 96, 0.9)',
  },
  endTrackingButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
  },
  trackingActionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});
