alter table assistant_tasks drop constraint if exists assistant_tasks_task_type_check;
alter table assistant_tasks add constraint assistant_tasks_task_type_check check (task_type in ('appraisal_ordered','title_ordered','insurance_ordered','title_received','insurance_received','appraisal_received','closing_disclosure_sent'));
