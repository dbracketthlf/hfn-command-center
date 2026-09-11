-- HFN began receiving ARIVE events after some loans had already entered normal
-- processing. Any observed normal processing stage is sufficient bootstrap
-- evidence; pre-processing, ADVERSE, and SUSPENDED are intentionally excluded.
create or replace function hfn_normal_processing_stage(stage text) returns boolean language sql immutable as $$
  select stage = any(array['LOAN_SETUP','DISCLOSURE_SENT','UNDERWRITING_SUBMITTED','APPROVED_WITH_CONDITION','RE_SUBMITTAL','CLEAR_TO_CLOSE','DOCS_OUT','DOCS_SIGNED','LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID']);
$$;

update loans loan
set processing_eligible_at = evidence.entered_at
from (
  select l.id, least(coalesce(min(e.occurred_at), l.updated_at), l.updated_at) entered_at
  from loans l
  left join loan_stage_events e on e.loan_id=l.id and hfn_normal_processing_stage(e.event_type)
  where hfn_normal_processing_stage(l.current_stage) or e.id is not null
  group by l.id,l.updated_at
) evidence
where loan.id=evidence.id and loan.processing_eligible_at is null;

create or replace function hfn_mark_processing_eligible_from_loan() returns trigger language plpgsql as $$
begin
  if hfn_normal_processing_stage(new.current_stage) then
    new.processing_eligible_at := coalesce(new.processing_eligible_at, new.updated_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists hfn_mark_processing_eligible_on_loan on loans;
create trigger hfn_mark_processing_eligible_on_loan before insert or update of current_stage on loans for each row execute function hfn_mark_processing_eligible_from_loan();

create or replace function hfn_mark_processing_eligible() returns trigger language plpgsql as $$
begin
  if hfn_normal_processing_stage(new.event_type) then
    update loans set processing_eligible_at = coalesce(processing_eligible_at, new.occurred_at) where id = new.loan_id;
  end if;
  return new;
end;
$$;
