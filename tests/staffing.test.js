import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTeamRows, hasCapability, resolveOperationalOwner, transitionPlan } from '../src/domain/staffing.js';

const david={id:'david',email:'david@internal.example',displayName:'David Brackett',active:true,capabilities:['admin','processor']};
const susan={id:'susan',email:'susan@internal.example',displayName:'Susan Vu',active:false,capabilities:['processor']};
const prince={id:'prince',email:'prince@internal.example',displayName:'Prince Del Rosario',active:true,capabilities:['processor_assistant']};

test('capabilities allow a dual-role Admin and Processor without granting an unrelated role',()=>{
  assert.equal(hasCapability(david,'admin'),true);
  assert.equal(hasCapability(david,'processor'),true);
  assert.equal(hasCapability(david,'processor_assistant'),false);
});

test('active per-loan override wins, while inactive ARIVE ownership is never used for new routing',()=>{
  const overridden=resolveOperationalOwner({role:'processor',override:david,arive:susan});
  assert.equal(overridden.owner.email,david.email);
  assert.equal(overridden.source,'operational_override');
  const noOwner=resolveOperationalOwner({role:'processor',arive:susan});
  assert.equal(noOwner.owner,null);
  assert.equal(noOwner.source,'unassigned');
  assert.match(noOwner.exception,/No active processor assignment/);
});

test('unknown or wrong-capability ARIVE identities remain unassigned and create a reviewable exception',()=>{
  const wrongRole=resolveOperationalOwner({role:'processor',arive:prince});
  assert.equal(wrongRole.owner,null);
  assert.equal(wrongRole.source,'unassigned');
  assert.match(wrongRole.exception,/processor assignment/);
});

test('current team roster is dynamic and supports a shared assistant pool without named pairings',()=>{
  const team=activeTeamRows([susan,david,prince]);
  assert.deepEqual(team.map(row=>row.displayName),['David Brackett','Prince Del Rosario']);
  assert.equal(team.some(row=>row.displayName==='Susan Vu'),false);
  assert.equal(team.find(row=>row.displayName==='Prince Del Rosario').capabilities.includes('processor_assistant'),true);
});

test('staffing transition plans only active Processor ownership and never includes terminal or Assistant work',()=>{
  const plan=transitionPlan({
    fromEmail:susan.email,
    toEmployee:david,
    loans:[{loanId:'loan-1',processorEmail:susan.email},{loanId:'loan-2',processorEmail:'other@internal.example'}],
    tasks:[
      {id:'open',ownerRole:'processor',ownerEmail:susan.email,state:'action_required'},
      {id:'complete',ownerRole:'processor',ownerEmail:susan.email,state:'completed'},
      {id:'assistant',ownerRole:'processor_assistant',ownerEmail:susan.email,state:'waiting'}
    ]
  });
  assert.deepEqual(plan.loanIds,['loan-1']);
  assert.deepEqual(plan.taskIds,['open']);
});

test('staffing command is explicitly dry-run by default and its apply path only changes active Processor ownership',async()=>{
  const source=await (await import('node:fs/promises')).readFile(new URL('../scripts/staffing-transition.mjs',import.meta.url),'utf8');
  assert.match(source,/apply=process\.argv\.includes\('--apply'\)/);
  assert.match(source,/await client\.query\('rollback'\)/);
  assert.match(source,/owner_role='processor'/);
  assert.match(source,/state not in \('completed','cancelled','not_applicable'\)/);
  assert.match(source,/reassigned_due_to_staffing_change/);
  assert.match(source,/if\(deactivateSource\)await client\.query\(`update employees set active=false/i);
});

test('dashboard attribution uses immutable measurement/task source records instead of latest loan assignment',async()=>{
  const source=await (await import('node:fs/promises')).readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8');
  const dashboard=source.slice(source.indexOf('async dashboard()'),source.indexOf('async health()'));
  assert.match(dashboard,/left join loan_stage_events source_event on source_event\.id=m\.start_event_id/);
  assert.match(dashboard,/left join loan_stage_events created_event on created_event\.id=t\.created_from_event_id/);
  assert.match(dashboard,/attributed_employee_id/);
  assert.match(dashboard,/this\.activeOperationalTeam\(\)/);
});

test('unassigned Processor work is exposed to Admin as an assignment exception and never silently routed',async()=>{
  const [repository,ui]=await Promise.all([
    (await import('node:fs/promises')).readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8'),
    (await import('node:fs/promises')).readFile(new URL('../public/admin-command-center.js',import.meta.url),'utf8')
  ]);
  assert.match(repository,/processor_assignment_missing_or_inactive/);
  assert.match(repository,/open_processor_task_without_owner/);
  assert.match(ui,/Assignment Review/);
  assert.match(ui,/Unassigned work remains visible/);
});

test('all workflow owner roles resolve through the same capability-safe resolver rather than a named team mapping',async()=>{
  const repository=await (await import('node:fs/promises')).readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8');
  assert.match(repository,/resolveOperationalOwner\(client,\{loanId,role:'processor'/);
  assert.match(repository,/resolveOperationalOwner\(client,\{loanId,role:'processor_assistant'/);
  assert.match(repository,/processor:effectiveProcessor\?\.displayName/);
  assert.doesNotMatch(repository,/Susan Vu|Elizabeth Martinez|Joshua Quintanilla|Sophia Gomez|David Brackett|Prince Del Rosario/);
});
