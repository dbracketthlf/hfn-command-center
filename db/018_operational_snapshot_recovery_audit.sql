create table if not exists operational_snapshot_recoveries (
  id uuid primary key,
  loan_id uuid not null references loans,
  recovered_at timestamptz not null,
  source_event_count integer not null check (source_event_count >= 0),
  snapshot_hash char(64) not null,
  metadata jsonb not null default '{}',
  unique (loan_id, snapshot_hash)
);
