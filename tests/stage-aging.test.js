import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStageAgingAnalytics } from '../src/domain/stage-aging.js';

const now='2026-09-15T20:00:00.000Z';
const row=(displayLoanId,currentStage,stageEnteredAt,extra={})=>({displayLoanId,currentStage,stageEnteredAt,processor:'Processor',assistant:'Assistant',lenderInvestorName:'Safe Lender',...extra});
const task=(displayLoanId,taskType,extra={})=>({id:`${displayLoanId}-${taskType}`,displayLoanId,taskType,title:taskType.replaceAll('_',' '),state:'waiting',priority:'waiting',...extra});
const analyze=(rows,tasks=[])=>buildStageAgingAnalytics(rows,tasks,{now,calendar:{workdays:[1,2,3,4,5],holidays:['2026-09-14']}});

test('stage aging uses only canonical matching current-stage history and keeps unavailable timing unavailable',()=>{
  const result=analyze([row('100','LOAN_SETUP','2026-09-11T20:00:00.000Z'),row('200','UNDERWRITING_SUBMITTED',null)]),setup=result.longestAgingLoans.find(item=>item.displayLoanId==='100'),summary=result.pipelineBottlenecks.find(item=>item.stage==='UNDERWRITING_SUBMITTED');
  assert.equal(setup.elapsedCalendarDays,4);assert.equal(setup.elapsedBusinessDays,1);assert.equal(setup.agingStatus,'NORMAL');assert.equal(result.timingUnavailableLoans,1);assert.equal(summary.averageCalendarDays,null);assert.equal(summary.medianCalendarDays,null);
});

test('benchmarks create deterministic normal, aging, and stalled operational states without an employee SLA result',()=>{
  const result=analyze([row('normal','LOAN_SETUP','2026-09-14T20:00:00.000Z'),row('aging','LOAN_SETUP','2026-09-10T20:00:00.000Z'),row('stalled','LOAN_SETUP','2026-09-09T20:00:00.000Z'),row('conditions','APPROVED_WITH_CONDITION','2026-08-30T20:00:00.000Z')]),stage=result.pipelineBottlenecks.find(item=>item.stage==='LOAN_SETUP'),conditions=result.longestAgingLoans.find(item=>item.displayLoanId==='conditions');
  assert.equal(result.longestAgingLoans.find(item=>item.displayLoanId==='normal').agingStatus,'NORMAL');assert.equal(result.longestAgingLoans.find(item=>item.displayLoanId==='aging').agingStatus,'AGING');assert.equal(result.longestAgingLoans.find(item=>item.displayLoanId==='stalled').agingStatus,'STALLED');assert.equal(stage.activeLoans,3);assert.equal(conditions.agingStatus,'STALLED');assert.equal('kpiEligible' in conditions,false);
});

test('stage bottlenecks count loans once rather than their tasks and retain safe lender metadata',()=>{
  const result=analyze([row('100','UNDERWRITING_SUBMITTED','2026-09-10T20:00:00.000Z'),row('200','UNDERWRITING_SUBMITTED','2026-09-11T20:00:00.000Z')],[task('100','order_title_escrow'),task('100','title_follow_up'),task('200','order_appraisal')]),stage=result.pipelineBottlenecks[0],loan=result.longestAgingLoans.find(item=>item.displayLoanId==='100');
  assert.equal(stage.activeLoans,2);assert.equal(result.longestAgingLoans.filter(item=>item.displayLoanId==='100').length,1);assert.equal(loan.lenderInvestorName,'Safe Lender');
});

test('current bottleneck category has deterministic operational precedence and supported workflow mappings',()=>{
  const rows=['internal','borrower','lender','appraisal','title','insurance','payoff','settlement','unknown'].map(id=>row(id,'UNDERWRITING_SUBMITTED','2026-09-10T20:00:00.000Z'));
  const result=analyze(rows,[task('internal','order_title_escrow',{state:'action_required',dueAt:'2026-09-14T20:00:00.000Z'}),task('borrower','borrower_conditions_follow_up'),task('lender','ctc_follow_up'),task('appraisal','appraisal_follow_up'),task('title','title_follow_up'),task('insurance','insurance_follow_up'),task('payoff','payoff_follow_up'),task('settlement','settlement_statement_follow_up'),task('unknown','manual_operational_task')]);
  const category=id=>result.longestAgingLoans.find(item=>item.displayLoanId===id).currentBottleneckCategory;
  assert.equal(category('internal'),'INTERNAL ACTION');assert.equal(category('borrower'),'BORROWER / CONDITIONS');assert.equal(category('lender'),'LENDER / UNDERWRITING');assert.equal(category('appraisal'),'APPRAISAL');assert.equal(category('title'),'TITLE');assert.equal(category('insurance'),'INSURANCE');assert.equal(category('payoff'),'PAYOFF');assert.equal(category('settlement'),'ESCROW / SETTLEMENT');assert.equal(category('unknown'),'OTHER / UNKNOWN');
});
