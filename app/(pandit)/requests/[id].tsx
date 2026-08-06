import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/AuthProvider';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { colors, radius, spacing } from '../../../src/constants/theme';
import type { BookingRequest, CeremonyType, RequestContact } from '../../../src/types/database';

type RequestRow = BookingRequest & { ceremony_types: Pick<CeremonyType, 'name'> | null };

export default function PanditRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [contact, setContact] = useState<RequestContact | null>(null);
  const [quotedPrice, setQuotedPrice] = useState('');
  const [submittingQuote, setSubmittingQuote] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('requests')
      .select('*, ceremony_types(name)')
      .eq('id', id)
      .single();
    setRequest(data as RequestRow);

    // request_contacts only resolves for the accepted pandit once the
    // request is 'confirmed' — see 0005_commission_pricing.sql's RLS.
    if (data?.status === 'confirmed') {
      const { data: contactRow } = await supabase
        .from('request_contacts')
        .select('*')
        .eq('request_id', id)
        .maybeSingle();
      setContact(contactRow as RequestContact | null);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`pandit-request-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'requests', filter: `id=eq.${id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const sendQuote = async () => {
    if (!session) return;
    const price = Number(quotedPrice);
    if (!price || price <= 0) {
      Alert.alert('Enter a valid price');
      return;
    }
    setSubmittingQuote(true);
    const { data, error } = await supabase.rpc('accept_request', {
      req_id: id,
      pandit: session.user.id,
      p_quoted_price: price,
    });
    setSubmittingQuote(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Already taken', 'Another pandit already sent a quote for this request.');
      load();
      return;
    }
    load();
  };

  if (!request) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

  const isMine = request.accepted_by === session?.user.id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{request.ceremony_types?.name ?? 'Ceremony'}</Text>
        <StatusBadge status={request.status} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{request.ceremony_date}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Location</Text>
        <Text style={styles.value}>{request.address_text}</Text>
      </View>
      {request.notes ? (
        <View style={styles.section}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.value}>{request.notes}</Text>
        </View>
      ) : null}
      {request.budget_estimate ? (
        <View style={styles.section}>
          <Text style={styles.label}>Budget estimate</Text>
          <Text style={styles.value}>₹{request.budget_estimate}</Text>
        </View>
      ) : null}

      {request.status === 'pending' ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Send a price quote</Text>
          <TextField placeholder="e.g. 5000" keyboardType="number-pad" value={quotedPrice} onChangeText={setQuotedPrice} />
          <Text style={styles.infoText}>
            The seeker pays a 10% commission to confirm; the rest is settled with you directly after the ceremony.
          </Text>
          <Button title="Send quote" onPress={sendQuote} loading={submittingQuote} style={{ marginTop: spacing.sm }} />
        </View>
      ) : null}

      {request.status === 'quoted' && isMine ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Quote sent</Text>
          <Text style={styles.quotePrice}>₹{request.quoted_price}</Text>
          <Text style={styles.infoText}>Waiting for the seeker to accept and pay the commission.</Text>
          <Button
            title="Open chat"
            variant="secondary"
            onPress={() => router.push(`/request/${id}/chat`)}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {request.status === 'quoted' && !isMine ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>Another pandit already sent a quote for this request.</Text>
        </View>
      ) : null}

      {request.status === 'confirmed' && isMine && contact ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Booking confirmed 🎉</Text>
          <Text style={styles.value}>{contact.contact_name}</Text>
          <Button
            title={`Call ${contact.contact_phone}`}
            onPress={() => Linking.openURL(`tel:${contact.contact_phone}`)}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Open chat"
            variant="secondary"
            onPress={() => router.push(`/request/${id}/chat`)}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {request.status === 'confirmed' && !isMine ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>Another pandit's booking was confirmed for this request.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { padding: spacing.lg, color: colors.textMuted },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, flexShrink: 1, marginRight: spacing.sm },
  section: { marginBottom: spacing.md },
  label: { fontSize: 12, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 2 },
  value: { fontSize: 16, color: colors.text },
  quotePrice: { fontSize: 26, fontWeight: '700', color: colors.text },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  infoText: { color: colors.textMuted, lineHeight: 20, marginTop: spacing.xs },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
});
