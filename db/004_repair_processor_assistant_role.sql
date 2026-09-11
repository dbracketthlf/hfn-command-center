-- Repair only redacted, operational team-role snapshots. Raw ARIVE payloads are
-- never needed or read. A unique AssistantProcessor is safe to assign; zero or
-- multiple candidates remain unassigned with an explicit review exception.
with resolved as (
  select
    ie.id,
    coalesce(
      jsonb_agg(member) filter (where member->>'role' = 'AssistantProcessor'),
      '[]'::jsonb
    ) as matches
  from inbound_events ie
  left join lateral jsonb_array_elements(ie.payload->'loanTeamRoles') member on true
  where ie.source = 'zapier-arive'
    and jsonb_typeof(ie.payload->'loanTeamRoles') = 'array'
  group by ie.id
), assignments as (
  select
    id,
    case when jsonb_array_length(matches) = 1 then matches->0->>'name' end as assistant,
    case when jsonb_array_length(matches) = 1 then matches->0->>'email' end as assistant_email,
    case
      when jsonb_array_length(matches) = 1 then null
      when jsonb_array_length(matches) = 0 then 'No Loan Team User with Loan Role AssistantProcessor'
      else 'Multiple Loan Team Users with Loan Role AssistantProcessor'
    end as assignment_exception
  from resolved
)
update inbound_events ie
set payload = ie.payload || jsonb_build_object(
  'processorAssistant', a.assistant,
  'processorAssistantEmail', a.assistant_email,
  'assignmentException', a.assignment_exception
)
from assignments a
where ie.id = a.id;

-- Mirror the newest corrected snapshot for each loan in the latest stage-event
-- metadata used by the live operational dashboard. Duplicate deliveries cannot
-- change the outcome because only the most recently received snapshot is used.
with latest_snapshots as (
  select distinct on (ie.payload->>'ariveSystemGuid')
    ie.payload->>'ariveSystemGuid' as arive_system_guid,
    ie.payload->'loanTeamRoles' as loan_team_roles
  from inbound_events ie
  where ie.source = 'zapier-arive'
    and coalesce(ie.payload->>'ariveSystemGuid', '') <> ''
    and jsonb_typeof(ie.payload->'loanTeamRoles') = 'array'
  order by ie.payload->>'ariveSystemGuid', ie.received_at desc, ie.id desc
), resolved as (
  select
    snapshot.arive_system_guid,
    coalesce(
      jsonb_agg(member) filter (where member->>'role' = 'AssistantProcessor'),
      '[]'::jsonb
    ) as matches
  from latest_snapshots snapshot
  left join lateral jsonb_array_elements(snapshot.loan_team_roles) member on true
  group by snapshot.arive_system_guid
), assignments as (
  select
    arive_system_guid,
    case when jsonb_array_length(matches) = 1 then matches->0->>'name' end as assistant,
    case when jsonb_array_length(matches) = 1 then matches->0->>'email' end as assistant_email,
    case
      when jsonb_array_length(matches) = 1 then null
      when jsonb_array_length(matches) = 0 then 'No Loan Team User with Loan Role AssistantProcessor'
      else 'Multiple Loan Team Users with Loan Role AssistantProcessor'
    end as assignment_exception
  from resolved
)
update loan_stage_events event
set metadata = event.metadata || jsonb_build_object(
  'assistant', a.assistant,
  'assistantEmail', a.assistant_email,
  'assignmentException', a.assignment_exception
)
from assignments a
join loans loan on loan.arive_system_guid = a.arive_system_guid
where event.id = (
  select latest_event.id
  from loan_stage_events latest_event
  where latest_event.loan_id = loan.id
  order by latest_event.occurred_at desc, latest_event.received_at desc, latest_event.id desc
  limit 1
);
