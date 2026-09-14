import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTodaysPriorities, priorityForTask } from '../public/my-work-priorities.js';

const now=new Date('2026-09-15T20:00:00.000Z');
const task=(id,displayLoanId,overrides={})=>({id,displayLoanId,borrowerName:'Private Borrower',currentStage:'UNDERWRITING_SUBMITTED',title:'Safe workflow task',state:'waiting',priority:'waiting',dueAt:'2026-09-18T20:00:00.000Z',...overrides});
const ids=items=>items.map(item=>item.displayLoanId);

test('Today’s Priorities produces one item per loan and ranks workflow urgency first',()=>{
  const priorities=buildTodaysPriorities([
    task('one-a','100',{state:'waiting',priority:'waiting'}),task('one-b','100',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'}),
    task('action','200',{state:'action_required',priority:'action_required',dueAt:'2026-09-15T22:00:00Z'}),task('follow','300',{state:'waiting',priority:'follow_up_due',nextFollowUpAt:'2026-09-15T19:00:00Z'}),task('waiting','400')
  ],{now});
  assert.deepEqual(ids(priorities.all),['100','200','300','400']);assert.equal(priorities.all[0].reason,'Past Due');assert.equal(priorities.all[1].reason,'Due Today');assert.equal(priorities.all[2].reason,'Follow-Up Due');
});

test('CTC Critical then At Risk break same-tier ties but never override workflow urgency',()=>{
  const priorities=buildTodaysPriorities([
    task('on-track','1',{state:'due_soon',priority:'due_soon',ctcClock:{status:'ON_TRACK'},dueAt:'2026-09-16T20:00:00Z'}),
    task('risk','2',{state:'due_soon',priority:'due_soon',ctcClock:{status:'AT_RISK'},dueAt:'2026-09-16T20:00:00Z'}),
    task('critical','3',{state:'due_soon',priority:'due_soon',ctcClock:{status:'CRITICAL'},dueAt:'2026-09-16T20:00:00Z'}),
    task('past','4',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'}),
    task('critical-wait','5',{ctcClock:{status:'CRITICAL'}})
  ],{now});
  assert.deepEqual(ids(priorities.all),['4','3','2','1','5']);assert.match(priorities.all[1].reason,/CTC Critical/);assert.match(priorities.all[2].reason,/CTC At Risk/);
});

test('earliest due time breaks equal urgency ties and future waiting work cannot dominate the top five',()=>{
  const tasks=[
    task('late-due','a',{state:'due_soon',priority:'due_soon',dueAt:'2026-09-16T22:00:00Z'}),task('early-due','b',{state:'due_soon',priority:'due_soon',dueAt:'2026-09-16T21:00:00Z'}),
    ...['c','d','e','f'].map(id=>task(id,id,{state:'action_required',priority:'action_required',dueAt:'2026-09-15T21:00:00Z'})),
    task('waiting','future-wait',{state:'waiting',priority:'waiting',nextFollowUpAt:'2026-09-18T20:00:00Z'})
  ];
  const priorities=buildTodaysPriorities(tasks,{now});assert.equal(priorities.all.findIndex(item=>item.displayLoanId==='b')<priorities.all.findIndex(item=>item.displayLoanId==='a'),true);assert.equal(ids(priorities.top).includes('future-wait'),false);assert.equal(priorities.top.length,5);
});

test('waiting follow-ups remain Follow-Up Due while overdue employee actions remain Past Due',()=>{
  const follow=task('follow','1',{dueAt:'2026-09-14T20:00:00Z',nextFollowUpAt:'2026-09-14T20:00:00Z'}),action=task('action','2',{state:'action_required',priority:'action_required',dueAt:'2026-09-14T20:00:00Z'}),blocked=task('blocked','3',{state:'blocked',priority:'blocked',dueAt:'2026-09-16T20:00:00Z'}),escalated=task('escalated','4',{state:'escalated',priority:'escalated',dueAt:'2026-09-16T20:00:00Z'});
  assert.equal(priorityForTask(follow,{now}).key,'follow_up_due');assert.equal(priorityForTask(action,{now}).key,'past_due');assert.equal(priorityForTask(blocked,{now}).key,'blocked');assert.equal(priorityForTask(escalated,{now}).key,'escalated');
  assert.deepEqual(ids(buildTodaysPriorities([follow,action],{now}).all),['2','1']);
});

test('a blocked task retains its due date and becomes Past Due when that due date elapses',()=>{const blocked=task('blocked-overdue','5',{state:'blocked',priority:'blocked',dueAt:'2026-09-14T20:00:00Z'});assert.equal(blocked.dueAt,'2026-09-14T20:00:00Z');assert.equal(priorityForTask(blocked,{now}).key,'past_due');});

test('priority section reuses the existing drawer target and private-only borrower rendering',async()=>{
  const script=await readFile(new URL('../public/my-work.js',import.meta.url),'utf8');assert.match(script,/TODAY'S PRIORITIES/);assert.match(script,/TODAY'S TEAM PRIORITIES/);assert.match(script,/data-loan-card/);assert.match(script,/View All Priorities/);assert.match(script,/ownerName/);
});
