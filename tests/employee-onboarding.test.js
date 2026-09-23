import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { processorAssistantOnboardingPlan } from '../src/domain/employee-onboarding.js';
import { loadProcessorAssistantOnboardingPreflight, openAssistantTaskPredicate } from '../src/storage/processor-assistant-onboarding-preflight.js';

const identity={email:'prince@hlfnetwork.com',displayName:'Prince Del Rosario'};

test('Processor Assistant onboarding creates only the verified identity and capability when no employee exists',()=>{
  assert.deepEqual(processorAssistantOnboardingPlan(identity),{action:'create',...identity,capability:'processor_assistant'});
});

test('Processor Assistant onboarding safely reactivates the matching identity and does not grant unrelated capabilities',()=>{
  const plan=processorAssistantOnboardingPlan({...identity,existingEmployee:{...identity,role:'processor_assistant',active:false,capabilities:[]}});
  assert.equal(plan.action,'ensure');assert.equal(plan.activate,true);assert.equal(plan.addCapability,true);assert.equal(plan.capability,'processor_assistant');
});

test('Processor Assistant onboarding rejects conflicting identity, access, and existing-work email mismatches',()=>{
  assert.throws(()=>processorAssistantOnboardingPlan({...identity,existingEmployee:{email:identity.email,displayName:'Different Name',role:'processor_assistant',active:true,capabilities:['processor_assistant']}}),/conflicts/);
  assert.throws(()=>processorAssistantOnboardingPlan({...identity,existingEmployee:{...identity,role:'admin',active:true,capabilities:['admin']}}),/conflicting access/);
  assert.throws(()=>processorAssistantOnboardingPlan({...identity,identityMismatches:[{kind:'open_task_owner_email_mismatch'}]}),/different Assistant identity/);
});

test('onboarding command is dry-run by default, uses strict operator TLS, and does not redistribute workflow work',async()=>{
  const source=await readFile(new URL('../scripts/onboard-processor-assistant.mjs',import.meta.url),'utf8');
  assert.match(source,/postgresTestClientOptions\(process\.env\.DATABASE_URL\)/);
  assert.match(source,/const .*apply=process\.argv\.includes\('--apply'\)/);
  assert.match(source,/if\(!apply\)\{await client\.query\('rollback'\)/);
  assert.match(source,/open_task_owner_email_mismatch/);
  assert.match(source,/arive_assistant_email_mismatch/);
  assert.match(source,/existing_employee_name_email_mismatch/);
  assert.doesNotMatch(source,/update workflow_tasks|insert into workflow_tasks|delete from workflow_tasks/i);
  assert.doesNotMatch(source,/operational_assignment_overrides/i);
});

test('capability-driven repository paths have no hardcoded Prince or legacy Assistant roster',async()=>{
  const source=await readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8');
  assert.match(source,/activeOperationalTeam/);
  assert.match(source,/resolveOperationalOwner/);
  assert.doesNotMatch(source,/Prince Del Rosario|Joshua Quintanilla|Sophia Gomez/);
});

test('onboarding preflight serializes all reads on one pg.Client and qualifies workflow task state',async()=>{
  let active=0,maxActive=0;
  const client={query:async()=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,1));active--;return {rows:[]};}};
  await loadProcessorAssistantOnboardingPreflight(client,{...identity,actorEmail:'admin@hlfnetwork.com'});
  assert.equal(maxActive,1);
  assert.match(openAssistantTaskPredicate,/^t\.state not in/);
});
