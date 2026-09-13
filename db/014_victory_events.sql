create table victory_events (
  id uuid primary key,
  event_type text not null check (event_type in ('loan_funded','quick_ctc','funding_count_goal_hit','funding_volume_goal_hit')),
  loan_id uuid references loans,
  display_loan_id text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}',
  dedupe_key text not null unique
);
create index victory_events_created_at on victory_events(created_at);
