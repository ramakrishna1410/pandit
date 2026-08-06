import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { useAuth } from '../../src/lib/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { colors, spacing } from '../../src/constants/theme';
import type { PanditProfile } from '../../src/types/database';

type CeremonyPriceRow = { ceremony_type_id: number; name: string; price: number | null };

export default function PanditProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const [panditProfile, setPanditProfile] = useState<PanditProfile | null>(null);
  const [ceremonyPrices, setCeremonyPrices] = useState<CeremonyPriceRow[]>([]);
  const [editedPrices, setEditedPrices] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const loadCeremonyPrices = () => {
    if (!session) return;
    supabase
      .from('pandit_ceremony_types')
      .select('ceremony_type_id, price, ceremony_types(name)')
      .eq('pandit_id', session.user.id)
      .then(({ data }) => {
        const rows = ((data ?? []) as unknown as { ceremony_type_id: number; price: number | null; ceremony_types: { name: string } | null }[]).map(
          (r) => ({ ceremony_type_id: r.ceremony_type_id, price: r.price, name: r.ceremony_types?.name ?? 'Ceremony' })
        );
        setCeremonyPrices(rows);
      });
  };

  useEffect(() => {
    if (!session) return;
    supabase
      .from('pandit_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setPanditProfile(data as PanditProfile | null));
    loadCeremonyPrices();
  }, [session]);

  const toggleAvailability = async (value: boolean) => {
    if (!session) return;
    setPanditProfile((prev) => (prev ? { ...prev, is_available: value } : prev));
    await supabase.from('pandit_profiles').update({ is_available: value }).eq('id', session.user.id);
  };

  const savePrice = async (ceremonyTypeId: number) => {
    if (!session) return;
    const raw = editedPrices[ceremonyTypeId];
    const value = Number(raw);
    if (!raw || !value || value <= 0) return;
    setSavingId(ceremonyTypeId);
    await supabase
      .from('pandit_ceremony_types')
      .update({ price: value })
      .eq('pandit_id', session.user.id)
      .eq('ceremony_type_id', ceremonyTypeId);
    setSavingId(null);
    setSavedId(ceremonyTypeId);
    setTimeout(() => setSavedId(null), 1500);
    loadCeremonyPrices();
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

      {ceremonyPrices.length > 0 ? (
        <View style={styles.pricesSection}>
          <Text style={styles.sectionTitle}>My prices</Text>
          <Text style={styles.sectionHint}>Update these periodically to keep up with market rates.</Text>
          {ceremonyPrices.map((row) => (
            <View key={row.ceremony_type_id} style={styles.priceRow}>
              <Text style={styles.priceRowLabel}>{row.name}</Text>
              <TextField
                value={editedPrices[row.ceremony_type_id] ?? String(row.price ?? '')}
                onChangeText={(v) => setEditedPrices((prev) => ({ ...prev, [row.ceremony_type_id]: v }))}
                keyboardType="number-pad"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <Button
                title={savedId === row.ceremony_type_id ? 'Saved' : 'Save'}
                variant="secondary"
                onPress={() => savePrice(row.ceremony_type_id)}
                loading={savingId === row.ceremony_type_id}
                style={styles.priceSaveButton}
              />
            </View>
          ))}
        </View>
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
  pricesSection: { marginTop: spacing.xl },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  sectionHint: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  priceRowLabel: { color: colors.text, fontSize: 14, width: 90 },
  priceSaveButton: { minHeight: 46, paddingHorizontal: spacing.md },
});
