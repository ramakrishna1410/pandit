import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/lib/AuthProvider';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/constants/theme';
import type { Role } from '../../src/types/database';

export default function RoleSelectScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useAuth();
  const [loading, setLoading] = useState<Role | null>(null);

  const chooseRole = async (role: Role) => {
    if (!session) return;
    setLoading(role);
    await supabase.from('profiles').update({ role }).eq('id', session.user.id);
    if (role === 'pandit') {
      await supabase.from('pandit_profiles').upsert({ id: session.user.id });
    }
    await refreshProfile();
    setLoading(null);
    if (role === 'pandit') {
      router.replace('/(auth)/pandit-onboarding');
    } else {
      router.replace('/(seeker)/home');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>How would you like to use Pandit?</Text>

      <View style={styles.options}>
        <Button
          title="I need a Pandit"
          onPress={() => chooseRole('seeker')}
          loading={loading === 'seeker'}
          disabled={loading !== null}
        />
        <Button
          title="I am a Pandit"
          variant="secondary"
          onPress={() => chooseRole('pandit')}
          loading={loading === 'pandit'}
          disabled={loading !== null}
          style={{ marginTop: spacing.md }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl },
  options: { width: '100%' },
});
