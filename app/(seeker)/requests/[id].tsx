import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/AuthProvider';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { Button } from '../../../src/components/Button';
import { RatingStars } from '../../../src/components/RatingStars';
import { TextField } from '../../../src/components/TextField';
import { payCommission, PaymentCancelledError } from '../../../src/lib/payments';
import { colors, radius, spacing } from '../../../src/constants/theme';
import type { BookingRequest, CeremonyType, Rating } from '../../../src/types/database';

type RequestRow = BookingRequest & { ceremony_types: Pick<CeremonyType, 'name'> | null };
type PanditContact = { id: string; full_name: string | null; phone: string | null };

export default function SeekerRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, profile } = useAuth();
  const [request, setRequest] = useState<RequestRow | null>(null);
  const [pandit, setPandit] = useState<PanditContact | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [rating, setRating] = useState<Rating | null>(null);
  const [ratingStars, setRatingStars] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('requests')
      .select('*, ceremony_types(name)')
      .eq('id', id)
      .single();
    setRequest(data as RequestRow);

    // The pandit's contact (name/phone) only resolves via
    // public_counterpart_profiles once the request is 'confirmed' — see
    // that view's RLS in 0005_commission_pricing.sql.
    if (data?.status === 'confirmed' && data.accepted_by) {
      const { data: panditData } = await supabase
        .from('public_counterpart_profiles')
        .select('*')
        .eq('id', data.accepted_by)
        .maybeSingle();
      setPandit(panditData as PanditContact);
    }

    const { data: existingRating } = await supabase
      .from('ratings')
      .select('*')
      .eq('request_id', id)
      .maybeSingle();
    setRating(existingRating as Rating | null);
  };

  const submitRating = async () => {
    if (!session || !request?.accepted_by || ratingStars === 0) return;
    setSubmittingRating(true);
    const { error } = await supabase.from('ratings').insert({
      request_id: id,
      seeker_id: session.user.id,
      pandit_id: request.accepted_by,
      stars: ratingStars,
      review_text: reviewText || null,
    });
    if (!error) {
      await supabase.from('requests').update({ status: 'completed' }).eq('id', id);
    }
    setSubmittingRating(false);
    load();
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`request-${id}`)
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

  const cancel = async () => {
    Alert.alert('Cancel request?', 'This cannot be undone.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          await supabase.from('requests').update({ status: 'cancelled' }).eq('id', id);
          setCancelling(false);
          load();
        },
      },
    ]);
  };

  const acceptQuoteAndPay = async () => {
    if (!session || !request || !profile) return;
    setPaying(true);
    try {
      await payCommission({
        requestId: request.id,
        seekerName: profile.full_name ?? '',
        seekerPhone: profile.phone ?? '',
      });
      // The Realtime subscription above will pick up the resulting
      // quoted -> confirmed transition and refresh the screen, but reload
      // immediately too in case that event is slow to arrive.
      await load();
    } catch (err) {
      if (!(err instanceof PaymentCancelledError)) {
        Alert.alert('Payment failed', err instanceof Error ? err.message : 'Please try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  if (!request) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>Loading…</Text>
      </View>
    );
  }

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

      {request.status === 'pending' ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            We've notified nearby available pandits. You'll be alerted the moment one sends a quote.
          </Text>
        </View>
      ) : null}

      {request.status === 'quoted' ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Quoted price</Text>
          <Text style={styles.quotePrice}>₹{request.quoted_price}</Text>
          <Text style={styles.infoText}>
            Booking commission (10%): ₹{request.commission_amount} — paid now to confirm.{'\n'}
            Remaining ₹{(request.quoted_price ?? 0) - (request.commission_amount ?? 0)} is settled directly with the
            pandit after the ceremony.
          </Text>
          <Button
            title="Accept & pay commission"
            onPress={acceptQuoteAndPay}
            loading={paying}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {request.status === 'confirmed' && pandit ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Booking confirmed with {pandit.full_name ?? 'your pandit'} 🎉</Text>
          {pandit.phone ? (
            <Button
              title={`Call ${pandit.phone}`}
              onPress={() => Linking.openURL(`tel:${pandit.phone}`)}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
          <Button
            title="Open chat"
            variant="secondary"
            onPress={() => router.push(`/request/${id}/chat`)}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {request.status === 'confirmed' && !rating ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Ceremony done? Rate your pandit</Text>
          <RatingStars value={ratingStars} onChange={setRatingStars} />
          <TextField
            placeholder="Optional review"
            value={reviewText}
            onChangeText={setReviewText}
            style={{ marginTop: spacing.sm }}
          />
          <Button
            title="Submit rating"
            onPress={submitRating}
            loading={submittingRating}
            disabled={ratingStars === 0}
            style={{ marginTop: spacing.sm }}
          />
        </View>
      ) : null}

      {rating ? (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>You rated this ceremony {rating.stars} ★</Text>
        </View>
      ) : null}

      {(request.status === 'pending' || request.status === 'quoted' || request.status === 'confirmed') && (
        <Button title="Cancel request" variant="danger" onPress={cancel} loading={cancelling} style={{ marginTop: spacing.lg }} />
      )}
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
  quotePrice: { fontSize: 28, fontWeight: '700', color: colors.text, marginVertical: spacing.xs },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  infoText: { color: colors.textMuted, lineHeight: 20 },
  infoTitle: { fontSize: 16, fontWeight: '700', color: colors.success },
});
