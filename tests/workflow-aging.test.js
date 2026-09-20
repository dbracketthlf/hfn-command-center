import test from 'node:test';
import assert from 'node:assert/strict';
import { workPriorityKey } from '../public/work-priority.js';
import { stalledLoanSignals, workflowAgingForTask } from '../public/workflow-aging.js';

const now=new Date('2026-09-16T20:00:00.000Z');
const task=(overrides={})=>({id:'task-1',displayLoanId:'17512793',title:'Safe operational action',state:'action_required',dueAt:'2026-09-15T20:00:00.000Z',...overrides});

test('a legitimate external wait is not made overdue by an expired original action due date',()=>{
  const waiting=task({state:'waiting',waitingOn:'title_escrow',nextFollowUpAt:'2026-09-17T20:00:00.000Z'});
  assert.equal(workPriorityKey(waiting,{now}),'waiting');
  assert.deepEqual(workflowAgingForTask(waiting,{now}),{kind:'waiting_external',priority:'waiting',waitingKind:'external',stalled:false});
});

test('established follow-up dates and actionable deadlines produce distinct stalled signals',()=>{
  const followUp=task({id:'follow',state:'waiting',waitingOn:'underwriter',nextFollowUpAt:'2026-09-15T20:00:00.000Z'}),overdue=task({id:'overdue',displayLoanId:'17512794'}),internal=task({id:'issue',displayLoanId:'17512795',waitingOn:'processor_review_issue'});
  assert.equal(workflowAgingForTask(followUp,{now}).kind,'follow_up_due');
  assert.equal(workflowAgingForTask(overdue,{now}).kind,'overdue');
  assert.equal(workflowAgingForTask(internal,{now}).kind,'overdue');
  const stalled=stalledLoanSignals([followUp,overdue,internal,task({id:'closed',displayLoanId:'17512796',state:'completed'})],{now});
  assert.deepEqual(stalled.map(item=>item.displayLoanId),['17512794','17512795','17512793']);
  assert.equal(stalled.find(item=>item.displayLoanId==='17512793').aging.waitingKind,'external');
});

test('a stalled loan is derived only from meaningful current task movement, never webhook age',()=>{
  assert.deepEqual(stalledLoanSignals([task({state:'waiting',waitingOn:'borrower',nextFollowUpAt:'2026-09-18T20:00:00.000Z'})],{now}),[]);
});
