import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/lib/AuthProvider';
import { registerForPushNotificationsAsync, extractRequestIdFromNotification, isExpoGo } from '../src/lib/push';

function NotificationRouter() {
  const router = useRouter();
  const { profile } = useAuth();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile?.id || registeredFor.current === profile.id) return;
    registeredFor.current = profile.id;
    registerForPushNotificationsAsync(profile.id).catch(() => {
      // Permission denied or running on a simulator without push support;
      // the app still works, the user just won't get pushes.
    });
  }, [profile?.id]);

  useEffect(() => {
    // expo-notifications listener APIs also throw under Expo Go (SDK 53+
    // dropped remote push there) — see src/lib/push.ts.
    if (isExpoGo) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const requestId = extractRequestIdFromNotification(response);
      if (!requestId || !profile?.role) return;
      const group = profile.role === 'pandit' ? '(pandit)' : '(seeker)';
      router.push(`/${group}/requests/${requestId}` as never);
    });
    return () => sub.remove();
  }, [profile?.role, router]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <NotificationRouter />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
