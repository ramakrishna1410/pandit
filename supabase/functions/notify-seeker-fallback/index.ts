// Invoked on a schedule (see supabase/migrations/0003_fallback_notifications.sql)
// after `mark_stale_pending_requests()` has flagged requests pending &gt; 4h
// with no response, so the seeker isn't left waiting in silence.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendExpoPushNotifications } from '../_shared/expoPush.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async () => {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: staleRequests } = await supabase
    .from('requests')
    .select('id, seeker_id')
    .eq('status', 'pending')
    .eq('fallback_notified', true);

  if (!staleRequests || staleRequests.length === 0) {
    return new Response(JSON.stringify({ pushed: 0 }), { status: 200 });
  }

  const seekerIds = [...new Set(staleRequests.map((r) => r.seeker_id))];
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('profile_id, expo_push_token')
    .in('profile_id', seekerIds);

  const tokensBySeeker = new Map<string, string[]>();
  tokens?.forEach((t) => {
    const list = tokensBySeeker.get(t.profile_id) ?? [];
    list.push(t.expo_push_token);
    tokensBySeeker.set(t.profile_id, list);
  });

  const messages = staleRequests.flatMap((r) =>
    (tokensBySeeker.get(r.seeker_id) ?? []).map((to) => ({
      to,
      title: 'Still looking for a pandit',
      body: "No one has responded yet — we're still notifying pandits nearby. You can also try widening your date or ceremony details.",
      data: { requestId: r.id },
    }))
  );

  await sendExpoPushNotifications(messages);

  return new Response(JSON.stringify({ pushed: messages.length }), { status: 200 });
});
