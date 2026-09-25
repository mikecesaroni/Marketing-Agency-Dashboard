-- Every client is on GoHighLevel from here on, so a new client starts on the
-- plan and the onboarding form always ends with the account details
-- (src/lib/clientForm.js). Existing clients are left as they are.
alter table clients alter column ghl_plan set default true;
