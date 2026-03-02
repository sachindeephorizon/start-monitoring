import { StyleSheet } from 'react-native';

const formButtonStyles = StyleSheet.create({
  // Action Button Styles
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  locationButton: {
    backgroundColor: 'rgba(44, 62, 80, 0.9)',
    borderColor: 'rgba(44, 62, 80, 0.3)',
  },
  startButton: {
    backgroundColor: '#1f2937',
    borderColor: 'rgba(31, 41, 55, 0.3)',
  },
  stopButton: {
    backgroundColor: 'rgba(204, 0, 34, 0.9)',
    borderColor: 'rgba(204, 0, 34, 0.3)',
  },
  scheduleButton: {
    backgroundColor: 'rgba(44, 62, 80, 0.9)',
    borderColor: 'rgba(44, 62, 80, 0.3)',
  },
  cancelButton: {
    backgroundColor: 'rgba(127, 140, 141, 0.9)',
    borderColor: 'rgba(127, 140, 141, 0.3)',
  },
  bookButton: {
    backgroundColor: '#1f2937',
    borderColor: 'rgba(31, 41, 55, 0.3)',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Form Input Styles
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
  },
  dateText: {
    fontSize: 16,
    color: '#2c3e50',
    flex: 1,
    marginLeft: 8,
  },
  timeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
  },
  timeText: {
    fontSize: 16,
    color: '#2c3e50',
    flex: 1,
    marginLeft: 8,
  },
  dropdownInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 8,
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    color: '#bdc3c7',
  },
  selectedText: {
    color: '#2c3e50',
  },
  textAreaInput: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2c3e50',
    minHeight: 80,
  },
  numberInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingVertical: 8,
  },
  numberButton: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  numberValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2c3e50',
    marginHorizontal: 16,
    minWidth: 40,
    textAlign: 'center',
  },

  // Frequency/Radio Button Styles
  frequencyOptions: {
    flexDirection: 'row',
    gap: 16,
  },
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#bdc3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonSelected: {
    borderColor: '#1f2937',
  },
  radioButtonInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1f2937',
  },
  frequencyText: {
    fontSize: 16,
    color: '#2c3e50',
  },

  // Notes Input Styles
  notesInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  notesPlaceholder: {
    fontSize: 14,
    color: '#95a5a6',
    flex: 1,
  },
  notesText: {
    color: '#2c3e50',
  },

  // Schedule Button Styles
  scheduleCheckButton: {
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  scheduleCheckButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default formButtonStyles;
