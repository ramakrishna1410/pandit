import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/AuthProvider';
import { useCeremonyTypes } from '../../src/hooks/useCeremonyTypes';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { colors, radius, spacing } from '../../src/constants/theme';

export default function PanditOnboardingScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const { ceremonyTypes } = useCeremonyTypes();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [languages, setLanguages] = useState('Hindi, Sanskrit');
  const [selectedTypes, setSelectedTypes] = useState<Set<number>>(new Set());
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [locationLabel, setLocationLabel] = useState('Not set');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (id: number) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const setPriceFor = (id: number, value: string) => {
    setPrices((prev) => ({ ...prev, [id]: value }));
  };

  const captureLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setError('Location permission is needed so seekers nearby can find you.');
      return;
    }
    const position = await Location.getCurrentPositionAsync({});
    setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
    const [place] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    setLocationLabel(place ? `${place.city ?? ''} ${place.region ?? ''}`.trim() : 'Location captured');
  };

  const save = async () => {
    if (!session) return;
    setError(null);
    if (!coords) {
      setError('Please set your base location.');
      return;
    }
    if (selectedTypes.size === 0) {
      setError('Select at least one ceremony you can perform.');
      return;
    }
    for (const id of selectedTypes) {
      const p = Number(prices[id]);
      if (!p || p <= 0) {
        setError('Enter what you charge for each ceremony you selected.');
        return;
      }
    }
    setLoading(true);

    await supabase.from('profiles').update({ full_name: fullName }).eq('id', session.user.id);

    const { error: upsertError } = await supabase.from('pandit_profiles').upsert({
      id: session.user.id,
      bio,
      years_experience: yearsExperience ? Number(yearsExperience) : null,
      languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
      base_location: `SRID=4326;POINT(${coords.lng} ${coords.lat})`,
      base_address_text: locationLabel,
    });

    if (upsertError) {
      setLoading(false);
      setError(upsertError.message);
      return;
    }

    await supabase.from('pandit_ceremony_types').delete().eq('pandit_id', session.user.id);
    await supabase.from('pandit_ceremony_types').insert(
      Array.from(selectedTypes).map((ceremony_type_id) => ({
        pandit_id: session.user.id,
        ceremony_type_id,
        price: Number(prices[ceremony_type_id]),
      }))
    );

    // AuthGate (app/_layout.tsx) redirects a pandit back here whenever
    // AuthProvider's cached panditOnboardingIncomplete is still true --
    // without this refresh, that stale client-side state would bounce us
    // straight back after the replace below, even though the save above
    // already succeeded server-side.
    await refreshProfile();

    setLoading(false);
    router.replace('/(pandit)/feed');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>Set up your Pandit profile</Text>

      <TextField label="Full name" value={fullName} onChangeText={setFullName} />
      <TextField label="Bio" value={bio} onChangeText={setBio} multiline numberOfLines={3} />
      <TextField
        label="Years of experience"
        value={yearsExperience}
        onChangeText={setYearsExperience}
        keyboardType="number-pad"
      />
      <TextField label="Languages (comma separated)" value={languages} onChangeText={setLanguages} />

      <Text style={styles.label}>Ceremonies you perform</Text>
      <View style={styles.chips}>
        {ceremonyTypes.map((type) => {
          const active = selectedTypes.has(type.id);
          return (
            <Pressable
              key={type.id}
              onPress={() => toggleType(type.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{type.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {Array.from(selectedTypes).map((id) => {
        const type = ceremonyTypes.find((t) => t.id === id);
        return (
          <TextField
            key={id}
            label={`What do you charge for ${type?.name ?? 'this ceremony'}? (₹)`}
            value={prices[id] ?? ''}
            onChangeText={(v) => setPriceFor(id, v)}
            keyboardType="number-pad"
          />
        );
      })}

      <Text style={styles.label}>Base location</Text>
      <Text style={styles.locationLabel}>{locationLabel}</Text>
      <Button title="Use current location" variant="secondary" onPress={captureLocation} style={{ marginBottom: spacing.md }} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Save & continue" onPress={save} loading={loading} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.lg },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextActive: { color: '#fff' },
  locationLabel: { color: colors.textMuted, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.md, textAlign: 'center' },
});
