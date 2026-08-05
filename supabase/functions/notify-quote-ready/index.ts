// Triggered by trg_notify_quote_ready (see 0006_notify_triggers_pricing.sql)
// when a request moves pending -> quoted, i.e. a pandit sent a price quote.
// Pushes the seeker to review and pay the commission to confirm.
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
    quoted_price: number | null;
  };
  old_record: { status: string };
}

Deno.serve(async (req) => {
  const payload = (await req.json()) as WebhookPayload;
  const request = payload.record;

  if (request.status !== 'quoted' || payload.old_record.status === 'quoted') {
    return new Response(JSON.stringify({ skipped: true }), { status: 200 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: pandit } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', request.accepted_by)
    .maybeSingle();

  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('expo_push_token')
    .eq('profile_id', request.seeker_id);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ pushed: 0 }), { status: 200 });
  }

  await sendExpoPushNotifications(
    tokens.map((t) => ({
      to: t.expo_push_token,
      title: 'You have a quote!',
      body: `${pandit?.full_name ?? 'A pandit'} quoted ₹${request.quoted_price}. Review and confirm your booking.`,
      data: { requestId: request.id },
    }))
  );

  return new Response(JSON.stringify({ pushed: tokens.length }), { status: 200 });
});
