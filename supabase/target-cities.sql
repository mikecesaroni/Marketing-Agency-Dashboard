-- Adds the "Cities to Target in Ads" field to the intake form.
--
-- Kept separate from service_area: the area a client will physically travel to
-- is not the same as the list of cities worth buying ads in, and campaign
-- targeting needs the second one.
--
-- Run this in the Supabase SQL Editor. Safe to run twice.

alter table onboarding_intake add column if not exists target_cities text;
