-- More than one Google Ads account on a client (2026-11-25): "make so I can
-- add multiple Google customer IDs to Google Ads for a client".
--
-- A client has ONE main account in google_ads_customer_id, as before: it is
-- what "connected" means everywhere in the CRM. Some clients have more: an
-- old account next to a new one, a second location, or Local Services living
-- in an account of its own. Those go here.
--
-- clients.google_ads_extra_customer_ids
--   The other accounts, ten digits each, no dashes. The nightly sync reads
--   every one of them exactly as it reads the main account (campaigns,
--   keywords, search terms, pay-per-lead campaigns and their leads) and files
--   the rows under the same client with that account's own customer_id. Every
--   report reads by client, so the numbers simply add up.
-- clients.google_ads_extra_status
--   How the last read of each extra account went, keyed by account id:
--   { "1234567890": { ok, error, spend, campaigns, synced_at } }. Kept apart
--   from google_ads_sync_error on purpose: that column is about the main
--   account and decides "No access yet" on the reports, and a second account
--   we cannot reach must not make a working client read as disconnected.
--
-- One account belongs to one client. The client page refuses an id another
-- client already carries, because the same account on two clients counts its
-- spend twice.
--
-- Safe to run more than once.

alter table public.clients add column if not exists google_ads_extra_customer_ids text[] not null default '{}';
alter table public.clients add column if not exists google_ads_extra_status jsonb;
