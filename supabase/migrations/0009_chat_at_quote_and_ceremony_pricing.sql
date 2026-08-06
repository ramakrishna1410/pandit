-- ---------------------------------------------------------------------------
-- Chat: open at 'quoted' instead of only 'confirmed', so seeker and pandit
-- can clarify ceremony details before the seeker commits to paying the
-- commission. Contact info (phone/name) stays gated to 'confirmed' via
-- request_contacts / public_counterpart_profiles -- unaffected here.
-- ---------------------------------------------------------------------------
drop policy if exists "messages: participants can select" on messages;
drop policy if exists "messages: participants can insert" on messages;

create policy "messages: participants can select"
  on messages for select using (
    exists (
      select 1 from requests r
      where r.id = request_id
        and r.status in ('quoted', 'confirmed', 'completed')
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );
create policy "messages: participants can insert"
  on messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from requests r
      where r.id = request_id
        and r.status in ('quoted', 'confirmed')
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );

-- Chat now opens before either party has the other's real phone number, so
-- block obvious phone numbers / links in message text server-side -- a
-- basic deterrent against trading contact info to book off-platform next
-- time (not foolproof, but matches what marketplace apps typically do).
create or replace function sanitize_message_body()
returns trigger as $$
begin
  new.body := regexp_replace(new.body, '(https?://\S+|www\.\S+)', '[link removed]', 'gi');
  new.body := regexp_replace(new.body, '(\+?\d[\d\-\s]{7,}\d)', '[number removed]', 'g');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sanitize_message_body on messages;
create trigger trg_sanitize_message_body
  before insert on messages
  for each row execute function sanitize_message_body();

-- ---------------------------------------------------------------------------
-- pandit_ceremony_types: capture what a pandit charges for each ceremony
-- they perform, set during onboarding, so seekers get an indicative price
-- range before ever submitting a request. Table is already publicly
-- readable (0001), so no RLS change needed to expose it.
-- ---------------------------------------------------------------------------
alter table pandit_ceremony_types add column price numeric;

-- Aggregated price range per ceremony type across onboarded pandits, for
-- the "new request" screen to show seekers before they pick a pandit.
create view ceremony_type_price_ranges
with (security_invoker = true) as
select
  ceremony_type_id,
  min(price) filter (where price is not null) as min_price,
  max(price) filter (where price is not null) as max_price,
  count(*) filter (where price is not null) as pandit_count
from pandit_ceremony_types
group by ceremony_type_id;

grant select on ceremony_type_price_ranges to authenticated, anon;
