-- Pandit booking app: core schema, PostGIS matching RPCs, and RLS policies.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  full_name text,
  role text check (role in ('seeker', 'pandit')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- ceremony_types (seeded lookup)
-- ---------------------------------------------------------------------------
create table ceremony_types (
  id serial primary key,
  name text not null unique,
  icon text
);

insert into ceremony_types (name, icon) values
  ('Wedding', 'rings'),
  ('Engagement', 'ring'),
  ('Griha Pravesh (Housewarming)', 'home'),
  ('Naming Ceremony', 'baby'),
  ('Last Rites (Antyesti)', 'flame'),
  ('Satyanarayan Puja', 'sun'),
  ('Griha Shanti', 'shield'),
  ('Mundan (Tonsure)', 'scissors'),
  ('Other', 'sparkles');

-- ---------------------------------------------------------------------------
-- pandit_profiles
-- ---------------------------------------------------------------------------
create table pandit_profiles (
  id uuid primary key references profiles (id) on delete cascade,
  bio text,
  languages text[] not null default '{}',
  years_experience int,
  base_location geography(Point, 4326),
  base_address_text text,
  service_radius_km numeric not null default 25,
  avg_rating numeric not null default 0,
  rating_count int not null default 0,
  is_available boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index pandit_profiles_base_location_idx on pandit_profiles using gist (base_location);

create table pandit_ceremony_types (
  pandit_id uuid references pandit_profiles (id) on delete cascade,
  ceremony_type_id int references ceremony_types (id) on delete cascade,
  primary key (pandit_id, ceremony_type_id)
);

create table pandit_availability (
  id uuid primary key default gen_random_uuid(),
  pandit_id uuid not null references pandit_profiles (id) on delete cascade,
  date date not null,
  status text not null check (status in ('available', 'busy', 'blocked')),
  unique (pandit_id, date)
);

-- ---------------------------------------------------------------------------
-- requests
-- ---------------------------------------------------------------------------
create table requests (
  id uuid primary key default gen_random_uuid(),
  seeker_id uuid not null references profiles (id) on delete cascade,
  ceremony_type_id int not null references ceremony_types (id),
  contact_name text not null,
  contact_phone text not null,
  ceremony_date date not null,
  location geography(Point, 4326) not null,
  address_text text not null,
  notes text,
  budget_estimate numeric,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'cancelled', 'expired', 'completed')),
  accepted_by uuid references pandit_profiles (id),
  accepted_at timestamptz,
  fallback_notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index requests_location_idx on requests using gist (location);
create index requests_status_date_idx on requests (status, ceremony_date);

create table request_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  pandit_id uuid not null references pandit_profiles (id) on delete cascade,
  sent_at timestamptz not null default now(),
  push_status text
);

create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  expo_push_token text not null unique,
  device_info jsonb,
  updated_at timestamptz not null default now()
);

create table ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests (id) on delete cascade,
  seeker_id uuid not null references profiles (id),
  pandit_id uuid not null references pandit_profiles (id),
  stars int not null check (stars between 1 and 5),
  review_text text,
  created_at timestamptz not null default now()
);

create function handle_new_rating()
returns trigger as $$
begin
  update pandit_profiles
  set rating_count = rating_count + 1,
      avg_rating = (
        select avg(stars)::numeric(3,2)
        from ratings
        where pandit_id = new.pandit_id
      )
  where id = new.pandit_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_rating_created
  after insert on ratings
  for each row execute function handle_new_rating();

create table messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_request_id_idx on messages (request_id, created_at);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Server-side matching: never exposes raw pandit coordinates to callers.
create function nearby_pandits(
  req_location geography,
  radius_m int,
  req_date date,
  req_ceremony_type_id int
)
returns table (pandit_id uuid, distance_m float)
as $$
  select pp.id, st_distance(pp.base_location, req_location) as distance_m
  from pandit_profiles pp
  join pandit_ceremony_types pct
    on pct.pandit_id = pp.id and pct.ceremony_type_id = req_ceremony_type_id
  left join pandit_availability pa
    on pa.pandit_id = pp.id and pa.date = req_date
  where pp.is_available = true
    and (pa.status is null or pa.status = 'available')
    and pp.base_location is not null
    and st_dwithin(pp.base_location, req_location, radius_m)
  order by distance_m asc;
$$ language sql stable security definer set search_path = public;

-- Nearby *requests* for a pandit's live feed (uses the pandit's own current
-- device location, passed in by the client, not their stored base_location).
create function nearby_requests_for_pandit(
  pandit uuid,
  current_location geography,
  radius_m int
)
returns setof requests
as $$
  select r.*
  from requests r
  join pandit_ceremony_types pct
    on pct.pandit_id = pandit and pct.ceremony_type_id = r.ceremony_type_id
  where r.status = 'pending'
    and st_dwithin(r.location, current_location, radius_m)
  order by r.created_at desc;
