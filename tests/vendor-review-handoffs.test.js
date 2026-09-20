import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { businessDeadline } from '../src/domain/workflow-engine.js';
import { defaultCalendar } from '../src/domain/sla.js';
import { manualPayoffReviewEvidence, vendorReviewHandoffEvidence } from '../src/domain/vendor-review-handoffs.js';

class HandoffExecutor {
  constructor(){this.tasks=[];this.history=[];}
  async query(sql,args=[]){
    if(sql.startsWith('insert into workflow_tasks')){
      const [,loanId,taskType,title,origin,ownerEmail,ownerName,createdAt,dueAt]=args;
      if(this.tasks.some(task=>task.loanId===loanId&&task.taskType===taskType))return {rows:[],rowCount:0};
      const task={id:args[0],loanId,taskType,title,origin,ownerRole:'processor',ownerEmail,ownerName,createdAt,dueAt,kpiEligible:false,state:'action_required'};
      this.tasks.push(task);return {rows:[task],rowCount:1};
    }
    if(sql.startsWith('insert into workflow_task_history')){this.history.push({taskId:args[1],at:args[2],action:args[3],metadata:args[8]});return {rows:[],rowCount:1};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

const processor={name:'Processor',email:'processor@hfn.test'};
const receivedAt='2026-09-15T23:00:00.000Z';

test('authoritative vendor receipts create the correct Processor-owned review handoffs one business day later',async()=>{
  const repository=new PostgresAriveRepository({}),db=new HandoffExecutor();
  const evidence=vendorReviewHandoffEvidence({appraisalReceivedDate:receivedAt,titleReceivedDate:receivedAt,hoiReceivedDate:receivedAt});
  await repository.createVendorReceiptReviewHandoffs(db,{loanId:'loan-1',milestoneDates:{appraisalReceivedDate:receivedAt,titleReceivedDate:receivedAt,hoiReceivedDate:receivedAt},processor:processor.name,processorEmail:processor.email});
  assert.deepEqual(evidence.map(item=>item.taskType),['review_appraisal','review_title','review_insurance']);
  assert.deepEqual(db.tasks.map(task=>task.taskType),['review_appraisal','review_title','review_insurance']);
  assert.ok(db.tasks.every(task=>task.ownerRole==='processor'&&task.ownerEmail===processor.email&&task.kpiEligible===false));
  assert.ok(db.tasks.every(task=>task.dueAt===businessDeadline(receivedAt,1,defaultCalendar)));
  assert.ok(db.history.every(item=>item.action==='processor_review_handoff_created'));
});

test('Title RECEIVED tracker fallback creates the same title review without requiring an assistant task',async()=>{
  const repository=new PostgresAriveRepository({}),db=new HandoffExecutor();
  await repository.createVendorReceiptReviewHandoffs(db,{loanId:'loan-1',trackerContext:{titleStatus:' received ',titleTrackerDate:receivedAt},processor:processor.name,processorEmail:processor.email});
  assert.deepEqual(db.tasks.map(task=>task.taskType),['review_title']);
  assert.equal(db.tasks[0].createdAt,receivedAt);
});

test('repeated receipt delivery is idempotent and a manual payoff receipt produces a Processor review handoff',async()=>{
  const repository=new PostgresAriveRepository({}),db=new HandoffExecutor(),dates={titleReceivedDate:receivedAt};
  await repository.createVendorReceiptReviewHandoffs(db,{loanId:'loan-1',milestoneDates:dates,processor:processor.name,processorEmail:processor.email});
  await repository.createVendorReceiptReviewHandoffs(db,{loanId:'loan-1',milestoneDates:dates,processor:processor.name,processorEmail:processor.email});
  const payoff=manualPayoffReviewEvidence(receivedAt);
  await repository.createProcessorReviewHandoff(db,{loanId:'loan-2',handoff:payoff,processor:processor.name,processorEmail:processor.email,origin:'manual'});
  assert.equal(db.tasks.filter(task=>task.taskType==='review_title').length,1);
  assert.deepEqual(db.tasks.find(task=>task.taskType==='review_payoff'),{id:db.tasks.find(task=>task.taskType==='review_payoff').id,loanId:'loan-2',taskType:'review_payoff',title:'Review Payoff',origin:'manual',ownerRole:'processor',ownerEmail:processor.email,ownerName:processor.name,createdAt:receivedAt,dueAt:businessDeadline(receivedAt,1,defaultCalendar),kpiEligible:false,state:'action_required'});
});

test('no trusted final vendor receipt evidence produces no processor review work',()=>{
  assert.deepEqual(vendorReviewHandoffEvidence({titleOrderedDate:receivedAt}),[]);
  assert.equal(manualPayoffReviewEvidence(null),null);
});
