create table workflow_tasks (
  id uuid primary key,
  loan_id uuid not null references loans,
  task_type text not null,
  title text not null,
  origin text not null check (origin in ('automatic','manual','conditional')),
  owner_role text not null check (owner_role in ('processor','processor_assistant','loan_officer','management','system')),
  owner_email text,
  owner_name text,
  source_trigger text,
  state text not null check (state in ('action_required','waiting','follow_up_due','due_soon','past_due','blocked','escalated','completed','cancelled','not_applicable')),
  created_at timestamptz not null,
  due_at timestamptz,
  completed_at timestamptz,
  kpi_eligible boolean not null default false,
  waiting_on text,
  follow_up_cadence_business_days integer check (follow_up_cadence_business_days > 0),
  last_follow_up_at timestamptz,
  next_follow_up_at timestamptz,
  follow_up_count integer not null default 0,
  blocked_at timestamptz,
  blocked_reason text,
  blocked_by_email text,
  escalation_level integer not null default 0,
  escalated_at timestamptz,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (loan_id, task_type)
);
create table workflow_task_history (
  id uuid primary key,
  task_id uuid not null references workflow_tasks,
  occurred_at timestamptz not null,
  action text not null,
  from_state text,
  to_state text,
  actor_email text,
  note text,
  metadata jsonb not null default '{}'
);
create table workflow_task_checklist_items (
  id uuid primary key,
  task_id uuid not null references workflow_tasks,
  label text not null,
  state text not null default 'action_required' check (state in ('action_required','completed','not_applicable')),
  completed_at timestamptz,
  completed_by_email text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}',
  unique(task_id,label)
);
create index workflow_tasks_open_by_loan on workflow_tasks(loan_id,state);
create index workflow_tasks_follow_up_due on workflow_tasks(next_follow_up_at) where state in ('waiting','follow_up_due');
