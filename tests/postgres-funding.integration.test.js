import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { fundingAggregateSql } from '../src/storage/funding-aggregate.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { readFile } from 'node:fs/promises';

const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL funding aggregate deduplicates live funding and corrections',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url)),schema=`hfn_funding_${randomUUID().replaceAll('-','')}`;
  await client.connect();
  try{
    await client.query(`create schema ${schema};set search_path to ${schema}`);
    await client.query('create table loans(id uuid primary key,arive_display_loan_id text,loan_amount numeric,processing_eligible_at timestamptz);create table loan_stage_events(id uuid primary key,loan_id uuid,event_type text,occurred_at timestamptz);create table historical_funding_corrections(display_loan_id text primary key,funded_date date,loan_amount numeric)');
    const add=async(id,display,amount,type,at)=>{await client.query('insert into loans values($1,$2,$3,$4) on conflict(id) do nothing',[id,display,amount,'2026-01-01']);await client.query('insert into loan_stage_events values($1,$2,$3,$4)',[randomUUID(),id,type,at]);};
    const live=randomUUID();await add(live,'LIVE-1',500000,'LOAN_FUNDED','2026-09-03T18:00:00Z');await add(live,'LIVE-1',500000,'LOAN_FUNDED','2026-09-04T18:00:00Z');
    await client.query("insert into historical_funding_corrections values('LIVE-1','2026-09-03',999999),('CORR-1','2026-09-10',250000),('AUG-1','2026-08-30',300000)");
    const result=await client.query(fundingAggregateSql,[2026,9]);assert.equal(result.rows[0].count,2);assert.equal(Number(result.rows[0].volume),750000);
  }finally{await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});

