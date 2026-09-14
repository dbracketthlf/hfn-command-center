alter table loans add column if not exists operational_snapshot jsonb not null default '{}';
