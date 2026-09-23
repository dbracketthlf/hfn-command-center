import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { processorAssistantOnboardingPlan, processorAssistantIdentityReconciliationPlan } from '../src/domain/employee-onboarding.js';
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

test('explicit Processor Assistant identity reconciliation preserves an existing ID while reducing a verified legacy Admin to Assistant-only',()=>{
  const plan=processorAssistantIdentityReconciliationPlan({employeeId:'5e5b6592-97db-4a7e-9f98-18fc146dc677',email:identity.email,currentDisplayName:'Prince',displayName:identity.displayName,removeAdminCapability:true,existingEmployee:{id:'5e5b6592-97db-4a7e-9f98-18fc146dc677',email:identity.email,displayName:'Prince',role:'admin',active:true,capabilities:['admin']}});
  assert.deepEqual(plan,{action:'reconcile_existing_employee',employeeId:'5e5b6592-97db-4a7e-9f98-18fc146dc677',email:identity.email,currentDisplayName:'Prince',displayName:identity.displayName,finalRole:'processor_assistant',finalActive:true,finalCapabilities:['processor_assistant'],rename:true,activate:false,removeAdminCapability:true,addProcessorAssistantCapability:true});
  assert.throws(()=>processorAssistantIdentityReconciliationPlan({employeeId:'id',email:identity.email,currentDisplayName:'Prince',displayName:identity.displayName,existingEmployee:{id:'id',email:identity.email,displayName:'Prince',role:'admin',active:true,capabilities:['admin']}}),/remove-admin-capability/);
  assert.throws(()=>processorAssistantIdentityReconciliationPlan({employeeId:'id',email:identity.email,currentDisplayName:'Prince',displayName:identity.displayName,removeAdminCapability:true,existingEmployee:{id:'id',email:identity.email,displayName:'Prince',role:'admin',active:true,capabilities:['admin','processor']}}),/Processor access/);
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

test('explicit identity reconciliation requires acknowledgment, is dry-run by default, and never changes operational work',async()=>{
  const source=await readFile(new URL('../scripts/reconcile-processor-assistant-identity.mjs',import.meta.url),'utf8');
  assert.match(source,/--remove-admin-capability is required/);
  assert.match(source,/const .*apply=process\.argv\.includes\('--apply'\)/);
  assert.match(source,/if\(!apply\)\{await client\.query\('rollback'\)/);
  assert.match(source,/delete from employee_capabilities where employee_id=\$1 and capability in \('admin','processor'\)/);
  assert.match(source,/role='processor_assistant'/);
  assert.doesNotMatch(source,/update workflow_tasks|insert into workflow_tasks|delete from workflow_tasks|update loans|insert into loan_stage_events|sla_measurements|assistant_tasks/i);
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
