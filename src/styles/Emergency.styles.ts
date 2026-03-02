import { StyleSheet } from 'react-native';

// Emergency color constants
const EMERGENCY_COLORS = {
  PRIMARY: '#CC0022',
  WHITE_TEXT: '#ffffff',
  WHITE_BORDER: 'rgba(255, 255, 255, 0.3)',
  SHADOW: '#CC0022',
  SIREN_DARK: '#1a1a1a',
  SIREN_ACTIVE: '#e74c3c',
  SIREN_BORDER: '#ffffff',
  BLACK_OVERLAY: 'rgba(0, 0, 0, 0.8)',
  DARK_BORDER: 'rgba(255, 255, 255, 0.1)',
};

// Emergency dimensions
const EMERGENCY_DIMENSIONS = {
  BORDER_RADIUS: 12,
  BUTTON_PADDING_V: 10,
  BUTTON_PADDING_H: 14,
  ARROW_MARGIN: 12,
  STOP_BUTTON_PADDING_H: 24,
  STOP_BUTTON_PADDING_V: 16,
  STOP_BUTTON_RADIUS: 12,
};

// Glassmorphism shadow
const GLASSMORPHISM_SHADOW = {
  SHADOW_OFFSET: { width: 0, height: 4 },
  SHADOW_OPACITY: 0.25,
  SHADOW_RADIUS: 8,
  ELEVATION: 6,
};

// Z-index levels
const Z_INDEX_LEVELS = {
  EMERGENCY_BUTTON: 100,
  SIREN_OVERLAY: 10000,
  HIDDEN_CAMERA: -1,
};

export const emergencyStyles = StyleSheet.create({
  // Base Shared Styles
  baseActionButton: {
    backgroundColor: EMERGENCY_COLORS.PRIMARY,
    borderRadius: EMERGENCY_DIMENSIONS.BORDER_RADIUS,
    paddingVertical: EMERGENCY_DIMENSIONS.BUTTON_PADDING_V,
    paddingHorizontal: EMERGENCY_DIMENSIONS.BUTTON_PADDING_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: EMERGENCY_COLORS.WHITE_BORDER,
    shadowColor: EMERGENCY_COLORS.SHADOW,
    shadowOffset: GLASSMORPHISM_SHADOW.SHADOW_OFFSET,
    shadowOpacity: GLASSMORPHISM_SHADOW.SHADOW_OPACITY,
    shadowRadius: GLASSMORPHISM_SHADOW.SHADOW_RADIUS,
    elevation: GLASSMORPHISM_SHADOW.ELEVATION,
    overflow: 'hidden',
  },
  
  actionIconContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  
  actionTextContainer: {
    flex: 1,
  },
  
  actionMainText: {
    fontSize: 19,
    fontWeight: '700',
    color: EMERGENCY_COLORS.WHITE_TEXT,
    letterSpacing: 0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  
  actionSubText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 3,
    fontWeight: '400',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  
  actionArrow: {
    marginLeft: EMERGENCY_DIMENSIONS.ARROW_MARGIN,
  },

  // Emergency-Specific Styles
  emergencySection: {
    position: 'relative',
    left: 0,
    right: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    zIndex: Z_INDEX_LEVELS.EMERGENCY_BUTTON,
    marginTop: 8,
    marginBottom: 8,
  },
  
  emergencyButton: {
    backgroundColor: EMERGENCY_COLORS.PRIMARY,
    borderRadius: EMERGENCY_DIMENSIONS.BORDER_RADIUS,
    paddingVertical: EMERGENCY_DIMENSIONS.BUTTON_PADDING_V,
    paddingHorizontal: EMERGENCY_DIMENSIONS.BUTTON_PADDING_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: EMERGENCY_COLORS.WHITE_BORDER,
    shadowColor: EMERGENCY_COLORS.SHADOW,
    shadowOffset: GLASSMORPHISM_SHADOW.SHADOW_OFFSET,
    shadowOpacity: GLASSMORPHISM_SHADOW.SHADOW_OPACITY,
    shadowRadius: GLASSMORPHISM_SHADOW.SHADOW_RADIUS,
    elevation: GLASSMORPHISM_SHADOW.ELEVATION,
    overflow: 'hidden',
  },
  
  emergencyCountdownContainer: {
    backgroundColor: EMERGENCY_COLORS.PRIMARY,
    borderRadius: EMERGENCY_DIMENSIONS.BORDER_RADIUS,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: EMERGENCY_COLORS.WHITE_BORDER,
    shadowColor: EMERGENCY_COLORS.SHADOW,
    shadowOffset: GLASSMORPHISM_SHADOW.SHADOW_OFFSET,
    shadowOpacity: GLASSMORPHISM_SHADOW.SHADOW_OPACITY,
    shadowRadius: GLASSMORPHISM_SHADOW.SHADOW_RADIUS,
    elevation: GLASSMORPHISM_SHADOW.ELEVATION,
    overflow: 'hidden',
  },
  
  emergencyCountdownText: {
    color: EMERGENCY_COLORS.WHITE_TEXT,
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  emergencyCountdownLabel: {
    color: EMERGENCY_COLORS.WHITE_TEXT,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 5,
  },

  // Siren-Specific Styles
  sirenSection: {
    marginHorizontal: 0,
    paddingHorizontal: 0,
    marginVertical: 8,
    width: '100%',
  },
  
  sirenButton: {
    backgroundColor: EMERGENCY_COLORS.SIREN_DARK,
    borderRadius: EMERGENCY_DIMENSIONS.BORDER_RADIUS,
    paddingVertical: EMERGENCY_DIMENSIONS.BUTTON_PADDING_V,
    paddingHorizontal: EMERGENCY_DIMENSIONS.BUTTON_PADDING_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: EMERGENCY_COLORS.DARK_BORDER,
    shadowColor: EMERGENCY_COLORS.SIREN_DARK,
    shadowOffset: GLASSMORPHISM_SHADOW.SHADOW_OFFSET,
    shadowOpacity: GLASSMORPHISM_SHADOW.SHADOW_OPACITY,
    shadowRadius: GLASSMORPHISM_SHADOW.SHADOW_RADIUS,
    elevation: GLASSMORPHISM_SHADOW.ELEVATION,
    overflow: 'hidden',
    width: '100%',
  },
  
  sirenButtonActive: {
    backgroundColor: EMERGENCY_COLORS.SIREN_ACTIVE,
    borderColor: EMERGENCY_COLORS.SIREN_BORDER,
    shadowColor: EMERGENCY_COLORS.SIREN_ACTIVE,
  },
  
  sirenFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1.0,
    zIndex: Z_INDEX_LEVELS.SIREN_OVERLAY,
    pointerEvents: 'auto',
    elevation: Z_INDEX_LEVELS.SIREN_OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  sirenStopButtonContainer: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
  },
  
  sirenStopButton: {
    backgroundColor: EMERGENCY_COLORS.BLACK_OVERLAY,
    paddingHorizontal: EMERGENCY_DIMENSIONS.STOP_BUTTON_PADDING_H,
    paddingVertical: EMERGENCY_DIMENSIONS.STOP_BUTTON_PADDING_V,
    borderRadius: EMERGENCY_DIMENSIONS.STOP_BUTTON_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: EMERGENCY_COLORS.WHITE_TEXT,
  },
  
  sirenStopButtonText: {
    color: EMERGENCY_COLORS.WHITE_TEXT,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },

  // Hidden Camera Styles
  hiddenCameraContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
    zIndex: Z_INDEX_LEVELS.HIDDEN_CAMERA,
  },
  
  hiddenCamera: {
    width: 1,
    height: 1,
  },
});

