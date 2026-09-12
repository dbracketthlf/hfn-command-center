-- Ownership is explicit so Assistant Setup/Disclosure work cannot enter
-- Processor scorecards or Processor-attributed exception records.
alter table sla_rules add column if not exists owner_role text not null default 'processor' check (owner_role in ('processor','assistant'));

update sla_rules
set owner_role = 'assistant'
where lower(metric_key) like '%setup%'
   or lower(metric_key) like '%disclos%';
