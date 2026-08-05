import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';
import type { RequestStatus } from '../types/database';

const LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  cancelled: 'Cancelled',
  expired: 'Expired',
  completed: 'Completed',
};

const COLORS: Record<RequestStatus, string> = {
  pending: colors.pending,
  accepted: colors.accepted,
  cancelled: colors.cancelled,
  expired: colors.cancelled,
  completed: colors.primary,
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${COLORS[status]}22` }]}>
      <Text style={[styles.text, { color: COLORS[status] }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
