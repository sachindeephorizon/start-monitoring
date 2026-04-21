import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  monitoringButtonContainer: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 10,
    zIndex: 100,
  },
  newMonitoringButton: {
    backgroundColor: '#1B3A6B',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#0B2147',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  monitoringIconContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  monitoringTextContainer: {
    flex: 1,
  },
  monitoringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monitoringMainText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  newBadge: {
    marginLeft: 8,
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B2147',
    letterSpacing: 0.6,
  },
  monitoringSubText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 3,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  monitoringArrow: {
    marginLeft: 12,
  },
});
