-- Fixes "infinite recursion detected in policy for relation 'requests'".
--
-- The cycle: requests' SELECT policy (pandit branch) checks
-- request_notifications via EXISTS; request_notifications' SELECT policy
-- (seeker branch) checks requests via EXISTS. Evaluating either policy
-- pulls in the other's RLS-guarded query, and Postgres can't resolve the
-- mutual dependency.
--
-- Fix: replace the requests-side check with a SECURITY DEFINER function.
-- Such functions run as their owner (which bypasses RLS as the table
-- owner), so the query inside never re-triggers request_notifications'
-- policy, breaking the cycle at this end.

create or replace function pandit_is_notified(p_request_id uuid, p_pandit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from request_notifications
    where request_id = p_request_id and pandit_id = p_pandit_id
  );
$$;

drop policy if exists "requests: pandit can select notified or accepted" on requests;
drop policy if exists "requests: pandit can read pending, notified, or accepted" on requests;

create policy "requests: pandit can select notified or accepted"
  on requests for select using (
    auth.uid() = accepted_by
    or pandit_is_notified(requests.id, auth.uid())
  );
