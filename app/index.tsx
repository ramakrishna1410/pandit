import { ActivityIndicator, View } from 'react-native';
import { colors } from '../src/constants/theme';

// AuthGate in app/_layout.tsx handles all session/role-based navigation
// (including from here) — this screen is just the loading state shown
// before that redirect fires.
export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
