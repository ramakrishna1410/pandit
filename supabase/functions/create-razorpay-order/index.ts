// Called by the seeker's client when they tap "Accept & pay commission" on
// a 'quoted' request. Creates a Razorpay order for the commission amount
// server-side (never exposes the Razorpay key secret to the client) and
// records it on the request's `payments` row so the webhook can later
// match the gateway's payment confirmation back to this request.
//
// Requires two Edge Function secrets (set via `supabase secrets set`):
//   RAZORPAY_KEY_ID       - publishable key, also returned to the client
//                            for opening the Razorpay Checkout SDK
//   RAZORPAY_KEY_SECRET   - used only here, to authenticate the Orders API call
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')!;
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

interface RequestBody {
  requestId: string;
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  // Client-scoped client (caller's JWT) to identify the requester and let
  // RLS confirm they actually own this request — never trust requestId
  // alone.
  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { requestId } = (await req.json()) as RequestBody;

  const { data: request, error: requestError } = await callerClient
    .from('requests')
    .select('id, seeker_id, status, quoted_price, commission_amount')
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), { status: 404 });
  }
  if (request.seeker_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Not your request' }), { status: 403 });
  }
  if (request.status !== 'quoted' || !request.commission_amount) {
    return new Response(JSON.stringify({ error: 'Request is not awaiting a commission payment' }), { status: 409 });
  }

  // Razorpay amounts are in the smallest currency unit (paise for INR).
  const amountPaise = Math.round(request.commission_amount * 100);

  const orderResponse = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`),
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: `request_${request.id}`,
      notes: { request_id: request.id, seeker_id: request.seeker_id },
    }),
  });

  if (!orderResponse.ok) {
    const detail = await orderResponse.text();
    return new Response(JSON.stringify({ error: 'Razorpay order creation failed', detail }), { status: 502 });
  }

  const order = await orderResponse.json();

  // Service-role client to write the payments row (bypasses RLS, which is
  // fine here since we've already verified ownership above).
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: payment, error: paymentError } = await serviceClient
    .from('payments')
    .insert({
      request_id: request.id,
      seeker_id: request.seeker_id,
      amount: request.commission_amount,
      gateway: 'razorpay',
      gateway_order_id: order.id,
      status: 'created',
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    return new Response(JSON.stringify({ error: paymentError?.message ?? 'Could not record payment' }), {
      status: 500,
    });
  }

  return new Response(
    JSON.stringify({
      paymentId: payment.id,
      razorpayOrderId: order.id,
      razorpayKeyId,
      amount: amountPaise,
      currency: 'INR',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
