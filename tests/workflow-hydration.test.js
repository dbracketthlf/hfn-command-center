import test from 'node:test';
import assert from 'node:assert/strict';
import { planHydratedWorkflow } from '../src/domain/workflow-hydration.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
const owners={processor:{email:'processor@hfn.test',name:'Processor'},assistant:{email:'assistant@hfn.test',name:'Assistant'},now:'2026-09-15T18:00:00.000Z'};
test('hydration creates current UW work only, all KPI-ineligible',()=>{const plan=planHydratedWorkflow({stage:'UNDERWRITING_SUBMITTED',purpose:'Rate/Term Refinance',milestoneDates:{},...owners});assert.deepEqual(plan.tasks.map(task=>task.type),['order_appraisal','order_title_escrow','request_insurance_eoi','order_payoff']);assert.ok(plan.tasks.every(task=>task.kpiEligible===false));assert.ok(plan.tasks.every(task=>!task.completedAt&&!task.lastFollowUpAt));});
test('hydrated Payoff is limited to explicit refinance purposes',()=>{for(const purpose of ['refinance','Cash-Out Refinance','rate/term refinance'])assert.ok(planHydratedWorkflow({stage:'UNDERWRITING_SUBMITTED',purpose,...owners}).tasks.some(task=>task.type==='order_payoff'));for(const purpose of ['purchase','HELOC','second mortgage','commercial',null])assert.ok(!planHydratedWorkflow({stage:'UNDERWRITING_SUBMITTED',purpose,...owners}).tasks.some(task=>task.type==='order_payoff'));});
test('hydration uses proven dates to skip historical ordering and create only current CD work',()=>{const plan=planHydratedWorkflow({stage:'UNDERWRITING_SUBMITTED',purpose:'purchase',milestoneDates:{appraisalReceivedDate:'2026-09-10T18:00:00Z',titleReceivedDate:'2026-09-10T18:00:00Z',hoiReceivedDate:'2026-09-10T18:00:00Z'},...owners});assert.deepEqual(plan.tasks.map(task=>task.type),['closing_disclosure_sent']);});
test('terminal and pre-processing loans receive no hydrated work',()=>{for(const stage of ['LOAN_FUNDED','APPLICATION_INTAKE','ADVERSE','SUSPENDED'])assert.equal(planHydratedWorkflow({stage,...owners}).tasks.length,0);});
test('downstream stages infer only current operational work',()=>{assert.deepEqual(planHydratedWorkflow({stage:'CLEAR_TO_CLOSE',...owners}).tasks.map(task=>task.type),['request_loan_documents','ctc_closing_readiness']);assert.deepEqual(planHydratedWorkflow({stage:'DOCS_SIGNED',...owners}).tasks.map(task=>task.type),['clear_funding_requirements']);});
test('hydration dry run returns plain-object grouping summaries and rolls back without writes',async()=>{
  const client={rolledBack:false,writes:0,released:false,async query(sql){
    if(sql==='begin')return {rows:[],rowCount:0};
    if(sql==='rollback'){this.rolledBack=true;return {rows:[],rowCount:0};}
    if(sql.startsWith('select l.id,l.arive_display_loan_id'))return {rowCount:1,rows:[{id:'loan-1',displayLoanId:'17567005',stage:'UNDERWRITING_SUBMITTED',purpose:'Refinance',processor_email:'processor@hfn.test',processor_name:'Processor',assistant_email:'assistant@hfn.test',assistant_name:'Assistant',milestoneDates:{}}]};
    if(sql==='select loan_id,task_type from workflow_tasks')return {rowCount:0,rows:[]};
    if(/^\s*(insert|update|delete)\b/i.test(sql))this.writes+=1;
    return {rows:[],rowCount:0};
  },release(){this.released=true;}};
  const repository=new PostgresAriveRepository({connect:async()=>client});
  const result=await repository.hydrateWorkflowTasks({dryRun:true,now:'2026-09-15T18:00:00.000Z'});
  for(const summary of [result.byTaskType,result.byOwnerRole,result.byOwnerEmail]){
    assert.equal(typeof summary,'object');
    assert.equal(Array.isArray(summary),false);
    assert.equal(Object.getPrototypeOf(summary),Object.prototype);
  }
  assert.deepEqual(result.byTaskType,{order_appraisal:1,order_title_escrow:1,request_insurance_eoi:1,order_payoff:1});
  assert.deepEqual(result.byOwnerRole,{processor_assistant:4});
  assert.deepEqual(result.byOwnerEmail,{'assistant@hfn.test':4});
  assert.equal(client.rolledBack,true);
  assert.equal(client.writes,0);
  assert.equal(client.released,true);
});
