import { StyleSheet, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');
const isSmallScreen = width < 375 || height < 667;

export const serviceCardStyles = StyleSheet.create({
  // Service Container and Grid Styles
  servicesContainer: {
    padding: 20,
    paddingTop: 10,
    paddingBottom: 20,
    flexGrow: 1,
  },
  servicesGridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  // Base Service Card Style
  serviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 24,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 12,
    transform: [{ perspective: 1000 }, { rotateX: '2deg' }],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(77, 168, 218, 0.1)',
    flex: 1,
    marginHorizontal: 5,
  },

  // Individual Service Card Variants
  videoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  trackingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  checkinCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  bodyguardCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  securityAgentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    minHeight: 80,
    borderRadius: 20,
    marginBottom: 12,
    shadowColor: '#4DA8DA',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 12,
  },

  // Service Card Text Styles
  serviceTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#2c3e50',
    marginTop: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  serviceSubtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '300',
  },
  securityAgentTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: '#2c3e50',
    letterSpacing: 0.3,
  },

  // Contact Icons for Security Agent Card
  contactIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingLeft: 16,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(77, 168, 218, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(77, 168, 218, 0.3)',
  },
  contactIconSpacing: {
    marginLeft: 8,
  },
});

