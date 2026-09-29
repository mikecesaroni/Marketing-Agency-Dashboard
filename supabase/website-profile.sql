-- What a client's own website says, read by the read-website function and
-- carried in every client chat brief (src/lib/clientBrief.js), so scripts and
-- ads use their real offers, guarantees, towns and review quotes.
--
-- clients.website_profile        the fact sheet, plain text, written by Claude
--                                from the site's pages (only what the site says)
-- clients.website_profile_at     when it was last read (or last tried)
-- clients.website_profile_url    the address it read from
-- clients.website_profile_pages  every page that went into it
-- clients.website_profile_error  why the last read failed, null when it worked
alter table clients add column if not exists website_profile text;
alter table clients add column if not exists website_profile_at timestamptz;
alter table clients add column if not exists website_profile_url text;
alter table clients add column if not exists website_profile_pages text[];
alter table clients add column if not exists website_profile_error text;
