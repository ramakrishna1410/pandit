# Pandit

A marketplace app for booking a pandit/guru for ceremonies (weddings, engagements,
housewarmings, last rites, etc.) — request nearby, available pandits, get a price
quote, and confirm by paying a 10% booking commission in-app. Built with Expo SDK 57
(Expo Router) and Supabase.

## Status

MVP implementation of the core matching + pricing flow:

- Phone-OTP auth with dual-role onboarding (seeker vs pandit).
- Seekers create a ceremony request with location, date, and ceremony type.
- Nearby, available, matching pandits are found via a PostGIS `ST_DWithin`
  query and pushed a notification (Expo Push).
- First pandit to send a quote wins the request (race-safe via an atomic SQL
  `UPDATE ... WHERE status='pending'`) — `pending → quoted`.
- The seeker reviews the quote and pays a 10% commission via Razorpay
  Checkout to confirm the booking — `quoted → confirmed`. The remaining 90%
  is settled directly with the pandit after the ceremony.
- Contact info (phone) is only revealed to each party once `confirmed`, not
  merely once quoted — this closes the "cancel in-app, pay cash" loophole
  that commission-based marketplaces like Uber/Ola are vulnerable to.
- Post-confirmation: in-app chat, cancellation, and post-ceremony 5-star ratings.
- Pandit-side day-granularity availability calendar.
- A `pg_cron` job flags requests pending >4h with no response so the seeker
  can be nudged instead of left in silence.

Deferred beyond MVP (see `docs/plan.md` if present, or the project's original
implementation plan): a real map view, masked/proxy calling, time-slot-level
availability, multi-role accounts, admin/moderation tooling, automated payout
of the pandit's 90% (currently settled offline between the two parties).

## Project structure

```
app/                  expo-router routes
  (auth)/              phone/OTP auth, role selection, pandit onboarding
  (seeker)/            seeker tabs: home, new request, my requests, profile
  (pandit)/            pandit tabs: nearby feed, calendar, profile
  request/[id]/chat.tsx  shared post-acceptance chat
src/
  lib/                 supabase client, auth context, push registration, Razorpay checkout flow
  components/          shared UI (Button, TextField, StatusBadge, RatingStars)
  hooks/                data-fetching hooks (ceremony types, location)
  types/                domain/database TypeScript types
supabase/
  migrations/           versioned SQL schema, RPCs, RLS policies, triggers
  functions/             Deno Edge Functions: push fan-out, Razorpay order + verify
```

## Setup

### 1. Install dependencies

```
npm install
```

### 2. Create a Supabase project

Create a project at [supabase.com](https://supabase.com), then:

```
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies everything under `supabase/migrations/` (schema, PostGIS setup,
matching RPCs, RLS policies, and the notify triggers).

Enable **Phone** auth under Authentication → Providers, and configure a real
SMS provider (Twilio/MessageBird/Vonage) — phone OTP won't deliver without one.

### 3. Configure environment variables

```
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
your project's Settings → API page.

### 4. Deploy the Edge Functions

```
npx supabase functions deploy notify-nearby-pandits
npx supabase functions deploy notify-quote-ready
npx supabase functions deploy notify-request-confirmed
npx supabase functions deploy notify-seeker-fallback
npx supabase functions deploy create-razorpay-order
npx supabase functions deploy verify-razorpay-payment
```

Then wire the DB → Edge Function triggers (one-time, per project, since it
embeds your service-role key — see the comment at the top of
`supabase/migrations/0004_notify_triggers.sql`):

```sql
alter database postgres set app.settings.edge_function_base_url =
  'https://<project-ref>.functions.supabase.co';
alter database postgres set app.settings.service_role_key =
  '<service-role-key>';
```

And schedule the fallback push (see the commented `cron.schedule` block at
the bottom of `supabase/migrations/0003_fallback_notifications.sql`).

### 5. Configure Razorpay

Create a [Razorpay](https://razorpay.com) account (test mode is fine to
start), grab the Key ID and Key Secret from Settings → API Keys, and set
them as Edge Function secrets (never put the key secret in client code or
`.env` — it's used only inside `create-razorpay-order` /
`verify-razorpay-payment`):

```
npx supabase secrets set RAZORPAY_KEY_ID=<your-key-id>
npx supabase secrets set RAZORPAY_KEY_SECRET=<your-key-secret>
```

The Key ID is returned to the client at checkout time (that's expected —
it's the publishable half of the pair); the Key Secret never leaves the
Edge Functions.

### 6. Push notifications require a development build

Expo Go no longer supports remote push notifications (since SDK 53), and
`react-native-razorpay` (used for the commission checkout) is a native
module Expo Go doesn't bundle either — so a dev client is required to test
either the notify flow or the payment flow:

```
npx eas login
npx eas init
npx eas build --profile development --platform android   # or ios
```

Install the resulting build on a device/simulator, then run:

```
npx expo start --dev-client
```

Everything else (auth, requests, Realtime status updates, chat) works fine
in plain Expo Go (`npx expo start`) without a dev build.

## Notable implementation details

- **Nearby matching** happens entirely server-side (`nearby_pandits` /
  `nearby_requests_for_pandit` SQL functions) — pandits' exact coordinates
  are never sent to the client, only computed distances.
- **First-accept-wins** is enforced by the `accept_request` RPC's
  conditional `UPDATE ... WHERE status = 'pending'`, not by client-side
  timing — a losing client gets zero rows back and shows "already taken."
- **Pricing model**: a pandit doesn't directly accept a request — they send
  a price quote (`accept_request` moves the request to `quoted` and records
  `quoted_price`/`commission_amount`). The seeker then pays a 10% commission
  in-app, which is the actual confirmation step (`confirm_request_payment`
  moves `quoted` → `confirmed`); the remaining 90% is settled directly with
  the pandit after the ceremony. Collecting the commission *before* contact
  info is revealed (see below) is deliberate — it's what stops the classic
  Uber/Ola-style workaround where a driver/pandit talks the customer into
  cancelling the in-app booking to avoid the platform's cut.
- **Contact info** (phone) is only exposed to the other party once a
  request is `confirmed` (commission paid) — via `request_contacts`' RLS
  (seeker's info, shown to the pandit) and the `public_counterpart_profiles`
  view (pandit's info, shown to the seeker).
- **Razorpay checkout** (`src/lib/payments.ts`'s `payCommission`) follows
  the standard client-checkout / server-verify pattern: `create-razorpay-order`
  creates the order server-side (the charge amount is read from the DB, never
  trusted from the client) and records a `payments` row; the client opens
  Razorpay's Checkout UI with that order; on success, `verify-razorpay-payment`
  independently recomputes the HMAC-SHA256 signature Razorpay returns before
  trusting it, then calls `confirm_request_payment` to flip the request
  `quoted → confirmed`. A malicious client can't skip straight to "confirmed"
  by faking a success callback — confirmation only happens after the
  signature check passes server-side.
