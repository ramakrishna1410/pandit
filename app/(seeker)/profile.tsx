import { View, Text, StyleSheet } from 'react-native';
import { useAuth } from '../../src/lib/AuthProvider';
import { Button } from '../../src/components/Button';
import { colors, spacing } from '../../src/constants/theme';

export default function SeekerProfileScreen() {
  const { profile, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{profile?.full_name || 'Your profile'}</Text>
      <Text style={styles.phone}>{profile?.phone}</Text>
      <Button title="Sign out" variant="secondary" onPress={signOut} style={{ marginTop: spacing.xl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  name: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: spacing.lg },
  phone: { color: colors.textMuted, marginTop: spacing.xs },
});
