import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/lib/AuthProvider';
import { colors } from '../src/constants/theme';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/phone" />;
  }

  if (!profile?.role) {
    return <Redirect href="/(auth)/role-select" />;
  }

  if (profile.role === 'seeker') {
    return <Redirect href="/(seeker)/home" />;
  }

  return <Redirect href="/(pandit)/feed" />;
}
