-- Processing eligibility is a durable historical fact, never inferred from the
-- current loan status. Webhook audit history remains intact for all loans.
alter table loans add column if not exists processing_eligible_at timestamptz;

update loans loan
set processing_eligible_at = historical.entered_at
from (
  select loan_id, min(occurred_at) as entered_at
  from loan_stage_events
  where event_type = 'LOAN_SETUP'
  group by loan_id
) historical
where loan.id = historical.loan_id
  and loan.processing_eligible_at is null;

create or replace function hfn_mark_processing_eligible() returns trigger language plpgsql as $$
begin
  if new.event_type = 'LOAN_SETUP' then
    update loans set processing_eligible_at = coalesce(processing_eligible_at, new.occurred_at) where id = new.loan_id;
  end if;
  return new;
end;
$$;
drop trigger if exists hfn_mark_processing_eligible_on_stage on loan_stage_events;
create trigger hfn_mark_processing_eligible_on_stage before insert on loan_stage_events for each row execute function hfn_mark_processing_eligible();

create or replace function hfn_require_processing_eligibility() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from loans where id = new.loan_id and processing_eligible_at is not null) then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists hfn_require_processing_eligibility_on_assistant_task on assistant_tasks;
create trigger hfn_require_processing_eligibility_on_assistant_task before insert on assistant_tasks for each row execute function hfn_require_processing_eligibility();
