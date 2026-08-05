import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAuth } from '../../src/lib/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/constants/theme';
import type { PanditProfile } from '../../src/types/database';

export default function PanditProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const [panditProfile, setPanditProfile] = useState<PanditProfile | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('pandit_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setPanditProfile(data as PanditProfile | null));
  }, [session]);

  const toggleAvailability = async (value: boolean) => {
    if (!session) return;
    setPanditProfile((prev) => (prev ? { ...prev, is_available: value } : prev));
    await supabase.from('pandit_profiles').update({ is_available: value }).eq('id', session.user.id);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile?.full_name || 'Your profile'}</Text>
      <Text style={styles.phone}>{profile?.phone}</Text>

      {panditProfile ? (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Available for new requests</Text>
            <Switch value={panditProfile.is_available} onValueChange={toggleAvailability} />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Rating</Text>
            <Text style={styles.rowValue}>
              {panditProfile.rating_count > 0 ? `${panditProfile.avg_rating.toFixed(1)} ★ (${panditProfile.rating_count})` : 'No ratings yet'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Service radius</Text>
            <Text style={styles.rowValue}>{panditProfile.service_radius_km} km</Text>
          </View>
        </>
      ) : null}

      <Button title="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  phone: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { color: colors.text, fontSize: 15 },
  rowValue: { color: colors.textMuted, fontSize: 15 },
});
