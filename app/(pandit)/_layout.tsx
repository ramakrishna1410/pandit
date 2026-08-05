import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/constants/theme';

export default function PanditLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: 'Nearby Requests', tabBarIcon: ({ color, size }) => <Ionicons name="albums" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Availability', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} /> }}
      />
      <Tabs.Screen name="requests/[id]" options={{ href: null }} />
    </Tabs>
  );
}
