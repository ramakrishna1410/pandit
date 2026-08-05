import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/lib/AuthProvider';
import { Button } from '../../src/components/Button';
import { colors, radius, spacing } from '../../src/constants/theme';

export default function SeekerHome() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.greeting}>
        {profile?.full_name ? `Namaste, ${profile.full_name}` : 'Namaste'}
      </Text>
      <Text style={styles.subtitle}>Find a verified pandit nearby for your next ceremony.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Need a pandit?</Text>
        <Text style={styles.cardBody}>
          Tell us the ceremony, date, and location — nearby available pandits will be notified
          instantly, and you'll hear back the moment one accepts.
        </Text>
        <Button title="Create a request" onPress={() => router.push('/(seeker)/new-request')} />
      </View>

      <Button
        title="View my requests"
        variant="secondary"
        onPress={() => router.push('/(seeker)/requests')}
        style={{ marginTop: spacing.md }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  greeting: { fontSize: 26, fontWeight: '700', color: colors.text },
  subtitle: { color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  cardBody: { color: colors.textMuted, marginBottom: spacing.lg, lineHeight: 20 },
});
