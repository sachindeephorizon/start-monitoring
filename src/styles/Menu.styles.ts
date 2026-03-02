import { StyleSheet } from 'react-native';

// Design tokens specific to menu/navigation
export const MENU_TOKENS = {
  // Z-index management for proper layering
  zIndex: {
    overlay: 99999,
    container: 100000,
  },
  
  // Menu dimensions and positioning
  dimensions: {
    width: 280,
    closeButtonSize: 30,
  },
  
  // Menu colors extending the design system
  colors: {
    overlay: 'rgba(0, 0, 0, 0.5)',
    background: '#ffffff',
    headerBackground: '#1f2937',
    headerText: '#ffffff',
    itemText: '#374151',
    divider: '#e5e7eb',
    itemBorder: '#f3f4f6',
    logoutText: '#CC0022',
  },
  
  // Spacing and layout
  spacing: {
    headerPadding: {
      horizontal: 20,
      vertical: 10,
      top: 20,
    },
    contentPadding: {
      top: 20,
    },
    itemPadding: {
      horizontal: 20,
      vertical: 16,
    },
    dividerMargin: 10,
  },
  
  // Typography
  typography: {
    title: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 24,
    },
    item: {
      fontSize: 16,
      fontWeight: '500' as const,
    },
    close: {
      fontSize: 24,
      fontWeight: '300' as const,
    },
  },
  
  // Shadow configuration
  shadow: {
    color: '#000',
    offset: { width: -2, height: 0 },
    opacity: 0.25,
    radius: 10,
    elevation: 10,
  },
};

export const menuStyles = StyleSheet.create({
  // Overlay and backdrop for slide menu
  slideMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: MENU_TOKENS.colors.overlay,
    zIndex: MENU_TOKENS.zIndex.overlay,
  },
  
  slideMenuBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  
  // Main menu container with proper positioning and shadows
  slideMenuContainer: {
    position: 'absolute',
    right: 0, // Position on the right side
    top: 0,
    width: MENU_TOKENS.dimensions.width,
    height: '100%',
    backgroundColor: MENU_TOKENS.colors.background,
    shadowColor: MENU_TOKENS.shadow.color,
    shadowOffset: MENU_TOKENS.shadow.offset,
    shadowOpacity: MENU_TOKENS.shadow.opacity,
    shadowRadius: MENU_TOKENS.shadow.radius,
    elevation: MENU_TOKENS.shadow.elevation,
    zIndex: MENU_TOKENS.zIndex.container,
  },
  
  // Header section styling
  slideMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: MENU_TOKENS.spacing.headerPadding.horizontal,
    paddingVertical: MENU_TOKENS.spacing.headerPadding.vertical,
    // paddingTop handled dynamically via safe area in component
    backgroundColor: MENU_TOKENS.colors.headerBackground,
    borderTopLeftRadius: 16,
    borderBottomWidth: 1,
    borderBottomColor: MENU_TOKENS.colors.divider,
  },
  
  slideMenuTitle: {
    fontSize: MENU_TOKENS.typography.title.fontSize,
    fontWeight: MENU_TOKENS.typography.title.fontWeight,
    color: MENU_TOKENS.colors.headerText,
    flex: 1,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: MENU_TOKENS.typography.title.lineHeight,
  },
  
  slideMenuLeft: {
    width: MENU_TOKENS.dimensions.closeButtonSize, // Same width as close button for balance
  },
  
  slideMenuClose: {
    width: MENU_TOKENS.dimensions.closeButtonSize,
    height: MENU_TOKENS.dimensions.closeButtonSize,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: MENU_TOKENS.dimensions.closeButtonSize / 2,
  },
  
  slideMenuCloseText: {
    fontSize: MENU_TOKENS.typography.close.fontSize,
    color: MENU_TOKENS.colors.headerText,
    fontWeight: MENU_TOKENS.typography.close.fontWeight,
  },
  
  // Content section styling
  slideMenuContent: {
    flex: 1,
    paddingTop: MENU_TOKENS.spacing.contentPadding.top,
  },
  
  slideMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: MENU_TOKENS.spacing.itemPadding.horizontal,
    paddingVertical: MENU_TOKENS.spacing.itemPadding.vertical,
    borderBottomWidth: 1,
    borderBottomColor: MENU_TOKENS.colors.itemBorder,
  },
  
  slideMenuItemText: {
    fontSize: MENU_TOKENS.typography.item.fontSize,
    color: MENU_TOKENS.colors.itemText,
    fontWeight: MENU_TOKENS.typography.item.fontWeight,
  },
  
  slideMenuDivider: {
    height: 1,
    backgroundColor: MENU_TOKENS.colors.divider,
    marginVertical: MENU_TOKENS.spacing.dividerMargin,
  },
  
  slideMenuLogout: {
    color: MENU_TOKENS.colors.logoutText,
    fontWeight: '600',
  },
  
  // Subscription menu item with trial badge
  subscriptionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 1,
  },
  
  trialBadge: {
    backgroundColor: '#4BA8FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  
  trialBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});

// Export individual style objects for flexible usage
export const slideMenuStyles = {
  overlay: menuStyles.slideMenuOverlay,
  backdrop: menuStyles.slideMenuBackdrop,
  container: menuStyles.slideMenuContainer,
  header: menuStyles.slideMenuHeader,
  title: menuStyles.slideMenuTitle,
  left: menuStyles.slideMenuLeft,
  close: menuStyles.slideMenuClose,
  closeText: menuStyles.slideMenuCloseText,
  content: menuStyles.slideMenuContent,
  item: menuStyles.slideMenuItem,
  itemText: menuStyles.slideMenuItemText,
  divider: menuStyles.slideMenuDivider,
  logout: menuStyles.slideMenuLogout,
};

export default menuStyles;

