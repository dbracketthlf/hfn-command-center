-- Preserve immutable inbound history while recording which source event is
-- currently effective for operational state. This is metadata only: it does
-- not rewrite workflow, KPI, ownership, or historical event attribution.
alter table loans add column if not exists current_stage_effective_at timestamptz;
alter table loans add column if not exists current_stage_event_id uuid references loan_stage_events(id) on delete restrict;
alter table loans add column if not exists operational_snapshot_effective_at timestamptz;

-- Establish a conservative baseline for rows received before source-order
-- tracking existed. Later source events must be newer than this baseline to
-- replace the operational snapshot.
with current_events as (
  select l.id loan_id,e.id,e.occurred_at,
    row_number() over (
      partition by l.id
      order by e.occurred_at desc,e.received_at asc,e.id asc
    ) event_rank
  from loans l
  join loan_stage_events e
    on e.loan_id=l.id and e.event_type=l.current_stage
  where l.current_stage_effective_at is null
)
update loans l
set current_stage_effective_at = current_event.occurred_at,
    current_stage_event_id = current_event.id
from current_events current_event
where l.id=current_event.loan_id
  and current_event.event_rank=1
  and l.current_stage_effective_at is null;

-- Do not use loans.updated_at here: that is HFN write time and could reject a
-- later, legitimate ARIVE tracker update.
update loans
set operational_snapshot_effective_at = current_stage_effective_at
where operational_snapshot_effective_at is null;

create index if not exists loans_current_stage_effective_at
  on loans(current_stage_effective_at);
