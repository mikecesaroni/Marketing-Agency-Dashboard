-- The client's logo, remembered for the Ad Studio.
--
-- A new ad opens with this logo already picked, so nobody chooses the same
-- file every time. Set when a logo is picked or uploaded in the Studio;
-- "Forget" under the picker clears it. Either a client-files storage path
-- (<client_id>/<file>) or a Drive reference (drive:<file id>), the same two
-- shapes saved_ads.logo_path takes.
alter table clients add column if not exists logo_path text;
