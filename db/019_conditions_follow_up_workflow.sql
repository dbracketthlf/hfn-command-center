alter table workflow_tasks add column if not exists workflow_cycle integer not null default 1 check (workflow_cycle > 0);

alter table workflow_tasks drop constraint if exists workflow_tasks_loan_id_task_type_key;

create unique index if not exists workflow_tasks_cycle_identity
  on workflow_tasks(loan_id,task_type,workflow_cycle);

create unique index if not exists workflow_tasks_one_open_cycle
  on workflow_tasks(loan_id,task_type)
  where state not in ('completed','cancelled','not_applicable');
