// Triggered by a Supabase Database Webhook on `insert` into `requests`.
// Finds nearby, available, matching pandits and pushes each of them a
// notification, logging who was notified for later fallback handling.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendExpoPushNotifications, type ExpoPushMessage } from '../_shared/expoPush.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DEFAULT_RADIUS_M = 50000;

interface WebhookPayload {
  type: 'INSERT';
  table: 'requests';
  record: {
    id: string;
    ceremony_type_id: number;
    ceremony_date: string;
    location: string;
    address_text: string;
  };
}

Deno.serve(async (req) => {
  const payload = (await req.json()) as WebhookPayload;
  const request = payload.record;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: ceremonyType } = await supabase
    .from('ceremony_types')
    .select('name')
    .eq('id', request.ceremony_type_id)
    .single();

  const { data: candidates, error: rpcError } = await supabase.rpc('nearby_pandits', {
    req_location: request.location,
    radius_m: DEFAULT_RADIUS_M,
    req_date: request.ceremony_date,
    req_ceremony_type_id: request.ceremony_type_id,
  });

  if (rpcError || !candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ notified: 0, error: rpcError?.message }), { status: 200 });
  }

  const panditIds: string[] = candidates.map((c: { pandit_id: string }) => c.pandit_id);

  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('profile_id, expo_push_token')
    .in('profile_id', panditIds);

  await supabase.from('request_notifications').insert(
    panditIds.map((pandit_id) => ({ request_id: request.id, pandit_id }))
  );

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ notified: panditIds.length, pushed: 0 }), { status: 200 });
  }

  const distanceByPandit = new Map(candidates.map((c: { pandit_id: string; distance_m: number }) => [c.pandit_id, c.distance_m]));

  const messages: ExpoPushMessage[] = tokens.map((t) => {
    const distanceKm = ((distanceByPandit.get(t.profile_id) as number | undefined) ?? 0) / 1000;
    return {
      to: t.expo_push_token,
      title: `New ${ceremonyType?.name ?? 'ceremony'} request nearby`,
      body: `${distanceKm.toFixed(1)}km away · ${request.address_text}`,
      data: { requestId: request.id },
    };
  });

  const tickets = await sendExpoPushNotifications(messages);

  const staleTokens = tokens
    .filter((_, i) => tickets[i]?.details?.error === 'DeviceNotRegistered')
    .map((t) => t.expo_push_token);
  if (staleTokens.length > 0) {
    await supabase.from('device_tokens').delete().in('expo_push_token', staleTokens);
  }

  return new Response(JSON.stringify({ notified: panditIds.length, pushed: messages.length }), { status: 200 });
});
