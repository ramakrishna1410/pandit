import RazorpayCheckout from 'react-native-razorpay';
import { supabase } from './supabase';

interface PayCommissionParams {
  requestId: string;
  seekerName: string;
  seekerPhone: string;
}

export class PaymentCancelledError extends Error {}

// Full client-side half of the commission-payment flow: ask our backend to
// create a Razorpay order (create-razorpay-order Edge Function — this is
// where the actual charge amount is decided, never trust a client-supplied
// amount), open Razorpay's Checkout UI, then hand the result to
// verify-razorpay-payment to confirm the signature and flip the request to
// 'confirmed' server-side.
export async function payCommission({ requestId, seekerName, seekerPhone }: PayCommissionParams) {
  const { data: orderData, error: orderError } = await supabase.functions.invoke('create-razorpay-order', {
    body: { requestId },
  });
  if (orderError) throw new Error(orderError.message);
  if (orderData?.error) throw new Error(orderData.error);

  const { paymentId, razorpayOrderId, razorpayKeyId, amount, currency } = orderData;

  let checkoutResult;
  try {
    checkoutResult = await RazorpayCheckout.open({
      key: razorpayKeyId,
      order_id: razorpayOrderId,
      amount,
      currency,
      name: 'Pandit',
      description: 'Booking commission',
      prefill: { name: seekerName, contact: seekerPhone },
      theme: { color: '#7A3E9D' },
    });
  } catch (err: unknown) {
    // react-native-razorpay rejects (rather than resolving with an error
    // field) when the user cancels or the payment fails.
    throw new PaymentCancelledError((err as { description?: string })?.description ?? 'Payment cancelled');
  }

  const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-razorpay-payment', {
    body: {
      paymentId,
      razorpayOrderId,
      razorpayPaymentId: checkoutResult.razorpay_payment_id,
      razorpaySignature: checkoutResult.razorpay_signature,
    },
  });
  if (verifyError) throw new Error(verifyError.message);
  if (verifyData?.error && !verifyData?.paid) throw new Error(verifyData.error);

  return verifyData;
}
