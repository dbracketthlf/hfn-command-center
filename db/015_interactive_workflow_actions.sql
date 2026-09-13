alter table workflow_tasks add column if not exists blocked_category text check (blocked_category in ('borrower','vendor','lender','ARIVE/system','internal','other'));
create index if not exists workflow_tasks_open_owner on workflow_tasks(owner_email,state,due_at,next_follow_up_at);
