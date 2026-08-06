-- The pandit feed (nearby_requests_for_pandit RPC, security definer) finds
-- pending requests matching a pandit's ceremony types, but app/(pandit)/feed.tsx
-- then re-fetches those rows with a plain (non-security-definer) select that
-- IS subject to RLS. The only existing "pandit can select" policy requires a
-- request_notifications row, which is only populated by the notify-nearby-pandits
-- Edge Function pipeline (0004) -- unconfigured in most dev/local setups. That
-- silently empties the feed's second query even when matching requests exist.
--
-- Grant read access directly for the browsing case, mirroring the same filter
-- the RPC already uses. Contact info stays protected since it lives in the
-- separately-gated request_contacts table (0005), not on requests itself.
create policy "requests: pandit can browse pending matching ceremony types"
  on requests for select using (
    status = 'pending'
    and exists (
      select 1 from pandit_ceremony_types pct
      where pct.pandit_id = auth.uid() and pct.ceremony_type_id = requests.ceremony_type_id
    )
  );
