-- KPI scoring begins only when HFN observed LOAN_SETUP. Operational visibility
-- and task hydration continue for in-flight loans first observed downstream.
alter table loans add column if not exists kpi_tracking_started_at timestamptz;
alter table assistant_tasks add column if not exists kpi_eligible boolean not null default false;

update loans l
set kpi_tracking_started_at = setup.observed_at
from (select loan_id,min(occurred_at) observed_at from loan_stage_events where event_type='LOAN_SETUP' group by loan_id) setup
where l.id=setup.loan_id and l.kpi_tracking_started_at is null;
update assistant_tasks t set kpi_eligible=true from loans l where l.id=t.loan_id and l.kpi_tracking_started_at is not null;

create or replace function hfn_mark_processing_eligible() returns trigger language plpgsql as $$
begin
  if hfn_normal_processing_stage(new.event_type) then
    update loans set processing_eligible_at=coalesce(processing_eligible_at,new.occurred_at),kpi_tracking_started_at=case when new.event_type='LOAN_SETUP' then coalesce(kpi_tracking_started_at,new.occurred_at) else kpi_tracking_started_at end where id=new.loan_id;
  end if;
  return new;
end;
$$;

create or replace function hfn_require_processing_eligibility() returns trigger language plpgsql as $$
begin
  select kpi_tracking_started_at is not null into new.kpi_eligible from loans where id=new.loan_id and processing_eligible_at is not null;
  if new.kpi_eligible is null then return null; end if;
  return new;
end;
$$;

-- Hydrate existing tasks only when the latest redacted ARIVE operational snapshot
-- proves a completion date. No timestamp is invented for missing information.
with latest as (
  select distinct on (payload->>'ariveSystemGuid') payload->>'ariveSystemGuid' guid,payload
  from inbound_events where source='zapier-arive' and coalesce(payload->>'ariveSystemGuid','')<>''
  order by payload->>'ariveSystemGuid',received_at desc,id desc
), hydrated as (
  select t.id,case t.task_type
    when 'appraisal_ordered' then nullif(latest.payload->'milestoneDates'->>'appraisalOrderedDate','')::timestamptz
    when 'title_ordered' then nullif(latest.payload->'milestoneDates'->>'titleOrderedDate','')::timestamptz
    when 'insurance_ordered' then nullif(latest.payload->'milestoneDates'->>'hoiOrderedDate','')::timestamptz
    when 'title_received' then nullif(latest.payload->'milestoneDates'->>'titleReceivedDate','')::timestamptz
    when 'insurance_received' then nullif(latest.payload->'milestoneDates'->>'hoiReceivedDate','')::timestamptz
    when 'appraisal_received' then nullif(latest.payload->'milestoneDates'->>'appraisalReceivedDate','')::timestamptz
  end completed_at from assistant_tasks t join loans l on l.id=t.loan_id join latest on latest.guid=l.arive_system_guid
)
update assistant_tasks t set completed_at=h.completed_at,status='completed' from hydrated h where t.id=h.id and h.completed_at is not null and t.completed_at is distinct from h.completed_at;
