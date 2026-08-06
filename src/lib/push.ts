import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
// Type-only import: erased at compile time, so referencing it here can't
// trigger the runtime crash below.
import type * as NotificationsType from 'expo-notifications';

// Expo Go on Android/iOS dropped support for remote push notifications in
// SDK 53+, and merely `require()`-ing expo-notifications there throws
// immediately (before any of our code even runs) — guarding *usage* isn't
// enough, the package must never be statically imported in a code path
// that Expo Go evaluates. Everything here uses a lazy dynamic import
// instead, gated by this check, so the module is never loaded at all
// under Expo Go. Push only works in a real dev/production build (see
// README).
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let notificationsModulePromise: Promise<typeof NotificationsType> | null = null;
function loadNotifications(): Promise<typeof NotificationsType> | null {
  if (isExpoGo) return null;
  if (!notificationsModulePromise) {
    notificationsModulePromise = import('expo-notifications').then((mod) => {
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      return mod;
    });
  }
  return notificationsModulePromise;
}

export async function registerForPushNotificationsAsync(profileId: string): Promise<string | null> {
  const Notifications = await loadNotifications();
  if (!Notifications || !Device.isDevice) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const token = tokenResponse.data;

  await supabase.from('device_tokens').upsert(
    {
      profile_id: profileId,
      expo_push_token: token,
      device_info: { os: Platform.OS, modelName: Device.modelName },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'expo_push_token' }
  );

  return token;
}

function extractRequestIdFromNotification(
  response: NotificationsType.NotificationResponse
): string | undefined {
  const data = response.notification.request.content.data as { requestId?: string } | undefined;
  return data?.requestId;
}

// Registers the notification-tap listener and returns an unsubscribe
// function (a no-op under Expo Go). Kept here, alongside the rest of the
// lazy-loading logic, so app/_layout.tsx never has to statically import
// expo-notifications either.
export async function addNotificationResponseListener(
  onRequestId: (requestId: string) => void
): Promise<() => void> {
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const requestId = extractRequestIdFromNotification(response);
    if (requestId) onRequestId(requestId);
  });
  return () => sub.remove();
}
