import test from 'node:test';
import assert from 'node:assert/strict';
import { establishesProcessingEligibility, isProcessingEligible } from '../src/domain/processing-eligibility.js';
import { buildLiveDashboard } from '../src/domain/dashboard.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

test('APPLICATION_INTAKE, QUALIFICATION, and PREAPPROVED never establish processing eligibility',()=>{
  for(const status of ['APPLICATION_INTAKE','QUALIFICATION','PREAPPROVED']) assert.equal(establishesProcessingEligibility(status),false);
});
test('LOAN_SETUP establishes eligibility and it persists through downstream, adverse, and suspended statuses',()=>{
  assert.equal(establishesProcessingEligibility('LOAN_SETUP'),true);
  const loan={processingEligibleAt:'2026-09-10T17:00:00Z'};
  for(const status of ['UNDERWRITING_SUBMITTED','ADVERSE','SUSPENDED','LOAN_FUNDED']) assert.equal(isProcessingEligible({...loan,currentStage:status}),true);
});
test('pre-processing loans are absent from live KPI and File Detail inputs',()=>{
  const eligible=[{processingEligibleAt:'2026-09-10T17:00:00Z',displayLoanId:'ELIGIBLE'}];
  const inputs=[...eligible,{currentStage:'APPLICATION_INTAKE',displayLoanId:'17625730'}].filter(isProcessingEligible);
  const dashboard=buildLiveDashboard({counts:{activeLoans:inputs.length,newFiles:0,uwSubmitted:0,clearToClose:0,fundedMtd:0,pastSla:0},processorLoans:[],processorSlas:[],funded:[],assistantTasks:[],attention:[]});
  assert.equal(dashboard.kpis.activeLoans,1);
  assert.equal(inputs.some(loan=>loan.displayLoanId==='17625730'),false);
});
test('persisted File Detail and KPI queries require the processing eligibility marker',async()=>{
  const calls=[];
  const pool={query:async sql=>{calls.push(sql);return {rows:[{active_loans:0,new_files:0,uw_submitted:0,clear_to_close:0,funded_mtd:0,past_sla:0}]};}};
  const repository=new PostgresAriveRepository(pool);
  await repository.listLoans();
  await repository.dashboard();
  assert.match(calls[0],/processing_eligible_at is not null/);
  for(const sql of calls.slice(1)) if(/from loans|join loans/i.test(sql)) assert.match(sql,/processing_eligible_at is not null/);
});
