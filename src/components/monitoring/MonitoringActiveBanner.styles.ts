import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
  },
  gradient: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
  },
  title: { fontSize: 12, fontWeight: '700', color: '#22c55e' },
  sub: { fontSize: 10, color: 'rgba(34,197,94,0.7)', marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center' },
  viewText: { fontSize: 11, color: '#22c55e', fontWeight: '700' },
});
