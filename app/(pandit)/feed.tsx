import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/AuthProvider';
import { colors, radius, spacing } from '../../src/constants/theme';
import type { BookingRequest, CeremonyType } from '../../src/types/database';

type RequestRow = BookingRequest & { ceremony_types: Pick<CeremonyType, 'name'> | null };

const DEFAULT_RADIUS_M = 50000;

export default function PanditFeedScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setError(null);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Enable location access to see requests near you.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    const { data, error: rpcError } = await supabase.rpc('nearby_requests_for_pandit', {
      pandit: session.user.id,
      current_location: `SRID=4326;POINT(${position.coords.longitude} ${position.coords.latitude})`,
      radius_m: DEFAULT_RADIUS_M,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (!data || data.length === 0) {
      setRequests([]);
      return;
    }
    const { data: withTypes } = await supabase
      .from('requests')
      .select('*, ceremony_types(name)')
      .in(
        'id',
        (data as BookingRequest[]).map((r) => r.id)
      );
    setRequests((withTypes as RequestRow[]) ?? []);
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
        ListEmptyComponent={
          <Text style={styles.empty}>{error ?? 'No pending requests near you right now.'}</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push(`/(pandit)/requests/${item.id}`)}>
            <Text style={styles.cardTitle}>{item.ceremony_types?.name ?? 'Ceremony'}</Text>
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
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
});
