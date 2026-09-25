import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { resolveOperationalOwnerForLoan } from '../src/storage/postgres-arive.js';

const url=process.env.TEST_DATABASE_URL;
const employee=({email,active=true})=>({id:randomUUID(),email,active});

test('PostgreSQL operational owner resolution selects the newest valid override before aggregating capabilities',{skip:!url},async()=>{
  const client=new Client(postgresTestClientOptions(url));
  const schema=`hfn_operational_owner_${randomUUID().replaceAll('-','')}`;
  const loanId=randomUUID();
  const override=employee({email:'override@hfn.test'});
  const inactive=employee({email:'inactive@hfn.test',active:false});
  const arive=employee({email:'arive@hfn.test'});
  const wrongCapability=employee({email:'wrong-capability@hfn.test'});
  await client.connect();
  try {
    await client.query(`create schema ${schema};set search_path to ${schema};create table employees(id uuid primary key,email text not null,display_name text not null,role text,active boolean not null);create table employee_capabilities(employee_id uuid not null,capability text not null);create table operational_assignment_overrides(id uuid primary key,loan_id uuid not null,owner_role text not null,employee_id uuid not null,effective_at timestamptz not null,released_at timestamptz,created_at timestamptz not null)`);
    await client.query(`insert into employees(id,email,display_name,role,active) values($1,$2,'Override','processor',true),($3,$4,'Inactive','processor',false),($5,$6,'ARIVE','processor',true),($7,$8,'Wrong capability','processor_assistant',true)`,[override.id,override.email,inactive.id,inactive.email,arive.id,arive.email,wrongCapability.id,wrongCapability.email]);
    await client.query(`insert into employee_capabilities(employee_id,capability) values($1,'processor'),($2,'processor'),($3,'processor_assistant')`,[override.id,arive.id,wrongCapability.id]);
    // A released historical row and a newer inactive row must not displace the
    // newest active override. This invokes the production aggregate query.
    await client.query(`insert into operational_assignment_overrides(id,loan_id,owner_role,employee_id,effective_at,released_at,created_at) values($1,$2,'processor',$3,'2026-09-01T12:00:00Z','2026-09-10T12:00:00Z','2026-09-01T12:00:00Z'),($4,$2,'processor',$5,'2026-09-15T12:00:00Z',null,'2026-09-15T12:00:00Z'),($6,$2,'processor',$7,'2026-09-20T12:00:00Z',null,'2026-09-20T12:00:00Z')`,[randomUUID(),loanId,arive.id,randomUUID(),inactive.id,randomUUID(),override.id]);
    const resolved=await resolveOperationalOwnerForLoan(client,{loanId,role:'processor',ariveEmail:arive.email});
    assert.equal(resolved.source,'operational_override');
    assert.equal(resolved.owner.email,override.email);
    assert.deepEqual(resolved.owner.capabilities,['processor']);

    const noOverrideLoan=randomUUID();
    const ariveFallback=await resolveOperationalOwnerForLoan(client,{loanId:noOverrideLoan,role:'processor',ariveEmail:arive.email});
    assert.equal(ariveFallback.source,'arive_active_employee');
    assert.equal(ariveFallback.owner.email,arive.email);

    const wrongCapabilityFallback=await resolveOperationalOwnerForLoan(client,{loanId:noOverrideLoan,role:'processor',ariveEmail:wrongCapability.email});
    assert.equal(wrongCapabilityFallback.owner,null);
    assert.equal(wrongCapabilityFallback.source,'unassigned');

    const inactiveFallback=await resolveOperationalOwnerForLoan(client,{loanId:noOverrideLoan,role:'processor',ariveEmail:inactive.email});
    assert.equal(inactiveFallback.owner,null);
    assert.equal(inactiveFallback.source,'unassigned');
  } finally {
    await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});
    await client.end();
  }
});
