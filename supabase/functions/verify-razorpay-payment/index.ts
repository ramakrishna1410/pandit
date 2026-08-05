// Called by the seeker's client immediately after Razorpay Checkout
// succeeds (see app/(seeker)/requests/[id].tsx's acceptQuoteAndPay). Verifies
// the HMAC signature Razorpay returns to the client — this is the standard
// "client-side checkout, server-side verify" pattern; trusting the client's
// success callback alone would let anyone confirm a booking without paying.
//
// On a verified signature, marks the payment 'paid' and calls
// confirm_request_payment to atomically flip the request quoted -> confirmed
// (the same RPC a future server-to-server webhook would call, so this
// function and a webhook-based flow can coexist/be swapped later without
// touching the confirmation logic itself).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET')!;

interface RequestBody {
  paymentId: string; // our payments.id, returned by create-razorpay-order
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

// Deno's global `crypto.subtle` (Web Crypto) covers this — no extra
// dependency needed for a plain HMAC-SHA256 hex digest.
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
  return Array.from(signatureBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
  }

  const callerClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const { paymentId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = (await req.json()) as RequestBody;

  const expectedSignature = await hmacSha256Hex(razorpayKeySecret, `${razorpayOrderId}|${razorpayPaymentId}`);
  if (expectedSignature !== razorpaySignature) {
    return new Response(JSON.stringify({ error: 'Signature verification failed' }), { status: 400 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: payment, error: paymentLookupError } = await serviceClient
    .from('payments')
    .select('id, request_id, seeker_id, gateway_order_id, status')
    .eq('id', paymentId)
    .single();

  if (paymentLookupError || !payment) {
    return new Response(JSON.stringify({ error: 'Payment not found' }), { status: 404 });
  }
  if (payment.seeker_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Not your payment' }), { status: 403 });
  }
  if (payment.gateway_order_id !== razorpayOrderId) {
    return new Response(JSON.stringify({ error: 'Order mismatch' }), { status: 400 });
  }
  if (payment.status === 'paid') {
    return new Response(JSON.stringify({ alreadyConfirmed: true }), { status: 200 });
  }

  await serviceClient
    .from('payments')
    .update({ status: 'paid', gateway_payment_id: razorpayPaymentId, paid_at: new Date().toISOString() })
    .eq('id', payment.id);

  const { data: confirmed, error: confirmError } = await serviceClient.rpc('confirm_request_payment', {
    p_request_id: payment.request_id,
    p_payment_id: payment.id,
  });

  if (confirmError || !confirmed || confirmed.length === 0) {
    // Payment is marked paid either way — this just means the request
    // wasn't in 'quoted' anymore (e.g. seeker double-tapped pay, or it was
    // somehow already confirmed). Not a failure from the payer's side.
    return new Response(JSON.stringify({ paid: true, confirmed: false, error: confirmError?.message }), {
      status: 200,
    });
  }

  return new Response(JSON.stringify({ paid: true, confirmed: true, request: confirmed[0] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