$$ language sql stable security definer set search_path = public;

-- Atomic first-accept-wins update. Returns zero rows if already taken.
create function accept_request(req_id uuid, pandit uuid)
returns setof requests
as $$
  update requests
  set status = 'accepted', accepted_by = pandit, accepted_at = now()
  where id = req_id and status = 'pending'
  returning *;
$$ language sql volatile security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table pandit_profiles enable row level security;
alter table pandit_ceremony_types enable row level security;
alter table pandit_availability enable row level security;
alter table ceremony_types enable row level security;
alter table requests enable row level security;
alter table request_notifications enable row level security;
alter table device_tokens enable row level security;
alter table ratings enable row level security;
alter table messages enable row level security;

-- ceremony_types: public read-only lookup.
create policy "ceremony_types are publicly readable"
  on ceremony_types for select using (true);

-- profiles: owner can read/update own row. Any authenticated user can read
-- the (name, avatar) of a counterpart on a request they're a party to; kept
-- simple for MVP by allowing authenticated read of all profiles' public
-- columns via a view (see 0002 migration) rather than broad table access.
create policy "profiles: owner can select own"
  on profiles for select using (auth.uid() = id);
create policy "profiles: owner can update own"
  on profiles for update using (auth.uid() = id);
create policy "profiles: owner can insert own"
  on profiles for insert with check (auth.uid() = id);

-- pandit_profiles: publicly readable (browsing/matching UX), owner-writable.
create policy "pandit_profiles are publicly readable"
  on pandit_profiles for select using (true);
create policy "pandit_profiles: owner can insert"
  on pandit_profiles for insert with check (auth.uid() = id);
create policy "pandit_profiles: owner can update"
  on pandit_profiles for update using (auth.uid() = id);

create policy "pandit_ceremony_types are publicly readable"
  on pandit_ceremony_types for select using (true);
create policy "pandit_ceremony_types: owner can manage"
  on pandit_ceremony_types for all
  using (auth.uid() = pandit_id) with check (auth.uid() = pandit_id);

create policy "pandit_availability: owner can manage"
  on pandit_availability for all
  using (auth.uid() = pandit_id) with check (auth.uid() = pandit_id);
create policy "pandit_availability: public can read"
  on pandit_availability for select using (true);

-- requests: seeker owns their own; a pandit can see a request only if they
-- were notified about it or they are the one who accepted it.
create policy "requests: seeker can select own"
  on requests for select using (auth.uid() = seeker_id);
create policy "requests: pandit can select notified or accepted"
  on requests for select using (
    auth.uid() = accepted_by
    or exists (
      select 1 from request_notifications rn
      where rn.request_id = requests.id and rn.pandit_id = auth.uid()
    )
  );
create policy "requests: seeker can insert own"
  on requests for insert with check (auth.uid() = seeker_id);
create policy "requests: seeker can update own (cancel)"
  on requests for update using (auth.uid() = seeker_id);

-- request_notifications: a pandit can see rows addressed to them; the
-- seeker who owns the parent request can see who was notified.
create policy "request_notifications: pandit can select own"
  on request_notifications for select using (auth.uid() = pandit_id);
create policy "request_notifications: seeker can select for own request"
  on request_notifications for select using (
    exists (
      select 1 from requests r
      where r.id = request_notifications.request_id and r.seeker_id = auth.uid()
    )
  );

-- device_tokens: owner-only.
create policy "device_tokens: owner can manage"
  on device_tokens for all
  using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- ratings: seeker can insert a rating for their own accepted/completed
-- request; both parties can read ratings tied to a request they're part of.
create policy "ratings: seeker can insert for own request"
  on ratings for insert with check (
    auth.uid() = seeker_id
    and exists (
      select 1 from requests r
      where r.id = ratings.request_id
        and r.seeker_id = auth.uid()
        and r.accepted_by = ratings.pandit_id
        and r.status in ('accepted', 'completed')
    )
  );
create policy "ratings: participants can select"
  on ratings for select using (auth.uid() = seeker_id or auth.uid() = pandit_id);

-- messages: only the two participants of an accepted request, and only
-- once that request has actually been accepted.
create policy "messages: participants can select"
  on messages for select using (
    exists (
      select 1 from requests r
      where r.id = messages.request_id
        and r.status = 'accepted'
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );
create policy "messages: participants can insert"
  on messages for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from requests r
      where r.id = messages.request_id
        and r.status = 'accepted'
        and (r.seeker_id = auth.uid() or r.accepted_by = auth.uid())
    )
  );
