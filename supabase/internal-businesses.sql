-- Businesses we run ourselves (Horizon HVAC, Horizon Water Co).
--
-- They live in `clients` so their Meta data can hang off client_id exactly
-- like everyone else's -- weekly_kpis and ad_daily both key on it, so there is
-- nowhere else to put the data without duplicating both tables.
--
-- They are NOT clients: no billing, no deliverables, no LSA setup tracking,
-- and they must never reach client counts or MRR. `is_internal` is what keeps
-- them out; the app filters on it everywhere a client list is shown, and
-- surfaces them only in Reports under their own heading.

alter table clients add column if not exists is_internal boolean not null default false;

create index if not exists clients_is_internal_idx on clients (is_internal);

-- The sync deliberately does NOT filter on is_internal: these accounts should
-- keep pulling Meta data like any other, they just don't show up as clients.
-- Guarded on the ad account id rather than `on conflict`: there is no unique
-- constraint on clients.name, so on-conflict would silently insert duplicates
-- if this file were run twice.
insert into clients (name, industry, market, meta_ad_account_id, is_internal, meta_ads_active, lsa_active, archived)
select v.name, v.industry, v.market, v.acct, true, true, false, false
from (values
  ('Horizon HVAC',     'HVAC',            'Rhode Island', '579874845095389'),
  ('Horizon Water Co', 'Water treatment', 'Rhode Island', '2932769373743278')
) as v(name, industry, market, acct)
where not exists (
  select 1 from clients c where c.meta_ad_account_id = v.acct
);

-- If a row for either already exists (e.g. added by hand), make sure it is
-- flagged internal rather than sitting in the client list.
update clients set is_internal = true
where meta_ad_account_id in ('579874845095389', '2932769373743278');
