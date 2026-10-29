-- "Meta ads live" switched off on purpose stays off.
--
-- The Meta sync (supabase/functions/sync-meta-kpis) marks a client live the
-- moment it sees spend on their ad account, so nobody has to tick the switch
-- by hand. It also re-syncs last week, so a client moved off Meta (MCL went
-- Google only) kept being switched back on by the spend from their last Meta
-- week, twice a day, and the "Meta ads stopped" alert fired again each time.
--
-- This stamps when the switch went off. The sync then only turns it back on
-- for spend dated AFTER that day. Turning the switch on by hand clears the
-- stamp. Applied 2026-10-29; safe to run twice.

alter table clients add column if not exists meta_ads_off_at timestamptz;

create or replace function public.clients_stamp_meta_off()
returns trigger
language plpgsql
as $$
begin
  if coalesce(old.meta_ads_active, false) and not coalesce(new.meta_ads_active, false) then
    new.meta_ads_off_at := now();
  elsif not coalesce(old.meta_ads_active, false) and coalesce(new.meta_ads_active, false) then
    new.meta_ads_off_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_stamp_meta_off on clients;
create trigger clients_stamp_meta_off
  before update of meta_ads_active on clients
  for each row execute function public.clients_stamp_meta_off();
