-- The business name on the onboarding form IS the client's name.
--
-- Clients are created in the CRM before the form is filled in, usually from
-- whatever the first email said ("Nick Fulciniti", "Tito Appliances"). Then
-- the client types the real name into the form and the two drift apart: the
-- intake says "Classic Home Services", the client page still says "Nick
-- Fulciniti", and every message, ad name and report built off client.name
-- carries the wrong one.
--
-- So the form wins. Whenever an intake row is written with a business name,
-- the client's name follows, trimmed. Done in the database rather than the
-- form so it holds for every path that writes an intake: the public form the
-- client fills in, the internal form on the client page, and anything else.
--
-- Not the other way round: renaming a client in the CRM does not rewrite what
-- the client typed. The form is the record of what they said.

create or replace function sync_client_name_from_intake() returns trigger as $$
declare
  wanted text := nullif(btrim(new.business_name), '');
begin
  if wanted is not null then
    update clients set name = wanted
      where id = new.client_id and name is distinct from wanted;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists intake_business_name_to_client on onboarding_intake;
create trigger intake_business_name_to_client
  after insert or update of business_name on onboarding_intake
  for each row execute function sync_client_name_from_intake();

-- Bring the four that had drifted into line (2026-09-24): Dynamic Flow ->
-- Dynamic Flow, Inc.; Nick Fulciniti -> Classic Home Services; Perfect Breeze
-- LLC -> Perfect Breeze; Tito Appliances -> Tito's Appliances.
update clients c
  set name = btrim(i.business_name)
  from onboarding_intake i
  where i.client_id = c.id
    and nullif(btrim(i.business_name), '') is not null
    and c.name is distinct from btrim(i.business_name);
