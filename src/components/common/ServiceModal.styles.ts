import { StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');
const modalMaxHeight = height * 0.85; // 85% of screen height

export const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    marginHorizontal: 20,
    maxHeight: modalMaxHeight, // Maximum height to allow space for keyboard
    minHeight: 400, // Minimum height to ensure content is visible
    width: width - 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    // Removed shadow properties for instant rendering
    // shadowColor: 'rgba(0, 0, 0, 0.1)',
    // shadowOffset: { width: 0, height: 10 },
    // shadowOpacity: 0.2,
    // shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden', // Ensure content doesn't overflow
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#2c3e50',
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  modalBody: {
    flex: 1, // Use flex to fill available space after header
  },
  modalBodyContent: {
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 20,
    // Don't use flexGrow here - let content determine size naturally
  },
});
