import { useEffect, useRef } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/lib/AuthProvider';
import { registerForPushNotificationsAsync, addNotificationResponseListener } from '../src/lib/push';

// Watches session/role from anywhere in the app (not just the initial '/'
// screen) so that e.g. signing out while deep in a tab actually navigates
// back to the phone-entry screen instead of leaving a signed-out user
// stranded on a now-inaccessible route.
function AuthGate() {
  const { session, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/phone');
      return;
    }

    if (!profile?.role) {
      const current = segments as string[];
      if (current[1] !== 'role-select') router.replace('/(auth)/role-select');
      return;
    }

    if (inAuthGroup) {
      router.replace(profile.role === 'pandit' ? '/(pandit)/feed' : '/(seeker)/home');
    }
  }, [loading, session, profile, segments, router]);

  return null;
}

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
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    addNotificationResponseListener((requestId) => {
      if (!profile?.role) return;
      const group = profile.role === 'pandit' ? '(pandit)' : '(seeker)';
      router.push(`/${group}/requests/${requestId}` as never);
    }).then((unsub) => {
      if (cancelled) unsub();
      else unsubscribe = unsub;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [profile?.role, router]);

  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AuthGate />
      <NotificationRouter />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
