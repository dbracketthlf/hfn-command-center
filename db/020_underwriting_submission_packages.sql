-- Prospective, operational-only record of a specific underwriting re-submission round.
-- Package items intentionally contain no document names, borrower data, or raw ARIVE payload.
create table if not exists underwriting_submission_packages (
  id uuid primary key,
  loan_id uuid not null references loans(id),
  workflow_cycle integer not null check (workflow_cycle > 0),
  state text not null check (state in ('OPEN','SUBMITTED','ARIVE_CONFIRMED','CLOSED_UNSUBMITTED')),
  created_at timestamptz not null,
  submitted_at timestamptz,
  submitted_by_email text,
  arive_confirmed_at timestamptz,
  closed_at timestamptz,
  close_reason text,
  updated_at timestamptz not null default now(),
  unique (loan_id, workflow_cycle),
  check ((submitted_at is null) = (submitted_by_email is null))
);

create table if not exists underwriting_submission_package_items (
  id uuid primary key,
  package_id uuid not null references underwriting_submission_packages(id) on delete restrict,
  item_type text not null check (item_type in ('appraisal','title','insurance','payoff','borrower_conditions')),
  source_task_id uuid not null references workflow_tasks(id) on delete restrict,
  source_action text not null,
  ready_at timestamptz not null,
  ready_by_email text,
  created_at timestamptz not null default now(),
  unique (package_id, source_task_id)
);

create index if not exists underwriting_submission_packages_loan_cycle
  on underwriting_submission_packages(loan_id, workflow_cycle desc);
create index if not exists underwriting_submission_packages_open
  on underwriting_submission_packages(loan_id) where state='OPEN';
create index if not exists underwriting_submission_package_items_package
  on underwriting_submission_package_items(package_id);

create or replace function prevent_closed_underwriting_submission_package_item_change()
returns trigger language plpgsql as $$
declare package_state text;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'Underwriting submission package items are immutable';
  end if;
  select state into package_state from underwriting_submission_packages where id=new.package_id;
  if package_state is distinct from 'OPEN' then
    raise exception 'Cannot add an item to a non-open underwriting submission package';
  end if;
  return new;
end;
$$;

drop trigger if exists underwriting_submission_package_items_immutable on underwriting_submission_package_items;
create trigger underwriting_submission_package_items_immutable
before insert or update or delete on underwriting_submission_package_items
for each row execute function prevent_closed_underwriting_submission_package_item_change();
