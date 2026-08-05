import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/AuthProvider';
import { useCeremonyTypes } from '../../src/hooks/useCeremonyTypes';
import { useLocation } from '../../src/hooks/useLocation';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { colors, radius, spacing } from '../../src/constants/theme';

export default function NewRequestScreen() {
  const router = useRouter();
  const { profile, session } = useAuth();
  const { ceremonyTypes } = useCeremonyTypes();
  const { location, setLocation, loading: locating, error: locationError, captureCurrentLocation } = useLocation();

  const [contactName, setContactName] = useState(profile?.full_name ?? '');
  const [contactPhone, setContactPhone] = useState(profile?.phone ?? '');
  const [ceremonyTypeId, setCeremonyTypeId] = useState<number | null>(null);
  const [date, setDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [notes, setNotes] = useState('');
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!session) return;
    setError(null);
    if (!contactName || !contactPhone) {
      setError('Please provide your name and phone number.');
      return;
    }
    if (!ceremonyTypeId) {
      setError('Please choose a ceremony type.');
      return;
    }
    if (!location) {
      setError('Please set a location for the ceremony.');
      return;
    }
    setSubmitting(true);
    const { data, error: insertError } = await supabase
      .from('requests')
      .insert({
        seeker_id: session.user.id,
        ceremony_type_id: ceremonyTypeId,
        ceremony_date: date.toISOString().slice(0, 10),
        location: `SRID=4326;POINT(${location.lng} ${location.lat})`,
        address_text: addressText || location.label,
        notes: notes || null,
        budget_estimate: budget ? Number(budget) : null,
      })
      .select('id')
      .single();

    if (insertError || !data) {
      setSubmitting(false);
      setError(insertError?.message ?? 'Could not create request.');
      return;
    }

    // Contact info lives in its own table so it can stay hidden from a
    // pandit until the request is actually confirmed (commission paid) —
    // see supabase/migrations/0005_commission_pricing.sql.
    const { error: contactError } = await supabase
      .from('request_contacts')
      .insert({ request_id: data.id, contact_name: contactName, contact_phone: contactPhone });
    setSubmitting(false);

    if (contactError) {
      setError(contactError.message);
      return;
    }
    router.replace(`/(seeker)/requests/${data.id}`);
  };

  const useMyLocation = async () => {
    const result = await captureCurrentLocation();
    if (result) setAddressText(result.label);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>New ceremony request</Text>

      <TextField label="Your name" value={contactName} onChangeText={setContactName} />
      <TextField label="Phone number" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />

      <Text style={styles.label}>Ceremony type</Text>
      <View style={styles.chips}>
        {ceremonyTypes.map((type) => {
          const active = ceremonyTypeId === type.id;
          return (
            <Pressable
              key={type.id}
              onPress={() => setCeremonyTypeId(type.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{type.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Ceremony date</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateButtonText}>{date.toDateString()}</Text>
      </Pressable>
      {showPicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date()}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_event, selected) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) setDate(selected);
          }}
        />
      ) : null}

      <Text style={styles.label}>Location</Text>
      <Text style={styles.locationLabel}>{location ? location.label : 'Not set'}</Text>
      {locationError ? <Text style={styles.error}>{locationError}</Text> : null}
      <Button title="Use my current location" variant="secondary" onPress={useMyLocation} loading={locating} style={{ marginBottom: spacing.md }} />
      <TextField
        label="Address details (optional)"
        value={addressText}
        onChangeText={setAddressText}
        placeholder="Flat / street / landmark"
      />

      <TextField label="Notes for the pandit (optional)" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
      <TextField label="Budget estimate (optional)" value={budget} onChangeText={setBudget} keyboardType="number-pad" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Send request to nearby pandits" onPress={submit} loading={submitting} />
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
  dateButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
  },
  dateButtonText: { color: colors.text, fontSize: 16 },
  locationLabel: { color: colors.textMuted, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.md },
});
