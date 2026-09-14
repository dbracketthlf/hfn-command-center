import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHfnServer } from '../server.mjs';
import { buildAdminCommandCenter, buildClosingOutlook, buildManagementEscalations, buildMorningCommandBrief, buildPipelineWaitingSummary, capacityForEmployee, capacityThresholds } from '../src/domain/admin-command-center.js';
import { buildStageAgingAnalytics } from '../src/domain/stage-aging.js';

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

test('Loans Most at Risk reuses escalation order, CTC output, reasons, and deterministic employee-owned next actions',()=>{
  const escalations=buildManagementEscalations([
    task('critical','100',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z',ctcClock:{status:'CRITICAL',elapsedCalendarDays:22}}),
    task('high','200',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'}),task('high-two','200',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T21:00:00Z'}),
    task('not-owned','300',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z',ownerRole:'other'})
  ],{now});
  assert.deepEqual(escalations.map(item=>item.displayLoanId),['100','200','300']);
  assert.equal(escalations[0].ctcStatus,'CRITICAL');assert.equal(escalations[0].ctcDay,22);assert.equal(escalations[0].nextAction.title,'Operational task');assert.equal(escalations[0].nextAction.ownerRole,'processor');
  assert.equal(escalations[2].nextAction,null);assert.ok(escalations[1].reasons.includes('Multiple past-due tasks'));
});

test('Morning Command Brief is aggregate-only, omits zero-count warnings, and keeps unavailable metrics explicit',()=>{
  const center=buildAdminCommandCenter([task('past','100',{state:'past_due',priority:'past_due',dueAt:'2026-09-14T20:00:00Z'})],{now,activeLoanIds:['100','101']});
  center.ctcPerformance={onTrack:2,atRisk:1,critical:0};center.setupDisclosure={current:{stalled:0}};center.stageAging={currentBottlenecks:[]};center.lenderPerformance={lenders:[{currentlyWaitingOnLenderUw:1}]};
  const brief=buildMorningCommandBrief(center,{fundingGoal:{fundedCount:{actual:3,percent:30},fundedVolume:{actual:1500000,percent:10}},executiveProgress:{currentMonth:{uwToCtc:{averageCalendarDays:null,hitRate:null}}}},{connectionStatus:'arive-connected',lastEventReceived:'2026-09-15T20:00:00Z'});
  assert.equal(brief.headline.activeLoans,2);assert.deepEqual(brief.focus.map(item=>item.key),['past_due_actions','management_escalations']);assert.equal(brief.monthProgress.averageUwToCtcDays,null);assert.equal(brief.monthProgress.twentyDayHitRate,null);assert.equal(brief.processingPulse.waitingOnLenderUw,1);assert.equal(JSON.stringify(brief).includes('Borrower'),false);assert.equal(brief.systemStatus.connectionStatus,'arive-connected');
});

test('Month-End Closing Outlook assigns each eligible active loan to one stage bucket and preserves funding-goal semantics',()=>{
  const outlook=buildClosingOutlook({fundingGoal:{fundedCount:{actual:2,goal:5},fundedVolume:{actual:400000,goal:1000000,missingAmountCount:0}},pipelineLoans:[
    {currentStage:'CLEAR_TO_CLOSE',loanAmount:300000},{currentStage:'DOCS_OUT',loanAmount:200000},{currentStage:'DOCS_SIGNED',loanAmount:null},
    {currentStage:'APPROVED_WITH_CONDITION',loanAmount:250000},{currentStage:'RE_SUBMITTAL',loanAmount:175000},{currentStage:'UNDERWRITING_SUBMITTED',loanAmount:150000},
    {currentStage:'LOAN_SETUP',loanAmount:999999},{currentStage:'LOAN_FUNDED',loanAmount:999999}
  ]});
  assert.deepEqual(outlook.highConfidence,{loanCount:3,volume:500000,missingAmountCount:1});assert.deepEqual(outlook.likely,{loanCount:2,volume:425000,missingAmountCount:0});assert.deepEqual(outlook.pipelineOpportunity,{loanCount:1,volume:150000,missingAmountCount:0});assert.equal(outlook.committedOutlook.loanCount,5);assert.equal(outlook.committedOutlook.volume,900000);assert.equal(outlook.goalComparison.committedLoanGoalPercent,100);assert.equal(outlook.goalComparison.committedVolumeGoalPercent,90);assert.equal(outlook.goalComparison.remainingLoans,0);assert.equal(outlook.goalComparison.remainingVolume,100000);assert.equal(JSON.stringify(outlook).includes('999999'),false);assert.equal(JSON.stringify(outlook).includes('borrower'),false);
});

test('Pipeline Waiting rolls up the existing one-category bottleneck output without creating new attribution',()=>{
  const summary=buildPipelineWaitingSummary({currentBottlenecks:[
    {category:'INTERNAL ACTION',activeLoans:2},{category:'BORROWER / CONDITIONS',activeLoans:1},{category:'LENDER / UNDERWRITING',activeLoans:1},
    {category:'APPRAISAL',activeLoans:1},{category:'TITLE',activeLoans:1},{category:'INSURANCE',activeLoans:1},{category:'PAYOFF',activeLoans:1},{category:'ESCROW / SETTLEMENT',activeLoans:1},
    {category:'OTHER / UNKNOWN',activeLoans:1},{category:'TITLE',activeLoans:0},{category:'UNMAPPED SAFE CATEGORY',activeLoans:1}
  ]});
  assert.equal(summary.totalAttributableLoans,11);
  assert.deepEqual(summary.groups.map(group=>[group.label,group.activeLoans,group.percentage]),[['HFN INTERNAL',2,18],['BORROWER',1,9],['LENDER / UW',1,9],['THIRD PARTY',5,45],['UNKNOWN / OTHER',2,18]]);
  assert.deepEqual(summary.categories.map(item=>item.category),['INTERNAL ACTION','BORROWER / CONDITIONS','LENDER / UNDERWRITING','APPRAISAL','TITLE','INSURANCE','PAYOFF','ESCROW / SETTLEMENT','OTHER / UNKNOWN','UNMAPPED SAFE CATEGORY']);
  assert.equal(JSON.stringify(summary).includes('borrowerName'),false);
});

test('Pipeline Waiting preserves stage-aging precedence and only consumes the active rows supplied by the repository',()=>{
  const analytics=buildStageAgingAnalytics([{displayLoanId:'active-loan',currentStage:'UNDERWRITING_SUBMITTED',stageEnteredAt:'2026-09-10T20:00:00Z'}],[
    task('past-due','active-loan',{taskType:'order_title_escrow',state:'action_required',dueAt:'2026-09-14T20:00:00Z'}),
    task('waiting-title','active-loan',{taskType:'title_follow_up',state:'waiting',priority:'waiting'})
  ],{now,calendar:{workdays:[1,2,3,4,5]}});
  const summary=buildPipelineWaitingSummary(analytics);
  assert.deepEqual(analytics.currentBottlenecks,[{category:'INTERNAL ACTION',activeLoans:1}]);
  assert.equal(summary.totalAttributableLoans,1);assert.equal(summary.groups.find(group=>group.key==='hfnInternal').activeLoans,1);assert.equal(summary.groups.find(group=>group.key==='thirdParty').activeLoans,0);
});

test('closing outlook reuses the shared funding summary and eligible persisted loan stages',async()=>{
  const source=await readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8');
  assert.match(source,/async closingOutlook\(\).*this\.fundingSummary\(year,month\)/);assert.match(source,/processing_eligible_at is not null/);assert.doesNotMatch(source,/closingOutlook\(\)[\s\S]{0,700}loan_stage_events/);
});

async function withServer(employee,run){const escalation={displayLoanId:'1001',borrowerName:'Private Admin Borrower',currentStage:'UNDERWRITING_SUBMITTED',processor:'Processor',assistant:'Assistant',severity:'HIGH',reasons:['Multiple past-due tasks'],nextAction:{title:'Review conditions',ownerRole:'processor'},ctcStatus:'AT_RISK',ctcDay:18};const store={adminCommandCenter:async()=>({summary:{activeLoans:1,pastDueLoans:0,ctcAtRisk:0,ctcCritical:0,managementEscalations:1},processors:[],assistants:[],escalations:[escalation],stageAging:{currentBottlenecks:[{category:'TITLE',activeLoans:1}]}}),closingOutlook:async()=>({fundedMtd:{loanCount:0,volume:0,missingAmountCount:0},highConfidence:{loanCount:0,volume:0,missingAmountCount:0},likely:{loanCount:0,volume:0,missingAmountCount:0},pipelineOpportunity:{loanCount:0,volume:0,missingAmountCount:0},committedOutlook:{loanCount:0,volume:0,missingAmountCount:0},goalComparison:{loanGoal:null,volumeGoal:null,committedLoanGoalPercent:null,committedVolumeGoalPercent:null,remainingLoans:null,remainingVolume:null}}),dashboard:async()=>({fundingGoal:{fundedCount:{actual:0,percent:null},fundedVolume:{actual:0,percent:null}},executiveProgress:{currentMonth:{uwToCtc:{averageCalendarDays:null,hitRate:null}}}}),ctcPerformanceSummary:async()=>({onTrack:0,atRisk:0,critical:0}),health:async()=>({connectionStatus:'arive-connected',lastEventReceived:'2026-09-15T20:00:00Z',eventsReceivedToday:2,eventsProcessed:2,failedEvents:0,duplicateEventsIgnored:0,loansSynced:1,recent:[{receivedAt:'2026-09-15T20:00:00Z',sourceEventId:'evt-safe',ariveDisplayLoanId:'1001',eventType:'LOAN_SETUP',status:'processed',auditNote:'Processed'}]})},auth={session:async()=>employee},server=createHfnServer({store,auth,environment:'production'});await new Promise(resolve=>server.listen(0,resolve));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
test('Admin Command Center API and page remain authenticated Admin-only',async()=>{await withServer({email:'admin@hfn.test',role:'admin'},async base=>{const response=await fetch(`${base}/api/admin/command-center`),body=await response.json();assert.equal(response.status,200);assert.equal(body.integrationHealth.connectionStatus,'arive-connected');assert.equal(body.morningBrief.monthProgress.loanGoalPercent,null);assert.equal(body.morningBrief.closingOutlook.committedOutlook.loanCount,0);assert.equal(body.morningBrief.pipelineWaiting.totalAttributableLoans,1);assert.equal(body.morningBrief.pipelineWaiting.groups.find(group=>group.key==='thirdParty').activeLoans,1);assert.equal(body.escalations[0].borrowerName,'Private Admin Borrower');assert.equal(/borrower(Name|Email|Phone|Address)/i.test(JSON.stringify(body.morningBrief)),false);assert.equal((await fetch(`${base}/admin`)).status,200);});await withServer({email:'processor@hfn.test',role:'processor'},async base=>{assert.equal((await fetch(`${base}/api/admin/command-center`)).status,403);assert.equal((await fetch(`${base}/admin`)).status,403);});});
