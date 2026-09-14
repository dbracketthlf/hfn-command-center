import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLenderPerformanceAnalytics, lenderSampleLabel } from '../src/domain/lender-performance.js';

const now='2026-09-30T20:00:00.000Z';
const row=(loanId,lenderInvestorName,currentStage,events)=>events.map(([eventType,occurredAt])=>({loanId,displayLoanId:loanId,lenderInvestorName,currentStage,processor:'Processor',assistant:'Assistant',eventType,occurredAt}));
const run=(rows,tasks=[])=>buildLenderPerformanceAnalytics(rows.flat(),tasks,{now});
const lender=(data,name='Lender One')=>data.lenders.find(item=>item.displayName===name);

test('lender turns use canonical first approval, final resubmission before CTC, and one comparable observation per loan',()=>{
  const data=run([row('1',' Lender One ','LOAN_FUNDED',[['UNDERWRITING_SUBMITTED','2026-09-01T20:00:00Z'],['APPROVED_WITH_CONDITION','2026-09-04T20:00:00Z'],['APPROVED_WITH_CONDITION','2026-09-08T20:00:00Z'],['RE_SUBMITTAL','2026-09-07T20:00:00Z'],['RE_SUBMITTAL','2026-09-09T20:00:00Z'],['CLEAR_TO_CLOSE','2026-09-14T20:00:00Z']])]),item=lender(data);
  assert.equal(item.initialApproval.averageCalendarDays,3);assert.equal(item.initialApproval.eligibleObservations,1);assert.equal(item.resubmissionToCtc.averageCalendarDays,5);assert.equal(item.uwToCtc.averageCalendarDays,13);assert.equal(item.uwToCtc.goalHits,1);assert.equal(item.uwToCtc.hitRate,100);
});

test('missing or invalid canonical observations are excluded instead of converted to zero',()=>{
  const data=run([row('missing-approval','Lender One','LOAN_FUNDED',[['UNDERWRITING_SUBMITTED','2026-09-01T20:00:00Z'],['CLEAR_TO_CLOSE','2026-09-25T20:00:00Z']]),row('no-uw','Lender One','LOAN_FUNDED',[['APPROVED_WITH_CONDITION','2026-09-05T20:00:00Z'],['CLEAR_TO_CLOSE','2026-09-10T20:00:00Z']])]),item=lender(data);
  assert.equal(item.initialApproval.eligibleObservations,0);assert.equal(item.initialApproval.averageCalendarDays,null);assert.equal(item.resubmissionToCtc.eligibleObservations,0);assert.equal(item.uwToCtc.eligibleObservations,1);assert.equal(item.uwToCtc.goalMisses,1);assert.equal(item.uwToCtc.hitRate,0);
});

test('active pipeline uses existing CTC clock and named lender grouping without inventing an Unknown lender',()=>{
  const data=run([row('on-track','LENDER ONE','UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-20T20:00:00Z']]),row('risk','Lender One','UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-14T20:00:00Z']]),row('critical','Lender One','UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-09T20:00:00Z']]),row('unknown',null,'UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-10T20:00:00Z']])],[{displayLoanId:'risk',taskType:'ctc_follow_up',state:'waiting'}]),item=lender(data,'LENDER ONE');
  assert.equal(data.lenders.length,1);assert.equal(item.activeLoans,3);assert.equal(item.onTrack,1);assert.equal(item.ctcAtRisk,1);assert.equal(item.ctcCritical,1);assert.equal(item.currentlyWaitingOnLenderUw,1);assert.equal(data.summary.loansMissingLenderInvestor,1);
});

test('completed observations use the last 90 days while active counts remain current and sample labels are deterministic',()=>{
  const old='2026-05-01T20:00:00Z',data=run([row('old','Lender One','LOAN_FUNDED',[['UNDERWRITING_SUBMITTED',old],['CLEAR_TO_CLOSE','2026-05-15T20:00:00Z']]),row('active','Lender One','UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-25T20:00:00Z']])]),item=lender(data);
  assert.equal(item.uwToCtc.eligibleObservations,0);assert.equal(item.activeLoans,1);assert.equal(item.uwToCtc.averageCalendarDays,null);assert.equal(lenderSampleLabel(1),'LIMITED DATA');assert.equal(lenderSampleLabel(3),'SMALL SAMPLE');assert.equal(lenderSampleLabel(5),'ESTABLISHED SAMPLE');
});
