import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { businessDeadline } from '../src/domain/workflow-engine.js';
import { defaultCalendar } from '../src/domain/sla.js';

class SettlementExecutor {
  constructor({kpiEligible=true}={}){this.tasks=[{id:'payoff-follow',loan_id:'loan-1',task_type:'payoff_follow_up',origin:'automatic',owner_role:'processor_assistant',owner_email:'assistant@hfn.test',owner_name:'Assistant',state:'waiting',kpi_eligible:kpiEligible,follow_up_cadence_business_days:3,follow_up_count:0,waiting_on:'payoff_provider'}];this.history=[];}
  async connect(){return this;} release(){}
  task(id){return this.tasks.find(task=>task.id===id);}
  async query(sql,args=[]){const q=sql.toLowerCase();
    if(['begin','commit','rollback'].includes(q))return {rows:[],rowCount:0};
    if(q.startsWith('select * from workflow_tasks where id=')){const task=this.task(args[0]);return {rows:task?[task]:[],rowCount:task?1:0};}
    if(q.startsWith('select id,loan_id,task_type,origin')){const task=this.task(args[0]);return {rows:task?[task]:[],rowCount:task?1:0};}
    if(q.startsWith("select nullif(metadata->>'processoremail'"))return {rows:[{processorEmail:'processor@hfn.test',processor:'Processor'}],rowCount:1};
    if(q.startsWith('select task_type,state,last_follow_up_at')){const task=this.task(args[0]);return {rows:task?[task]:[],rowCount:task?1:0};}
    if(q.startsWith('select to_state from workflow_task_history'))return {rows:[],rowCount:0};
    if(q.startsWith("update workflow_tasks set state='completed'")){const task=this.task(args[0]);if(task&&!['completed','cancelled','not_applicable'].includes(task.state)){task.state='completed';task.completed_at=args[1];return {rows:[],rowCount:1};}return {rows:[],rowCount:0};}
    if(q.startsWith("update workflow_tasks set state='waiting',last_follow_up_at")){const task=this.task(args[0]);task.state='waiting';task.last_follow_up_at=args[1];task.next_follow_up_at=args[2];task.follow_up_count=(task.follow_up_count??0)+1;return {rows:[],rowCount:1};}
    if(q.startsWith('insert into workflow_task_history')){this.history.push({taskId:args[1],at:args[2],action:args[3],fromState:args[4],toState:args[5],actorEmail:args[6],metadata:args[8]});return {rows:[],rowCount:1};}
    if(q.startsWith('insert into workflow_tasks')){const type=q.includes("'order_settlement_statement'")?'order_settlement_statement':args[2];if(this.tasks.some(task=>task.loan_id===args[1]&&task.task_type===type))return {rows:[],rowCount:0};let task;
      if(type==='order_settlement_statement')task={id:args[0],loan_id:args[1],task_type:type,title:'Order Settlement Statement',origin:args[2],owner_role:'processor_assistant',owner_email:args[3],owner_name:args[4],state:'action_required',created_at:args[5],due_at:args[6],kpi_eligible:args[7]};
      else if(type==='settlement_statement_follow_up')task={id:args[0],loan_id:args[1],task_type:type,title:args[3],origin:args[4],owner_role:args[5],owner_email:args[6],owner_name:args[7],state:'waiting',created_at:args[8],kpi_eligible:args[9],waiting_on:args[10],follow_up_cadence_business_days:args[11],next_follow_up_at:args[12],follow_up_count:0,metadata:args[13]};
      else if(type==='review_payoff')task={id:args[0],loan_id:args[1],task_type:type,title:args[3],origin:args[4],owner_role:'processor',owner_email:args[5],owner_name:args[6],state:'action_required',created_at:args[7],due_at:args[8],kpi_eligible:false,metadata:args[9]};
      else throw new Error(`Unexpected task type ${type}`);this.tasks.push(task);return {rows:[task],rowCount:1};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}
const assistant={email:'assistant@hfn.test',role:'processor_assistant'},payoffAt='2026-09-11T23:00:00.000Z';

test('Payoff Received creates one KPI-eligible Assistant settlement-statement order task',async()=>{
  const db=new SettlementExecutor(),repository=new PostgresAriveRepository(db);await repository.mutateWorkflowTask({employee:assistant,taskId:'payoff-follow',action:'payoff_received',at:payoffAt});
  const order=db.tasks.find(task=>task.task_type==='order_settlement_statement');
  const review=db.tasks.find(task=>task.task_type==='review_payoff');
  assert.equal(db.task('payoff-follow').state,'completed');assert.equal(order.owner_role,'processor_assistant');assert.equal(order.owner_email,assistant.email);assert.equal(order.kpi_eligible,true);assert.equal(order.due_at,businessDeadline(payoffAt,1,defaultCalendar));assert.equal(review.owner_role,'processor');assert.equal(review.owner_email,'processor@hfn.test');assert.equal(review.kpi_eligible,false);assert.equal(review.due_at,businessDeadline(payoffAt,1,defaultCalendar));assert.ok(db.history.some(item=>item.action==='payoff_received'));assert.ok(db.history.some(item=>item.action==='settlement_statement_order_created'));assert.ok(db.history.some(item=>item.action==='processor_review_handoff_created'));
  await repository.mutateWorkflowTask({employee:assistant,taskId:'payoff-follow',action:'payoff_received',at:payoffAt});assert.equal(db.tasks.filter(task=>task.task_type==='order_settlement_statement').length,1);
});

test('Settlement Statement Ordered atomically creates a waiting two-business-day follow-up',async()=>{
  const db=new SettlementExecutor(),repository=new PostgresAriveRepository(db);await repository.mutateWorkflowTask({employee:assistant,taskId:'payoff-follow',action:'payoff_received',at:payoffAt});const order=db.tasks.find(task=>task.task_type==='order_settlement_statement');
  await repository.mutateWorkflowTask({employee:assistant,taskId:order.id,action:'settlement_statement_ordered',at:payoffAt});const follow=db.tasks.find(task=>task.task_type==='settlement_statement_follow_up');
  assert.equal(order.state,'completed');assert.equal(follow.state,'waiting');assert.equal(follow.waiting_on,'title_escrow');assert.equal(follow.follow_up_cadence_business_days,2);assert.equal(follow.next_follow_up_at,businessDeadline(payoffAt,2,defaultCalendar));assert.equal(follow.kpi_eligible,true);assert.equal(db.tasks.filter(task=>task.task_type==='settlement_statement_follow_up').length,1);
});

test('Settlement follow-up records cadence safely and receipt completes without creating another task',async()=>{
  const db=new SettlementExecutor({kpiEligible:false}),repository=new PostgresAriveRepository(db),followAt='2026-09-15T23:00:00.000Z';await repository.mutateWorkflowTask({employee:assistant,taskId:'payoff-follow',action:'payoff_received',at:payoffAt});const order=db.tasks.find(task=>task.task_type==='order_settlement_statement');await repository.mutateWorkflowTask({employee:assistant,taskId:order.id,action:'settlement_statement_ordered',at:payoffAt});const follow=db.tasks.find(task=>task.task_type==='settlement_statement_follow_up');
  await repository.mutateWorkflowTask({employee:assistant,taskId:follow.id,action:'follow_up',at:followAt});assert.equal(follow.follow_up_count,1);assert.equal(follow.last_follow_up_at,followAt);assert.equal(follow.next_follow_up_at,businessDeadline(followAt,2,defaultCalendar));assert.equal(follow.kpi_eligible,false);assert.ok(db.history.at(-1).metadata.waitingOn==='title_escrow');
  await repository.mutateWorkflowTask({employee:assistant,taskId:follow.id,action:'settlement_statement_received',at:followAt});assert.equal(follow.state,'completed');assert.equal(db.tasks.filter(task=>task.task_type==='settlement_statement_follow_up').length,1);assert.equal(JSON.stringify(db.history).includes('borrower'),false);
});

test('settlement workflow remains outside Assistant SLA aggregate queries',async()=>{const {readFile}=await import('node:fs/promises');const repository=await readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8'),dashboard=repository.slice(repository.indexOf('async dashboard()'),repository.indexOf('async health()'));assert.doesNotMatch(dashboard,/workflow_tasks/);});
