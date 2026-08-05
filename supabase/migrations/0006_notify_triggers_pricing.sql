-- Updates the notify triggers from 0004 for the pending -> quoted ->
-- confirmed lifecycle introduced in 0005. The old trigger fired on
-- status = 'accepted', which no longer occurs.

drop trigger if exists trg_notify_seeker_accepted on requests;
drop function if exists on_request_accepted();

create or replace function on_request_quoted()
returns trigger as $$
begin
  if new.status = 'quoted' and old.status is distinct from 'quoted' then
    perform notify_edge_function(
      'notify-quote-ready',
      jsonb_build_object('type', 'UPDATE', 'table', 'requests', 'record', to_jsonb(new), 'old_record', to_jsonb(old))
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_quote_ready
  after update on requests
  for each row execute function on_request_quoted();

create or replace function on_request_confirmed()
returns trigger as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform notify_edge_function(
      'notify-request-confirmed',
      jsonb_build_object('type', 'UPDATE', 'table', 'requests', 'record', to_jsonb(new), 'old_record', to_jsonb(old))
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_notify_request_confirmed
  after update on requests
  for each row execute function on_request_confirmed();
