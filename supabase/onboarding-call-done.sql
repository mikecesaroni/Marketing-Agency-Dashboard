-- "Make so I can click if the onboarding call has been done yet, so it can be
-- known in the morning brief and it does not say it is on us" (2026-11-08).
--
-- The pipeline already reads the call sheet: any row in onboarding_call_steps
-- for a client means the call happened (nextSteps.js, callDone), and the
-- Client tiers board's tick on "Onboarding call done" writes one row with
-- step_key 'marked-done' (src/lib/completeStep.js). What was missing was a
-- button where the call is worked, on the client page's Live onboarding call
-- sheet, and a name on the row. This adds the name; the button is in
-- src/components/OnboardingCallPanel.jsx. Nothing in the brief changes: the
-- team-digest bundle reads the same table (pipelineRows.js).
--
-- Applied live on 2026-11-08.

alter table public.onboarding_call_steps add column if not exists done_by text;

comment on column public.onboarding_call_steps.done_by is
  'Who ticked it (the CRM name), for the marked-done row written from the client page or the Client tiers board.';
