-- Lets a seeker/pandit see the *name and avatar only* of the counterpart on
-- a request they're legitimately part of (accepted, or the pandit was
-- notified about it), without opening up the full profiles table.

-- Phone is included here deliberately: it is only exposed once a request
-- has been accepted (or, for a pandit, once notified), matching the
-- product requirement that contact info is revealed after acceptance.
create view public_counterpart_profiles
with (security_invoker = true) as
select p.id, p.full_name, p.avatar_url, p.phone
from profiles p
where exists (
  select 1 from requests r
  where (r.seeker_id = p.id or r.accepted_by = p.id)
    and (
      r.seeker_id = auth.uid()
      or r.accepted_by = auth.uid()
      or exists (
        select 1 from request_notifications rn
        where rn.request_id = r.id and rn.pandit_id = auth.uid()
      )
    )
);

grant select on public_counterpart_profiles to authenticated;
