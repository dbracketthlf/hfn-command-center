import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupDisclosureAnalytics } from '../src/domain/setup-disclosure-analytics.js';

const calendar={timeZone:'America/Los_Angeles',businessStart:{hour:8,minute:30},businessEnd:{hour:17,minute:0},workdays:[1,2,3,4,5],holidays:['2026-09-14']};
const rows=(id,currentStage,events)=>events.length?events.map(([eventType,occurredAt])=>({loanId:id,displayLoanId:id,currentStage,processor:'Processor',assistant:'Assistant',eventType,occurredAt})):[{loanId:id,displayLoanId:id,currentStage,processor:'Processor',assistant:'Assistant',eventType:null,occurredAt:null}];
const analyze=(input,now='2026-09-15T23:30:00.000Z')=>buildSetupDisclosureAnalytics(input.flat(),{now,calendar});

test('setup to disclosure uses only canonical events and the existing one-business-day Pacific target',()=>{
  const result=analyze([rows('on-time','DISCLOSED',[['LOAN_SETUP','2026-09-11T23:00:00Z'],['DISCLOSED','2026-09-15T22:00:00Z']]),rows('late','DISCLOSURE_SENT',[['LOAN_SETUP','2026-09-11T23:00:00Z'],['DISCLOSURE_SENT','2026-09-15T23:15:00Z']]),rows('missing','UNDERWRITING_SUBMITTED',[['UNDERWRITING_SUBMITTED','2026-09-15T23:00:00Z']])]);
  assert.equal(result.historical.eligibleObservations,2);assert.equal(result.historical.exceedingOneBusinessDay,1);assert.equal(result.historical.averageCalendarDays,4);assert.equal(result.historical.medianCalendarDays,4);
});

test('current undisclosed setup loans remain operationally visible with normal aging stalled and unavailable states',()=>{
  const result=analyze([rows('normal','LOAN_SETUP',[['LOAN_SETUP','2026-09-15T22:30:00Z']]),rows('aging','LOAN_SETUP',[['LOAN_SETUP','2026-09-11T23:00:00Z']]),rows('stalled','LOAN_SETUP',[['LOAN_SETUP','2026-09-10T23:00:00Z']]),rows('unknown','LOAN_SETUP',[])]),current=result.current;
  assert.equal(current.waitingForDisclosures,4);assert.equal(current.normal,1);assert.equal(current.aging,1);assert.equal(current.stalled,1);assert.equal(current.timingUnavailable,1);assert.equal(current.longestAgingLoans.some(loan=>loan.displayLoanId==='unknown'),false);
});

test('setup disclosure analytics have no KPI output or mutation semantics',()=>{
  const result=analyze([rows('loan','LOAN_SETUP',[['LOAN_SETUP','2026-09-15T22:30:00Z']])]);
  assert.equal('kpiEligible' in result,false);assert.equal(JSON.stringify(result).includes('borrower'),false);
});
