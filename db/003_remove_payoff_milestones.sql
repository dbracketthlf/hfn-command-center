-- Payoff is absent from the confirmed ARIVE/Zapier payload. Remove prototype rows so no KPI or dashboard query can count them.
delete from assistant_tasks where task_type in ('payoff_ordered','payoff_received');
alter table assistant_tasks drop constraint if exists assistant_tasks_task_type_check;
alter table assistant_tasks add constraint assistant_tasks_task_type_check check (task_type in ('appraisal_ordered','title_ordered','insurance_ordered','title_received','insurance_received','appraisal_received'));