test('PostgreSQL dashboard Funded MTD reuses the merged funding aggregate',{skip:!url},async t=>{
  const client=new Client(postgresTestClientOptions(url)),schema=`hfn_dashboard_funding_${randomUUID().replaceAll('-','')}`;
  await client.connect();
  try{
    await client.query(`create schema ${schema};set search_path to ${schema}`);
    // This test intentionally uses an isolated schema rather than the shared
    // test database schema. Keep its dashboard-facing tables aligned through
    // migration 022, including the effective current-stage event contract.
    await client.query(`create table loans(id uuid primary key,arive_display_loan_id text,loan_amount numeric,processing_eligible_at timestamptz,current_stage text,kpi_tracking_started_at timestamptz,current_stage_effective_at timestamptz,current_stage_event_id uuid,operational_snapshot_effective_at timestamptz);create table loan_stage_events(id uuid primary key,loan_id uuid,event_type text,occurred_at timestamptz,received_at timestamptz,metadata jsonb);alter table loans add constraint loans_current_stage_event_fk foreign key(current_stage_event_id) references loan_stage_events(id) on delete restrict;create table historical_funding_corrections(display_loan_id text primary key,funded_date date,loan_amount numeric);create table monthly_funding_goals(year smallint,month smallint,funded_loan_goal integer,funded_volume_goal numeric);create table employees(id uuid primary key,email text,display_name text,role text,active boolean);create table employee_capabilities(employee_id uuid,capability text);create table operational_assignment_overrides(id uuid primary key,loan_id uuid,owner_role text,employee_id uuid,effective_at timestamptz,released_at timestamptz,created_at timestamptz);create table assistant_tasks(loan_id uuid,task_type text,kpi_eligible boolean,applicable_at timestamptz,due_at timestamptz,completed_at timestamptz,created_from_event_id uuid,attributed_employee_id uuid);create table sla_rules(id uuid primary key,metric_key text,owner_role text);create table sla_measurements(loan_id uuid,rule_id uuid,state text,due_at timestamptz,evaluated_at timestamptz,start_event_id uuid,attributed_employee_id uuid)`);
    const add=async(display,amount,at)=>{const id=randomUUID(),eventId=randomUUID();await client.query('insert into loans(id,arive_display_loan_id,loan_amount,processing_eligible_at,current_stage,kpi_tracking_started_at,current_stage_effective_at,operational_snapshot_effective_at) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,display,amount,'2026-01-01','LOAN_FUNDED','2026-01-01',at,at]);await client.query('insert into loan_stage_events values($1,$2,$3,$4,$5,$6)',[eventId,id,'LOAN_FUNDED',at,at,{}]);await client.query('update loans set current_stage_event_id=$2 where id=$1',[id,eventId]);};
    await add('LIVE-1',500000,'2026-09-03T18:00:00Z');await client.query("insert into historical_funding_corrections values('LIVE-1','2026-09-03',999999),('CORR-1','2026-09-10',250000),('AUG-1','2026-08-30',300000)");await client.query('insert into monthly_funding_goals values(2026,9,30,15000000)');
    t.mock.timers.enable({apis:['Date'],now:new Date('2026-09-15T18:00:00Z')});const dashboard=await new PostgresAriveRepository(client).dashboard();assert.equal(dashboard.kpis.fundedMtd,2);assert.equal(dashboard.fundingGoal.fundedCount.actual,2);assert.equal(dashboard.kpis.fundedMtd,dashboard.fundingGoal.fundedCount.actual);assert.equal(dashboard.fundingGoal.fundedVolume.actual,750000);
  }finally{t.mock.timers.reset();await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});

test('PostgreSQL checklist mutation stores timestamptz values, toggles safely, and accepts only valid N/A',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url)),schema=`hfn_checklist_${randomUUID().replaceAll('-','')}`,taskId=randomUUID(),settlementId=randomUUID(),floodId=randomUUID(),at='2026-09-18T18:00:00.000Z';
  await client.connect();client.release=()=>{};
  try{
    await client.query(`create schema ${schema};set search_path to ${schema};create table workflow_tasks(id uuid primary key,task_type text,state text,owner_role text,owner_email text,completed_at timestamptz,updated_at timestamptz);create table workflow_task_checklist_items(id uuid primary key,task_id uuid,label text,state text,completed_at timestamptz,completed_by_email text);create table workflow_task_history(id uuid primary key,task_id uuid,occurred_at timestamptz,action text,from_state text,to_state text,actor_email text,note text,metadata jsonb)`);
    await client.query("insert into workflow_tasks(id,task_type,state,owner_role,owner_email) values($1,'ctc_closing_readiness','action_required','processor_assistant','joshua@hfn.test')",[taskId]);await client.query("insert into workflow_task_checklist_items(id,task_id,label,state) values($1,$2,'Settlement Statement','action_required'),($3,$2,'Flood Cert Invoice','action_required')",[settlementId,taskId,floodId]);
    const repo=new PostgresAriveRepository({connect:async()=>client}),employee={email:'joshua@hfn.test',role:'processor_assistant'};
    await repo.mutateWorkflowChecklist({employee,taskId,checklistItemId:settlementId,checklistState:'completed',at});let rows=(await client.query('select state,completed_at,completed_by_email from workflow_task_checklist_items where id=$1',[settlementId])).rows;assert.equal(rows[0].state,'completed');assert.equal(rows[0].completed_at.toISOString(),at);assert.equal(rows[0].completed_by_email,employee.email);
    await repo.mutateWorkflowChecklist({employee,taskId,checklistItemId:settlementId,checklistState:'action_required',at});rows=(await client.query('select state,completed_at,completed_by_email from workflow_task_checklist_items where id=$1',[settlementId])).rows;assert.equal(rows[0].state,'action_required');assert.equal(rows[0].completed_at,null);assert.equal(rows[0].completed_by_email,null);
    await assert.rejects(repo.mutateWorkflowChecklist({employee,taskId,checklistItemId:settlementId,checklistState:'not_applicable',at}),/required/);
    await repo.mutateWorkflowChecklist({employee,taskId,checklistItemId:settlementId,checklistState:'completed',at});await repo.mutateWorkflowChecklist({employee,taskId,checklistItemId:floodId,checklistState:'not_applicable',at});const task=(await client.query('select state,completed_at from workflow_tasks where id=$1',[taskId])).rows[0];assert.equal(task.state,'completed');assert.equal(task.completed_at.toISOString(),at);
  }finally{await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});

test('PostgreSQL underwriting submission packages enforce one cycle, strict item types, and immutable frozen membership',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url)),schema=`hfn_submission_package_${randomUUID().replaceAll('-','')}`,loanId=randomUUID(),taskId=randomUUID(),invalidTaskId=randomUUID(),packageId=randomUUID();
  await client.connect();
  try{
    await client.query(`create schema ${schema};set search_path to ${schema};create table loans(id uuid primary key);create table workflow_tasks(id uuid primary key)`);
    await client.query(await readFile(new URL('../db/020_underwriting_submission_packages.sql',import.meta.url),'utf8'));
    await client.query('insert into loans values($1)',[loanId]);await client.query('insert into workflow_tasks values($1),($2)',[taskId,invalidTaskId]);
    await client.query("insert into underwriting_submission_packages(id,loan_id,workflow_cycle,state,created_at) values($1,$2,1,'OPEN',now())",[packageId,loanId]);
    await client.query("insert into underwriting_submission_package_items(id,package_id,item_type,source_task_id,source_action,ready_at) values($1,$2,'title',$3,'review_add_to_next_uw_submission',now())",[randomUUID(),packageId,taskId]);
    await assert.rejects(client.query("insert into underwriting_submission_package_items(id,package_id,item_type,source_task_id,source_action,ready_at) values($1,$2,'other',$3,'manual',now())",[randomUUID(),packageId,invalidTaskId]),/item_type|check/i);
    await client.query("update underwriting_submission_packages set state='SUBMITTED',submitted_at=now(),submitted_by_email='processor@hfn.test' where id=$1",[packageId]);
    await assert.rejects(client.query("insert into underwriting_submission_package_items(id,package_id,item_type,source_task_id,source_action,ready_at) values($1,$2,'appraisal',$3,'manual',now())",[randomUUID(),packageId,invalidTaskId]),/non-open|underwriting/i);
  }finally{await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});
