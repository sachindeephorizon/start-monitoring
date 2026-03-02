import { StyleSheet } from 'react-native';

export const bodyguardModalStyles = StyleSheet.create({
  bodyguardOptions: {
    marginBottom: 24,
  },
  bodyguardOption: {
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  bodyguardOptionContent: {
    padding: 20,
    alignItems: 'center',
  },
  bodyguardOptionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginTop: 12,
    marginBottom: 6,
  },
  bodyguardOptionDesc: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 12,
    fontWeight: '300',
  },
  bodyguardOptionPrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e74c3c',
  },
  bodyguardFeatures: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#2c3e50',
    marginBottom: 16,
  },
  feature: {
    fontSize: 14,
    color: '#5a6c7d',
    marginBottom: 8,
    fontWeight: '300',
  },
});
