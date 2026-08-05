import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import dayjs from 'dayjs';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/AuthProvider';
import { colors, radius, spacing } from '../../src/constants/theme';
import type { AvailabilityStatus, PanditAvailability } from '../../src/types/database';

const DAYS_AHEAD = 21;
const CYCLE: AvailabilityStatus[] = ['available', 'busy', 'blocked'];

const STATUS_COLOR: Record<AvailabilityStatus, string> = {
  available: colors.success,
  busy: colors.pending,
  blocked: colors.danger,
};

export default function PanditCalendarScreen() {
  const { session } = useAuth();
  const [availability, setAvailability] = useState<Record<string, AvailabilityStatus>>({});

  const load = useCallback(async () => {
    if (!session) return;
    const start = dayjs().format('YYYY-MM-DD');
    const end = dayjs().add(DAYS_AHEAD, 'day').format('YYYY-MM-DD');
    const { data } = await supabase
      .from('pandit_availability')
      .select('*')
      .eq('pandit_id', session.user.id)
      .gte('date', start)
      .lte('date', end);
    const map: Record<string, AvailabilityStatus> = {};
    (data as PanditAvailability[] | null)?.forEach((row) => {
      map[row.date] = row.status;
    });
    setAvailability(map);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => dayjs().add(i, 'day').format('YYYY-MM-DD'));

  const cycleStatus = async (date: string) => {
    if (!session) return;
    const current = availability[date] ?? 'available';
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    setAvailability((prev) => ({ ...prev, [date]: next }));
    await supabase
      .from('pandit_availability')
      .upsert({ pandit_id: session.user.id, date, status: next }, { onConflict: 'pandit_id,date' });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Tap a date to cycle Available → Busy → Blocked</Text>
      <FlatList
        data={days}
        keyExtractor={(d) => d}
        contentContainerStyle={{ padding: spacing.lg }}
        renderItem={({ item }) => {
          const status = availability[item] ?? 'available';
          return (
            <Pressable style={styles.row} onPress={() => cycleStatus(item)}>
              <Text style={styles.date}>{dayjs(item).format('ddd, MMM D')}</Text>
              <View style={[styles.dot, { backgroundColor: STATUS_COLOR[status] }]} />
              <Text style={[styles.status, { color: STATUS_COLOR[status] }]}>{status}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hint: { color: colors.textMuted, paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  date: { flex: 1, color: colors.text, fontSize: 15 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  status: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
});
