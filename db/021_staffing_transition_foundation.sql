-- Additive staffing foundation. Existing employee roles, tasks, events, and KPI
-- observations remain untouched; capabilities and attribution are opt-in.
create table if not exists employee_capabilities (
  employee_id uuid not null references employees(id) on delete restrict,
  capability text not null check (capability in ('admin','processor','processor_assistant')),
  created_at timestamptz not null default now(),
  primary key (employee_id, capability)
);

insert into employee_capabilities(employee_id, capability)
select id, role from employees
on conflict do nothing;

create table if not exists operational_assignment_overrides (
  id uuid primary key,
  loan_id uuid not null references loans(id) on delete restrict,
  owner_role text not null check (owner_role in ('processor','processor_assistant')),
  employee_id uuid not null references employees(id) on delete restrict,
  reason text not null check (char_length(reason) between 1 and 160),
  effective_at timestamptz not null,
  released_at timestamptz,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (released_at is null or released_at >= effective_at)
);
create unique index if not exists operational_assignment_overrides_one_active
  on operational_assignment_overrides(loan_id, owner_role) where released_at is null;
create index if not exists operational_assignment_overrides_active_employee
  on operational_assignment_overrides(employee_id) where released_at is null;

-- New observations receive immutable attribution. Existing rows remain null and
-- are resolved only from their persisted source event at read time when possible.
alter table sla_measurements add column if not exists attributed_employee_id uuid references employees(id) on delete restrict;
alter table assistant_tasks add column if not exists attributed_employee_id uuid references employees(id) on delete restrict;
create index if not exists sla_measurements_attributed_employee on sla_measurements(attributed_employee_id);
create index if not exists assistant_tasks_attributed_employee on assistant_tasks(attributed_employee_id);
