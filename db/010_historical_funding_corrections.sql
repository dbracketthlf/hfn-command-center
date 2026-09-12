create table historical_funding_corrections (
  id uuid primary key,
  display_loan_id text not null unique,
  funded_date date not null,
  loan_amount numeric(14,2) not null check (loan_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
