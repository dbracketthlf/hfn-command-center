alter table loans add column if not exists borrower_first_name text;
alter table loans add column if not exists borrower_last_name text;
alter table workflow_tasks add column if not exists priority text not null default 'normal' check (priority in ('normal','high','urgent'));
alter table workflow_tasks add column if not exists created_by_email text;
alter table workflow_tasks add column if not exists created_by_role text;
alter table workflow_tasks add column if not exists manual_note text;
