import test from 'node:test';
import assert from 'node:assert/strict';
import { workPriorityKey } from '../public/work-priority.js';
import { stalledLoanSignals, workflowAgingForTask } from '../public/workflow-aging.js';

const now=new Date('2026-09-16T20:00:00.000Z');
const calendar={timeZone:'America/Los_Angeles',businessStart:{hour:8,minute:30},businessEnd:{hour:17,minute:0},workdays:[1,2,3,4,5],holidays:[]};
const task=(overrides={})=>({id:'task-1',displayLoanId:'17512793',title:'Safe operational action',state:'action_required',dueAt:'2026-09-15T20:00:00.000Z',...overrides});

test('a legitimate future external wait is not made overdue by an expired original action due date',()=>{
  const waiting=task({state:'waiting',waitingOn:'title_escrow',nextFollowUpAt:'2026-09-17T20:00:00.000Z',followUpCadenceBusinessDays:3});
  assert.equal(workPriorityKey(waiting,{now}),'waiting');
  assert.deepEqual(workflowAgingForTask(waiting,{now,calendar}),{kind:'waiting_external',priority:'waiting',waitingKind:'external',stalled:false});
});

test('an overdue internal required action stalls its loan, while an internal action not yet overdue does not',()=>{
  const overdue=task({id:'overdue',displayLoanId:'17512794'}),notOverdue=task({id:'current',displayLoanId:'17512795',dueAt:'2026-09-17T20:00:00.000Z'});
  assert.equal(workflowAgingForTask(overdue,{now,calendar}).stalled,true);
  assert.equal(workflowAgingForTask(notOverdue,{now,calendar}).stalled,false);
  assert.deepEqual(stalledLoanSignals([overdue,notOverdue],{now,calendar}).map(item=>item.displayLoanId),['17512794']);
});

test('an external follow-up due today remains Follow-Up Due and is not yet stalled',()=>{
  const followUp=task({id:'follow',state:'waiting',waitingOn:'underwriter',nextFollowUpAt:'2026-09-15T20:00:00.000Z',followUpCadenceBusinessDays:3});
  const aging=workflowAgingForTask(followUp,{now,calendar});
  assert.equal(aging.kind,'follow_up_due');
  assert.equal(aging.waitingKind,'external');
  assert.equal(aging.stalled,false);
  assert.deepEqual(stalledLoanSignals([followUp],{now,calendar}),[]);
});

test('an unresolved external follow-up stalls only after one additional configured business cadence',()=>{
  const followUp=task({id:'follow',state:'waiting',waitingOn:'title_escrow',nextFollowUpAt:'2026-09-11T23:00:00.000Z',followUpCadenceBusinessDays:1});
  assert.equal(workflowAgingForTask(followUp,{now:new Date('2026-09-14T23:00:00.000Z'),calendar}).stalled,false);
  assert.equal(workflowAgingForTask(followUp,{now:new Date('2026-09-15T23:00:01.000Z'),calendar}).stalled,true);
});

test('external stalled threshold uses the HFN Pacific calendar over weekends and configured holidays',()=>{
  const followUp=task({id:'follow',state:'waiting',waitingOn:'insurance_agent',nextFollowUpAt:'2026-09-11T23:00:00.000Z',followUpCadenceBusinessDays:1});
  assert.equal(workflowAgingForTask(followUp,{now:new Date('2026-09-14T23:00:01.000Z'),calendar}).stalled,true);
  const holidayCalendar={...calendar,holidays:['2026-09-14']};
  assert.equal(workflowAgingForTask(followUp,{now:new Date('2026-09-15T23:00:00.000Z'),calendar:holidayCalendar}).stalled,false);
  assert.equal(workflowAgingForTask(followUp,{now:new Date('2026-09-15T23:00:01.000Z'),calendar:holidayCalendar}).stalled,true);
});

test('future or unscheduled external waiting does not falsely stall a loan',()=>{
  const future=task({id:'future',state:'waiting',waitingOn:'borrower',nextFollowUpAt:'2026-09-18T20:00:00.000Z',followUpCadenceBusinessDays:2}),missingCadence=task({id:'missing',displayLoanId:'17512794',state:'waiting',waitingOn:'borrower',nextFollowUpAt:'2026-09-10T20:00:00.000Z'});
  assert.deepEqual(stalledLoanSignals([future,missingCadence],{now,calendar}),[]);
});

test('an explicitly escalated task stalls its loan and duplicate qualifying tasks count one loan',()=>{
  const escalated=task({id:'escalated',state:'escalated',dueAt:'2026-09-17T20:00:00.000Z'}),duplicate=task({id:'duplicate',state:'waiting',waitingOn:'appraiser',nextFollowUpAt:'2026-09-11T23:00:00.000Z',followUpCadenceBusinessDays:1});
  const stalled=stalledLoanSignals([escalated,duplicate],{now:new Date('2026-09-16T20:00:00.000Z'),calendar});
  assert.equal(stalled.length,1);
  assert.equal(stalled[0].displayLoanId,'17512793');
});

test('a task can be Past Due while its separate CTC clock remains On Track',()=>{
  const overdue=task({ctcClock:{status:'ON_TRACK',elapsedCalendarDays:8}});
  assert.equal(workPriorityKey(overdue,{now}),'past_due');
  assert.equal(overdue.ctcClock.status,'ON_TRACK');
  assert.equal(stalledLoanSignals([overdue],{now,calendar}).length,1);
});
