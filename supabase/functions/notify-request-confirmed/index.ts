// Triggered by trg_notify_request_confirmed (see 0006_notify_triggers_pricing.sql)
// when a request moves quoted -> confirmed, i.e. the seeker paid the
// commission. Pushes both parties — this is the point at which contact
// info is revealed, so it's the natural "you're booked" notification for
// the pandit (the seeker gets a live UI update on their already-open quote
// screen, but is pushed too in case they've backgrounded the app).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendExpoPushNotifications } from '../_shared/expoPush.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WebhookPayload {
  type: 'UPDATE';
  table: 'requests';
  record: {
    id: string;
    seeker_id: string;
    status: string;
    accepted_by: string | null;
  };
  old_record: { status: string };
}

Deno.serve(async (req) => {
  const payload = (await req.json()) as WebhookPayload;
  const request = payload.record;

  if (request.status !== 'confirmed' || payload.old_record.status === 'confirmed') {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const recipientIds = [request.seeker_id, request.accepted_by].filter((id): id is string => !!id);
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('profile_id, expo_push_token')
    .in('profile_id', recipientIds);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ pushed: 0 }), { status: 200 });
  }

  const messages = tokens.map((t) => ({
    to: t.expo_push_token,
    title: 'Booking confirmed!',
    body:
      t.profile_id === request.seeker_id
        ? 'Your payment went through — contact details are now available.'
        : 'The seeker paid the booking commission — you can now see their contact details.',
    data: { requestId: request.id },
  }));

  await sendExpoPushNotifications(messages);

  return new Response(JSON.stringify({ pushed: messages.length }), { status: 200 });
});
