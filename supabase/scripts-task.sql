-- A task for Ethan the moment a client's onboarding form comes in.
-- Applied 2026-11-05; safe to run twice.
--
-- "Make it so when a client fills in the onboarding form it auto adds a task
-- for Ethan to send the client video scripts." The form lands through
-- onboarding_link_save_intake (p_submit true), which stamps
-- onboarding_links.intake_submitted_at. This trigger watches that stamp:
-- the first time it is set for a link, a task "<Client> Send Video Scripts"
-- is made for Ethan, on the client, tagged onboarding, unless the client
-- already has one by that title. A form submitted again later (the client
-- changing an answer) does not make a second task. Done here rather than in
-- the page so it happens whether the form came through the link, was marked
-- in by hand, or the browser closed a moment too soon.
--
-- The title's wording is mirrored in src/lib/onboardingTasks.js
-- (scriptsTaskTitle), which the Slack "Form in" line and the checks read.

create or replace function public.scripts_task_on_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
begin
  if new.intake_submitted_at is null or old.intake_submitted_at is not null then
    return new;
  end if;
  select name into v_name from public.clients where id = new.client_id and archived = false;
  if v_name is null then
    return new;
  end if;
  v_title := v_name || ' Send Video Scripts';
  if not exists (select 1 from public.tasks t where t.client_id = new.client_id and lower(t.title) = lower(v_title)) then
    insert into public.tasks (title, description, status, priority, client_id, assignees, tags, start_date, created_by, checklist)
    values (
      v_title,
      'Their onboarding form is in. Send them the video scripts link from their page (Video scripts) so they can start recording.',
      'todo',
      'normal',
      new.client_id,
      array['Ethan'],
      array['onboarding'],
      current_date,
      'CRM',
      '[]'::jsonb
    );
  end if;
  return new;
end;
$$;

create or replace trigger onboarding_links_scripts_task
  after update of intake_submitted_at on public.onboarding_links
  for each row execute function public.scripts_task_on_form();
