-- Adds the commission-based pricing model on top of the existing
-- pending -> accepted flow: pending -> quoted -> confirmed.
--
-- A pandit no longer directly "accepts" a request; they send a price quote.
-- The seeker then pays a 10% commission in-app to confirm the booking (this
-- payment *is* the confirmation step — see confirm_request_payment below).
-- The remaining 90% is settled directly between the two parties afterward.
--
-- This also fixes a contact-info leak in the original schema: contact_name/
-- contact_phone lived directly on `requests`, readable by any pandit who'd
-- merely been notified (see 0001's "requests: pandit can select notified or
-- accepted" policy). They're moved to their own table here so RLS can
-- withhold them until the request is actually confirmed (commission paid).

-- ---------------------------------------------------------------------------
-- requests: new lifecycle columns
-- ---------------------------------------------------------------------------
alter table requests drop constraint requests_status_check;
alter table requests add constraint requests_status_check
  check (status in ('pending', 'quoted', 'confirmed', 'cancelled', 'expired', 'completed'));

alter table requests add column quoted_price numeric;
alter table requests add column quoted_at timestamptz;
alter table requests add column commission_rate numeric not null default 0.10;
alter table requests add column commission_amount numeric;
alter table requests add column confirmed_at timestamptz;
alter table requests add column quote_fallback_notified boolean not null default false;

-- ---------------------------------------------------------------------------
-- request_contacts: seeker's contact info, split out so RLS can gate it
-- ---------------------------------------------------------------------------
create table request_contacts (
  request_id uuid primary key references requests (id) on delete cascade,
  contact_name text not null,
  contact_phone text not null
);

insert into request_contacts (request_id, contact_name, contact_phone)
select id, contact_name, contact_phone from requests;

alter table requests drop column contact_name;
alter table requests drop column contact_phone;

alter table request_contacts enable row level security;

create policy "request_contacts: seeker can read own"
  on request_contacts for select using (
    exists (select 1 from requests r where r.id = request_id and r.seeker_id = auth.uid())
  );
create policy "request_contacts: pandit can read after confirmed"
  on request_contacts for select using (
    exists (
      select 1 from requests r
      where r.id = request_id and r.accepted_by = auth.uid() and r.status = 'confirmed'
    )
  );
create policy "request_contacts: seeker can insert own"
  on request_contacts for insert with check (
    exists (select 1 from requests r where r.id = request_id and r.seeker_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- payments: the 10% commission charge
-- ---------------------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  seeker_id uuid not null references profiles (id) on delete cascade,
  amount numeric not null,
  currency text not null default 'INR',
  gateway text not null default 'razorpay',
  gateway_order_id text,
  gateway_payment_id text,
  status text not null default 'created'
    check (status in ('created', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payments_request_id_idx on payments (request_id);

alter table payments enable row level security;

create policy "payments: seeker can read own"
  on payments for select using (auth.uid() = seeker_id);
create policy "payments: seeker can insert own"
  on payments for insert with check (auth.uid() = seeker_id);

-- ---------------------------------------------------------------------------
-- accept_request is replaced: it now records a quote instead of finalizing
-- the booking. Old signature (req_id, pandit) is dropped in favor of one
-- that also captures the price.
-- ---------------------------------------------------------------------------
drop function if exists accept_request(uuid, uuid);

create function accept_request(req_id uuid, pandit uuid, p_quoted_price numeric)
returns setof requests
as $$
  update requests
  set status = 'quoted',
      accepted_by = pandit,
      accepted_at = now(),
      quoted_price = p_quoted_price,
      quoted_at = now(),
      commission_amount = round(p_quoted_price * commission_rate, 2)
  where id = req_id and status = 'pending'
  returning *;
$$ language sql volatile security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- confirm_request_payment: atomic quoted -> confirmed transition, called by
-- the payment-webhook Edge Function (service role) once the gateway
-- confirms the commission charge succeeded.
-- ---------------------------------------------------------------------------
create function confirm_request_payment(p_request_id uuid, p_payment_id uuid)
returns setof requests
as $$
  update requests
  set status = 'confirmed', confirmed_at = now()
  where id = p_request_id and status = 'quoted'
  returning *;
$$ language sql volatile security definer set search_path = public;

create or replace function mark_payment_paid_after_confirm()
returns trigger as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    update payments set status = 'paid', paid_at = now()
    where request_id = new.id and status = 'created';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_mark_payment_paid
  after update on requests
  for each row execute function mark_payment_paid_after_confirm();

-- ---------------------------------------------------------------------------
-- nearby_requests_for_pandit only matches 'pending' requests already (see
-- 0001); no change needed there since quoted/confirmed requests should
-- naturally drop out of other pandits' feeds.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- public_counterpart_profiles: tighten to require actual confirmation
-- (commission paid), not just "notified" or "accepted" — closing the same
-- kind of early-reveal gap that request_contacts fixes above.
-- ---------------------------------------------------------------------------
drop view if exists public_counterpart_profiles;

create view public_counterpart_profiles
with (security_invoker = true) as
select p.id, p.full_name, p.avatar_url, p.phone
from profiles p
where exists (
  select 1 from requests r
  where r.status = 'confirmed'
    and (
      (r.seeker_id = auth.uid() and r.accepted_by = p.id)
      or (r.accepted_by = auth.uid() and r.seeker_id = p.id)
    )
);

grant select on public_counterpart_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- messages / ratings: require 'confirmed' rather than 'accepted'
-- ---------------------------------------------------------------------------
drop policy if exists "messages: participants can select" on messages;
drop policy if exists "messages: participants can insert" on messages;

create policy "messages: participants can select"
  on messages for select using (
    exists (
      select 1 from requests r
      where r.id = request_id
        and r.status = 'confirmed'
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );
create policy "messages: participants can insert"
  on messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.status = 'confirmed'
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );

drop policy if exists "ratings: seeker can insert for own request" on ratings;

create policy "ratings: seeker can insert for own request"
  on ratings for insert with check (
    auth.uid() = seeker_id
    and exists (
      select 1 from requests r
      where r.id = request_id and r.seeker_id = auth.uid() and r.status = 'confirmed'
    )
  );
