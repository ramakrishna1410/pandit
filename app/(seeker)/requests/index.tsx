import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/AuthProvider';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { colors, radius, spacing } from '../../../src/constants/theme';
import type { BookingRequest, CeremonyType } from '../../../src/types/database';

type RequestRow = BookingRequest & { ceremony_types: Pick<CeremonyType, 'name'> | null };

export default function SeekerRequestsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase
      .from('requests')
      .select('*, ceremony_types(name)')
      .eq('seeker_id', session.user.id)
      .order('created_at', { ascending: false });
    setRequests((data as RequestRow[]) ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>No requests yet. Create one from the Home tab.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(seeker)/requests/${item.id}`)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.ceremony_types?.name ?? 'Ceremony'}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.cardMeta}>{item.ceremony_date}</Text>
            <Text style={styles.cardMeta}>{item.address_text}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
