import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { colors, spacing } from '../../src/constants/theme';

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('+91');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendOtp = async () => {
    setError(null);
    if (!/^\+\d{10,15}$/.test(phone)) {
      setError('Enter phone number in international format, e.g. +919876543210');
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    router.push({ pathname: '/(auth)/verify', params: { phone } });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Text style={styles.title}>Pandit</Text>
      <Text style={styles.subtitle}>Book a pandit for your ceremony, nearby and available.</Text>

      <View style={styles.form}>
        <TextField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoComplete="tel"
          error={error ?? undefined}
        />
        <Button title="Send OTP" onPress={sendOtp} loading={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: 34, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  form: { width: '100%' },
});
