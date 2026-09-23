import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { loadProcessorAssistantOnboardingPreflight } from '../src/storage/processor-assistant-onboarding-preflight.js';

const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL onboarding preflight qualifies workflow task state when joined loans also have state',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url)),schema=`hfn_onboarding_${randomUUID().replaceAll('-','')}`,adminId=randomUUID(),loanId=randomUUID(),taskId=randomUUID();
  await client.connect();
  try {
    await client.query(`create schema ${schema};set search_path to ${schema};create table employees(id uuid primary key,email text,display_name text,role text,active boolean);create table employee_capabilities(employee_id uuid,capability text);create table loans(id uuid primary key,arive_display_loan_id text,processing_eligible_at timestamptz,current_stage text,state text);create table loan_stage_events(id uuid primary key,loan_id uuid,event_type text,occurred_at timestamptz,received_at timestamptz,metadata jsonb);create table workflow_tasks(id uuid primary key,loan_id uuid,task_type text,state text,owner_role text,owner_email text,owner_name text)`);
    await client.query(`insert into employees values($1,'admin@hfn.test','Admin','admin',true)`,[adminId]);
    await client.query(`insert into employee_capabilities values($1,'admin')`,[adminId]);
    await client.query(`insert into loans values($1,'PRINCE-1',now(),'UNDERWRITING_SUBMITTED','CA')`,[loanId]);
    await client.query(`insert into loan_stage_events values($1,$2,'UNDERWRITING_SUBMITTED',now(),now(),$3)`,[randomUUID(),loanId,{assistant:'Prince Del Rosario',assistantEmail:'prince@hlfnetwork.com'}]);
    await client.query(`insert into workflow_tasks values($1,$2,'order_title_escrow','waiting','processor_assistant','prince@hlfnetwork.com','Prince Del Rosario')`,[taskId,loanId]);
    const result=await loadProcessorAssistantOnboardingPreflight(client,{email:'prince@hlfnetwork.com',displayName:'Prince Del Rosario',actorEmail:'admin@hfn.test'});
    assert.equal(result.taskResult.rows.length,1);
    assert.equal(result.taskResult.rows[0].state,'waiting');
  } finally {await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});
