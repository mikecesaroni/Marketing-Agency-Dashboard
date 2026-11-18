-- Monthly revenue on the onboarding form, and the baseline it sets.
--
-- 2026-11-18: "add in question to onboarding form asking current monthly
-- revenue. We want to know what revenue they were at when we started so we
-- can look back and see how much it has grown with our help."
--
--   current_monthly_revenue  the form's answer (US dollars a month). The
--                            client can change it while filling the form in.
--   revenue_at_start         the FIRST answer, kept: the number to measure
--   revenue_at_start_on      growth against, and the day it was given.
--
-- The trigger fills the baseline the first time a revenue arrives and never
-- touches it again, so a client re-opening the form months later and typing
-- today's number does not move where they started. onboarding_apply() writes
-- only the keys the form sends, and the form never sends the baseline.
--
-- Applied 2026-11-18. Safe to run again.

alter table public.onboarding_intake add column if not exists current_monthly_revenue numeric;
alter table public.onboarding_intake add column if not exists revenue_at_start numeric;
alter table public.onboarding_intake add column if not exists revenue_at_start_on date;

create or replace function public.onboarding_revenue_start()
returns trigger
language plpgsql
as $$
begin
  if new.current_monthly_revenue is not null and new.revenue_at_start is null then
    new.revenue_at_start := new.current_monthly_revenue;
    new.revenue_at_start_on := current_date;
  end if;
  return new;
end;
$$;

create or replace trigger onboarding_revenue_start
  before insert or update on public.onboarding_intake
  for each row execute function public.onboarding_revenue_start();
