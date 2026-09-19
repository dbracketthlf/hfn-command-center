import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staleVendorTaskCandidates } from '../src/domain/workflow-stale-vendor-audit.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

test('stale vendor audit identifies only authoritative received evidence that can safely resolve open work',()=>{
  const candidates=staleVendorTaskCandidates({
    milestoneDates:{titleReceivedDate:'2026-09-15',appraisalReceivedDate:'2026-09-14',hoiReceivedDate:'2026-09-13'},
    tasks:[
      {taskType:'order_title_escrow',state:'past_due'},
      {taskType:'appraisal_follow_up',state:'waiting'},
      {taskType:'request_insurance_eoi',state:'cancelled'}
    ]
  });
  assert.deepEqual(candidates.map(item=>[item.category,item.taskType,item.finalMilestone,item.proposedAction]),[
    ['initial_task_superseded','order_title_escrow','title_received','cancel_initial_task_as_superseded'],
    ['follow_up_should_complete','appraisal_follow_up','appraisal_received','complete_follow_up_from_authoritative_final_evidence']
  ]);
  assert.equal(candidates[0].orderedTimestamp,'unknown');
  assert.equal(candidates[0].finalMilestoneAt,'2026-09-15');
  assert.equal(JSON.stringify(candidates).includes('borrower'),false);
});

test('stale vendor audit does not infer evidence from stage, dates alone, terminal tasks, or payoff',()=>{
  assert.deepEqual(staleVendorTaskCandidates({milestoneDates:{},tasks:[{taskType:'order_title_escrow',state:'past_due'},{taskType:'order_payoff',state:'past_due'}]}),[]);
  assert.deepEqual(staleVendorTaskCandidates({trackerContext:{titleStatus:'ORDERED',titleTrackerDate:'2026-09-15'},tasks:[{taskType:'title_follow_up',state:'waiting'}]}),[]);
  assert.deepEqual(staleVendorTaskCandidates({milestoneDates:{hoiReceivedDate:'2026-09-15'},tasks:[{taskType:'request_insurance_eoi',state:'completed'}]}),[]);
});

class AuditPool {
  constructor(){this.calls=[];}
  async query(sql,args){this.calls.push({sql,args});if(sql.includes('from loans l where l.processing_eligible_at'))return {rowCount:2,rows:[
    {id:'title-loan',displayLoanId:'17593970',currentStage:'UNDERWRITING_SUBMITTED',milestoneDates:{titleReceivedDate:'2026-09-15'},trackerContext:{}},
    {id:'appraisal-loan',displayLoanId:'17512793',currentStage:'CLEAR_TO_CLOSE',milestoneDates:{appraisalReceivedDate:'2026-09-14'},trackerContext:{}}
  ]};return {rowCount:2,rows:[
    {loanId:'title-loan',taskType:'order_title_escrow',state:'past_due'},
    {loanId:'appraisal-loan',taskType:'appraisal_follow_up',state:'waiting'}
  ]};}
}

test('repository audit is read-only, active-stage scoped, aggregates safely, and separates initial from follow-up candidates',async()=>{
  const pool=new AuditPool(),result=await new PostgresAriveRepository(pool).auditStaleVendorTasks();
  assert.deepEqual(result.counts,{title:1,appraisal:1,hoi:0});
  assert.equal(result.activeLoansInspected,2);
  assert.equal(result.affectedLoans,2);
  assert.equal(result.initialTasksSupersededByFinalEvidence[0].displayLoanId,'17593970');
  assert.equal(result.followUpTasksShouldComplete[0].displayLoanId,'17512793');
  assert.equal(pool.calls.length,2);
  for(const {sql,args} of pool.calls){assert.match(sql,/processing_eligible_at is not null/);assert.ok(Array.isArray(args[0]));assert.doesNotMatch(sql,/insert|update|delete|borrower/i);}
  assert.doesNotMatch(JSON.stringify(result),/borrower|email|address/i);
});

test('operator audit command is read-only, uses the verified direct operator client, and emits no raw payload or borrower fields',async()=>{
  const script=await readFile(new URL('../scripts/workflow-audit-stale-vendor-tasks.mjs',import.meta.url),'utf8');
  assert.match(script,/createOperatorDatabaseClient/);
  assert.match(script,/await client\.connect\(\)/);
  assert.doesNotMatch(script,/new Pool/);
  assert.match(script,/auditStaleVendorTasks/);
  assert.doesNotMatch(script,/insert|update|delete|payload|borrower/i);
});
