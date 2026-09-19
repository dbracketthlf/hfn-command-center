import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { businessDeadline } from '../src/domain/workflow-engine.js';
import { defaultCalendar } from '../src/domain/sla.js';

class PostCtcExecutor {
  constructor(){this.tasks=[{id:'docs-out',loan_id:'loan-1',task_type:'request_loan_documents',title:'Send loan documents to notary',origin:'automatic',owner_role:'processor',owner_email:'processor@hfn.test',owner_name:'Processor',state:'action_required',kpi_eligible:true}];this.history=[];}
  async connect(){return this;} release(){}
  async query(sql,args=[]){const q=sql.toLowerCase();if(['begin','commit','rollback'].includes(q))return {rows:[],rowCount:0};
    if(q.startsWith('select * from workflow_tasks')){const task=this.tasks.find(row=>row.id===args[0]);return {rows:task?[task]:[],rowCount:task?1:0};}
    if(q.startsWith("update workflow_tasks set state='completed'")){const task=this.tasks.find(row=>row.id===args[0]);if(!task||['completed','cancelled','not_applicable'].includes(task.state))return {rows:[],rowCount:0};task.state='completed';task.completed_at=args[1];return {rows:[{id:task.id}],rowCount:1};}
    if(q.startsWith('insert into workflow_task_history')){this.history.push({taskId:args[1],action:args[3],actorEmail:args[6],metadata:args[8]});return {rows:[],rowCount:1};}
    if(q.startsWith('insert into workflow_tasks')){const type=args[2];if(this.tasks.some(row=>row.loan_id===args[1]&&row.task_type===type))return {rows:[],rowCount:0};const task={id:args[0],loan_id:args[1],task_type:type,title:args[3],origin:args[4],owner_role:args[5],owner_email:args[6],owner_name:args[7],source_trigger:args[8],state:'action_required',created_at:args[9],due_at:args[10],kpi_eligible:args[11],waiting_on:args[12]};this.tasks.push(task);return {rows:[{id:task.id}],rowCount:1};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

const employee={email:'processor@hfn.test',role:'processor'},at='2026-09-18T18:00:00.000Z';
test('manual Docs Sent and Docs Signed create one idempotent downstream processor task with manual attribution',async()=>{
  const db=new PostCtcExecutor(),repo=new PostgresAriveRepository(db);
  await repo.markDocsSentToNotary({employee,taskId:'docs-out',at});await repo.markDocsSentToNotary({employee,taskId:'docs-out',at});
  const signed=db.tasks.find(task=>task.task_type==='confirm_borrower_signing');assert.equal(signed.title,'Docs Signed Follow-Up');assert.equal(signed.due_at,businessDeadline(at,2,defaultCalendar));assert.equal(db.tasks.filter(task=>task.task_type==='confirm_borrower_signing').length,1);assert.ok(db.history.some(entry=>entry.action==='docs_sent_to_notary'&&entry.actorEmail===employee.email));
  await repo.markDocsSigned({employee,taskId:signed.id,at});await repo.markDocsSigned({employee,taskId:signed.id,at});
  const fund=db.tasks.find(task=>task.task_type==='clear_funding_requirements');assert.equal(fund.title,'Fund Loan');assert.equal(fund.due_at,null);assert.equal(db.tasks.filter(task=>task.task_type==='clear_funding_requirements').length,1);assert.ok(db.history.some(entry=>entry.action==='docs_signed'&&entry.actorEmail===employee.email));
});

test('post-CTC manual actions remain processor-only and reject the wrong workflow task type',async()=>{
  const db=new PostCtcExecutor(),repo=new PostgresAriveRepository(db);await assert.rejects(repo.markDocsSigned({employee,taskId:'docs-out',at}),/docs_signed is not valid/);await assert.rejects(repo.markDocsSentToNotary({employee:{...employee,role:'processor_assistant'},taskId:'docs-out',at}),/Not authorized/);});
