import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

const url=process.env.TEST_DATABASE_URL;

class SnapshotReceiveRepository extends PostgresAriveRepository {
  async syncWorkflowForEvent() {}
  async syncClosingDisclosureTask() { return 0; }
  async reconcileWorkflowMilestones() { return []; }
  async syncVictoryEvents() {}
}

test('PostgreSQL receive persists a JSONB operational snapshot without shifting the loan UUID parameter',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url));
  const schema=`hfn_operational_snapshot_${randomUUID().replaceAll('-','')}`;
  await client.connect();
  try {
    await client.query(`create schema ${schema};set search_path to ${schema};
      create table inbound_events(id uuid primary key,source text not null,external_id text,idempotency_key text not null,payload_hash text not null,received_at timestamptz not null,payload jsonb not null,processing_status text not null,failure_reason text,processed_at timestamptz);
      create table webhook_idempotency(source text not null,idempotency_key text not null,first_audit_id uuid not null,primary key(source,idempotency_key));
      create table loans(id uuid primary key,arive_system_guid text unique not null,arive_display_loan_id text,loan_number text,purpose text,mortgage_type text,city text,state text,current_stage text not null,created_at timestamptz not null,updated_at timestamptz not null,borrower_first_name text,borrower_last_name text,operational_snapshot jsonb,operational_snapshot_effective_at timestamptz,current_stage_effective_at timestamptz,current_stage_event_id uuid);
      create table loan_stage_events(id uuid primary key,loan_id uuid not null,event_type text not null,occurred_at timestamptz not null,received_at timestamptz not null,source text not null,source_event_id text not null,metadata jsonb not null);
      create table employees(id uuid primary key,email text not null,display_name text,role text,active boolean not null);
      create table employee_capabilities(employee_id uuid not null,capability text not null);
      create table operational_assignment_overrides(id uuid primary key,loan_id uuid not null,owner_role text not null,employee_id uuid not null,effective_at timestamptz not null,released_at timestamptz,created_at timestamptz not null);
    `);
    client.release=()=>{};
    const repository=new SnapshotReceiveRepository({query:(...args)=>client.query(...args),connect:async()=>client});
    const receivedAt='2026-09-25T19:00:00.000Z';
    const result=await repository.receive({zapierEventId:'snapshot-live-path',ariveLoanId:'snapshot-guid',ariveDisplayLoanId:'SNAPSHOT-1',currentLoanStatus_status:'LOAN_SETUP',currentLoanStatus_date:'2026-09-25T18:00:00.000Z',modifiedDateTime:'2026-09-25T18:30:00.000Z',appraisalStatus:'NOT_ORDERED',titleStatus:'NOT_ORDERED',hoiStatus:'NOT_ORDERED',lenderInvestorName:'PRMG'},receivedAt);
    assert.equal(result.ok,true);
    assert.equal(result.outcome,'processed');
    const loan=(await client.query(`select id,current_stage,current_stage_event_id,operational_snapshot,operational_snapshot_effective_at from loans where arive_system_guid='snapshot-guid'`)).rows[0];
    assert.equal(loan.current_stage,'LOAN_SETUP');
    assert.match(loan.current_stage_event_id,/^[0-9a-f-]{36}$/i);
    assert.deepEqual(loan.operational_snapshot,{milestoneDates:{},trackerContext:{appraisalStatus:'NOT_ORDERED',titleStatus:'NOT_ORDERED',hoiStatus:'NOT_ORDERED'},lenderInvestorName:'PRMG'});
    assert.equal(loan.operational_snapshot_effective_at.toISOString(),'2026-09-25T18:30:00.000Z');
    const event=(await client.query('select id from loan_stage_events where id=$1',[loan.current_stage_event_id])).rows[0];
    assert.ok(event?.id);

    const stale=await repository.mergeOperationalSnapshot(client,loan.id,{trackerContext:{titleStatus:'ORDERED'}},'2026-09-25T18:29:59.000Z');
    const equal=await repository.mergeOperationalSnapshot(client,loan.id,{trackerContext:{titleStatus:'ORDERED'}},'2026-09-25T18:30:00.000Z');
    const newer=await repository.mergeOperationalSnapshot(client,loan.id,{trackerContext:{titleStatus:'ORDERED'}},'2026-09-25T18:31:00.000Z');
    assert.equal(stale.mutated,false);
    assert.equal(equal.mutated,false);
    assert.equal(newer.mutated,true);
    const after=(await client.query('select current_stage,current_stage_event_id,operational_snapshot,operational_snapshot_effective_at from loans where id=$1',[loan.id])).rows[0];
    assert.equal(after.current_stage,'LOAN_SETUP');
    assert.equal(after.current_stage_event_id,loan.current_stage_event_id);
    assert.equal(after.operational_snapshot.trackerContext.titleStatus,'ORDERED');
    assert.equal(after.operational_snapshot_effective_at.toISOString(),'2026-09-25T18:31:00.000Z');
  } finally {
    await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});
    await client.end();
  }
});
