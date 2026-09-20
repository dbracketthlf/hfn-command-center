import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

const processor={email:'processor@hfn.test',role:'processor',displayName:'Processor'};

class ReviewExecutor {
  constructor({withResubmit=true}={}){this.task={id:'review-1',loan_id:'loan-1',task_type:'review_title',owner_role:'processor',owner_email:processor.email,state:'action_required',metadata:{}};this.resubmit=withResubmit?{id:'resubmit-1',workflow_cycle:2,state:'action_required'}:null;this.history=[];}
  async connect(){return this;} release(){}
  async query(sql,args=[]){const q=sql.toLowerCase();
    if(['begin','commit','rollback'].includes(q))return {rows:[],rowCount:0};
    if(q.startsWith('select * from workflow_tasks where id='))return {rows:args[0]===this.task.id?[this.task]:[],rowCount:args[0]===this.task.id?1:0};
    if(q.startsWith("update workflow_tasks set state='completed'")){if(['completed','cancelled','not_applicable'].includes(this.task.state))return {rows:[],rowCount:0};this.task.state='completed';this.task.completed_at=args[1];return {rows:[{id:this.task.id}],rowCount:1};}
    if(q.startsWith("update workflow_tasks set state='action_required',waiting_on='processor_review_issue'")){if(['completed','cancelled','not_applicable'].includes(this.task.state))return {rows:[],rowCount:0};this.task.state='action_required';this.task.waiting_on='processor_review_issue';this.task.metadata={...this.task.metadata,reviewOutcome:'issue_follow_up_required'};return {rows:[{id:this.task.id}],rowCount:1};}
    if(q.startsWith("select id,workflow_cycle from workflow_tasks where loan_id="))return {rows:this.resubmit?[this.resubmit]:[],rowCount:this.resubmit?1:0};
    if(q.startsWith('insert into workflow_task_history')){this.history.push({taskId:args[1],action:args[3],fromState:args[4],toState:args[5],actorEmail:args[6],note:args[7],metadata:args[8]});return {rows:[],rowCount:1};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

test('each Processor vendor review can be closed as reviewed with no action and cannot create duplicate work',async()=>{
  for(const type of ['review_appraisal','review_title','review_insurance','review_payoff']){
    const db=new ReviewExecutor();db.task.task_type=type;const repository=new PostgresAriveRepository(db);
    await repository.mutateProcessorReview({employee:processor,taskId:db.task.id,action:'review_no_action',at:'2026-09-15T23:00:00.000Z'});
    assert.equal(db.task.state,'completed');assert.equal(db.task.completed_at,'2026-09-15T23:00:00.000Z');assert.equal(db.history.filter(item=>item.action==='reviewed_no_action_needed').length,1);
    await repository.mutateProcessorReview({employee:processor,taskId:db.task.id,action:'review_no_action',at:'2026-09-15T23:10:00.000Z'});
    assert.equal(db.history.filter(item=>item.action==='reviewed_no_action_needed').length,1);
  }
});

test('Add to Next UW Submission completes the review and records an existing cycle association without creating a submission',async()=>{
  const db=new ReviewExecutor(),repository=new PostgresAriveRepository(db);
  await repository.mutateProcessorReview({employee:processor,taskId:'review-1',action:'review_add_to_next_uw_submission',at:'2026-09-15T23:00:00.000Z'});
  assert.equal(db.task.state,'completed');assert.deepEqual(db.history.map(item=>item.action),['review_added_to_next_uw_submission','vendor_review_added_to_uw_submission']);assert.equal(db.history[1].taskId,'resubmit-1');assert.equal(db.history[1].metadata.workflowCycle,2);
});

test('Issue Found keeps the Processor review actionable with an optional bounded existing history note',async()=>{
  const db=new ReviewExecutor(),repository=new PostgresAriveRepository(db);
  await repository.mutateProcessorReview({employee:processor,taskId:'review-1',action:'review_issue_found',note:'Title exception needs Processor follow-up',at:'2026-09-15T23:00:00.000Z'});
  assert.equal(db.task.state,'action_required');assert.equal(db.task.waiting_on,'processor_review_issue');assert.equal(db.task.metadata.reviewOutcome,'issue_follow_up_required');assert.equal(db.history[0].action,'review_issue_follow_up_required');assert.equal(db.history[0].note,'Title exception needs Processor follow-up');
  await assert.rejects(repository.mutateProcessorReview({employee:processor,taskId:'review-1',action:'review_issue_found',note:'x'.repeat(501)}),/500 characters/);
});

test('review outcomes remain server-authorized to the assigned Processor role',async()=>{
  const db=new ReviewExecutor(),repository=new PostgresAriveRepository(db);
  await assert.rejects(repository.mutateProcessorReview({employee:{email:'assistant@hfn.test',role:'processor_assistant'},taskId:'review-1',action:'review_no_action'}),/Not authorized/);
  assert.equal(db.task.state,'action_required');
});
