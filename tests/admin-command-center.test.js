import test from 'node:test';
import assert from 'node:assert/strict';
import { createHfnServer } from '../server.mjs';
import { buildAdminCommandCenter, capacityForEmployee, capacityThresholds } from '../src/domain/admin-command-center.js';

const now=new Date('2026-09-15T20:00:00.000Z');
const task=(id,loan,overrides={})=>({id,displayLoanId:loan,ownerRole:'processor',ownerEmail:'processor@hfn.test',ownerName:'Processor',processor:'Processor',assistant:'Assistant',currentStage:'UNDERWRITING_SUBMITTED',title:'Operational task',state:'action_required',priority:'action_required',dueAt:'2026-09-15T21:00:00Z',...overrides});

test('capacity is centralized, role-specific, and reflects risk beyond active-loan volume',()=>{
  const base=capacityForEmployee([task('base','1')],{now}),past=capacityForEmployee([task('past','1',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'})],{now}),critical=capacityForEmployee([task('critical','1',{ctcClock:{status:'CRITICAL'}})],{now}),waiting=capacityForEmployee([task('waiting','1',{state:'waiting',priority:'waiting',nextFollowUpAt:'2026-09-20T20:00:00Z'})],{now});
  assert.ok(past.score>base.score);assert.ok(critical.score>base.score);assert.equal(waiting.score,1);assert.equal(capacityForEmployee([],{}).status,'NORMAL');assert.ok(capacityThresholds.elevatedMax>capacityThresholds.normalMax);
  const center=buildAdminCommandCenter([task('processor','1'),task('assistant','2',{ownerRole:'processor_assistant',ownerEmail:'assistant@hfn.test',ownerName:'Assistant'})],{now});assert.equal(center.processors.length,1);assert.equal(center.assistants.length,1);assert.equal('rank' in center.processors[0],false);
});

test('management escalation rules are explainable, one-per-loan, and ignore future waiting work',()=>{
  const center=buildAdminCommandCenter([
    task('critical-action','100',{ctcClock:{status:'CRITICAL'}}),
    task('risk-past','200',{ctcClock:{status:'AT_RISK'},state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'}),
    task('multi-one','300',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'}),task('multi-two','300',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T21:00:00Z'}),
    task('blocked','400',{state:'blocked',priority:'blocked',blockedAt:'2026-09-14T12:00:00Z'}),task('wait','500',{state:'waiting',priority:'waiting',nextFollowUpAt:'2026-09-20T20:00:00Z'})
  ],{now});
  assert.equal(center.escalations.length,4);assert.equal(center.escalations[0].severity,'CRITICAL');assert.ok(center.escalations.some(item=>item.displayLoanId==='200'&&item.severity==='HIGH'));assert.ok(center.escalations.some(item=>item.displayLoanId==='300'&&/Multiple past-due/.test(item.reasons.join(' '))));assert.ok(center.escalations.some(item=>item.displayLoanId==='400'&&/Blocked more than 24 hours/.test(item.reasons.join(' '))));assert.equal(center.escalations.some(item=>item.displayLoanId==='500'),false);
});

test('capacity and escalations keep a due waiting follow-up operational without treating it as a past-due employee action',()=>{
  const follow=task('follow','600',{state:'waiting',priority:'waiting',dueAt:'2026-09-14T20:00:00Z',nextFollowUpAt:'2026-09-14T20:00:00Z'}),action=task('action','601',{state:'action_required',priority:'action_required',dueAt:'2026-09-14T20:00:00Z'});
  const followCapacity=capacityForEmployee([follow],{now}),actionCapacity=capacityForEmployee([action],{now}),center=buildAdminCommandCenter([follow,action],{now});
  assert.equal(followCapacity.taskCounts.pastDue,0);assert.equal(followCapacity.taskCounts.followUpDue,1);assert.equal(actionCapacity.taskCounts.pastDue,1);assert.equal(center.escalations.some(item=>item.displayLoanId==='600'),false);assert.ok(center.escalations.some(item=>item.displayLoanId==='601'));
});

async function withServer(employee,run){const store={adminCommandCenter:async()=>({summary:{activeLoans:1,pastDueLoans:0,ctcAtRisk:0,ctcCritical:0,managementEscalations:0},processors:[],assistants:[],escalations:[]})},auth={session:async()=>employee},server=createHfnServer({store,auth,environment:'production'});await new Promise(resolve=>server.listen(0,resolve));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
test('Admin Command Center API and page remain authenticated Admin-only',async()=>{await withServer({email:'admin@hfn.test',role:'admin'},async base=>{assert.equal((await fetch(`${base}/api/admin/command-center`)).status,200);assert.equal((await fetch(`${base}/admin`)).status,200);});await withServer({email:'processor@hfn.test',role:'processor'},async base=>{assert.equal((await fetch(`${base}/api/admin/command-center`)).status,403);assert.equal((await fetch(`${base}/admin`)).status,403);});});
