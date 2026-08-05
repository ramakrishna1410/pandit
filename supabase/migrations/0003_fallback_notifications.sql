-- Fallback: if no pandit has responded to a pending request within a few
-- hours, flag it so a client-visible "expanding search" message can show
-- and (via a scheduled Edge Function, see supabase/functions/notify-seeker-accepted
-- sibling `notify-seeker-fallback`, wired through pg_cron below) the seeker
-- gets a heads-up push instead of silence.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function mark_stale_pending_requests()
returns void
as $$
  update requests
  set fallback_notified = true
  where status = 'pending'
    and fallback_notified = false
    and created_at < now() - interval '4 hours';
$$ language sql volatile security definer set search_path = public;

-- Runs every 30 minutes. The actual push send happens in the
-- `notify-seeker-fallback` Edge Function, invoked here via pg_net against
-- requests that just flipped fallback_notified — wire the HTTP call to
-- your deployed function URL after `supabase functions deploy`:
--
--   select cron.schedule(
--     'notify-seeker-fallback',
--     '*/30 * * * *',
--     $$
--       select net.http_post(
--         url := 'https://<project-ref>.functions.supabase.co/notify-seeker-fallback',
--         headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
--       );
--     $$
--   );
--
-- (Left as a manual post-deploy step since it embeds project-specific
-- secrets that don't belong in a version-controlled migration.)
select cron.schedule(
  'mark-stale-pending-requests',
  '*/30 * * * *',
  $$ select mark_stale_pending_requests(); $$
);
