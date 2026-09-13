create table employees (
  id uuid primary key,
  email text not null unique,
  display_name text not null,
  role text not null check (role in ('processor','processor_assistant','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table auth_sessions (id uuid primary key,session_hash char(64) not null unique,employee_id uuid not null references employees,expires_at timestamptz not null,created_at timestamptz not null default now());
create table oidc_login_states (state_hash char(64) primary key,code_verifier text not null,nonce text not null,expires_at timestamptz not null,created_at timestamptz not null default now());
create index auth_sessions_active on auth_sessions(session_hash,expires_at);
