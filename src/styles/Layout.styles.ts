import { StyleSheet, Platform } from 'react-native';

export const layoutStyles = StyleSheet.create({
  // Main Container
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },

  // New Professional Header Styles
  newHeader: {
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
    minHeight: Platform.OS === 'ios' ? 88 : 80,
    maxHeight: Platform.OS === 'ios' ? 110 : 100,
    position: 'relative',
    zIndex: 10,
  },
  headerLeft: {
    width: 50,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoContainer: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoImage: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  newHeaderTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#2c3e50',
    letterSpacing: 0.5,
    textAlign: 'center',
    flexShrink: 1,
  },
  headerRight: {
    width: 50,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  menuDash: {
    width: 20,
    height: 2,
    backgroundColor: '#7f8c8d',
    marginVertical: 2,
    borderRadius: 1,
  },
});

