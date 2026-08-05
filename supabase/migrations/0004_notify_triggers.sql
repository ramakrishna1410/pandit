-- Wires request insert/accept events straight to the Edge Functions via
-- pg_net, so the notify flow doesn't depend on manually configuring
-- Database Webhooks in the dashboard. Requires two project-level settings
-- to be set once after `supabase functions deploy` (values come from your
-- Supabase project settings — Project URL and the `service_role` key):
--
--   alter database postgres set app.settings.edge_function_base_url =
--     'https://<project-ref>.functions.supabase.co';
--   alter database postgres set app.settings.service_role_key =
--     '<service-role-key>';
--
-- (Not embedded in this migration since it's a secret and project-specific.)

create extension if not exists pg_net;

create or replace function notify_edge_function(function_name text, payload jsonb)
returns void
as $$
declare
  base_url text := current_setting('app.settings.edge_function_base_url', true);
  service_key text := current_setting('app.settings.service_role_key', true);
begin
  if base_url is null or service_key is null then
    -- Not configured yet (e.g. fresh local dev DB) — skip silently rather
    -- than failing the insert/update that triggered this.
    return;
  end if;

  perform net.http_post(
    url := base_url || '/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := payload
  );
end;
$$ language plpgsql security definer set search_path = public;

create or replace function on_request_inserted()
returns trigger as $$
begin
  perform notify_edge_function(
    'notify-nearby-pandits',
    jsonb_build_object('type', 'INSERT', 'table', 'requests', 'record', to_jsonb(new))
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_nearby_pandits
  after insert on requests
  for each row execute function on_request_inserted();

create or replace function on_request_accepted()
returns trigger as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform notify_edge_function(
      'notify-seeker-accepted',
      jsonb_build_object(
        'type', 'UPDATE',
        'table', 'requests',
        'record', to_jsonb(new),
        'old_record', to_jsonb(old)
      )
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_seeker_accepted
  after update on requests
  for each row execute function on_request_accepted();
