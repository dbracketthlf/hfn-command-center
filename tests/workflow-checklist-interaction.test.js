import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

class ChecklistExecutor {
  constructor(){this.task={id:'ctc-1',task_type:'ctc_closing_readiness',state:'action_required',owner_role:'processor_assistant',owner_email:'joshua@hfn.test',due_at:'2026-09-15T23:00:00.000Z'};this.items=[{id:'settlement',task_id:'ctc-1',label:'Settlement Statement',state:'action_required'},{id:'flood',task_id:'ctc-1',label:'Flood Cert Invoice',state:'action_required'}];this.history=[];}
  async connect(){return this;} release(){}
  async query(sql,args=[]){const q=sql.toLowerCase();if(['begin','commit','rollback'].includes(q))return {rows:[],rowCount:0};
    if(q.startsWith('select * from workflow_tasks'))return {rows:[this.task],rowCount:1};
    if(q.startsWith('select * from workflow_task_checklist_items')){const item=this.items.find(row=>row.id===args[0]&&row.task_id===args[1]);return {rows:item?[item]:[],rowCount:item?1:0};}
    if(q.startsWith('update workflow_task_checklist_items')){const item=this.items.find(row=>row.id===args[0]);item.state=args[1];item.completed_at=['completed','not_applicable'].includes(args[1])?args[2]:null;item.completed_by_email=['completed','not_applicable'].includes(args[1])?args[3]:null;return {rows:[],rowCount:1};}
    if(q.startsWith('select state from workflow_task_checklist_items'))return {rows:this.items.map(({state})=>({state})),rowCount:this.items.length};
    if(q.startsWith('update workflow_tasks set state=\'completed\'')){if(['completed','cancelled','not_applicable'].includes(this.task.state))return {rows:[],rowCount:0};this.task.state='completed';this.task.completed_at=args[1];return {rows:[{state:'completed'}],rowCount:1};}
    if(q.startsWith('insert into workflow_task_history')){this.history.push({action:args[3],actorEmail:args[6],metadata:args[8]});return {rows:[],rowCount:1};}
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

const employee={email:'joshua@hfn.test',role:'processor_assistant'},at='2026-09-18T18:00:00.000Z';
async function update(repo,item,state){return repo.mutateWorkflowTask({employee,taskId:'ctc-1',action:'checklist',checklistItemId:item,checklistState:state,at});}

test('checklist changes persist, can be toggled back, and the final applicable item completes the task',async()=>{
  const db=new ChecklistExecutor(),repo=new PostgresAriveRepository(db);
  await update(repo,'settlement','completed');
  assert.equal(db.items[0].state,'completed');assert.equal(db.items[0].completed_by_email,employee.email);assert.equal(db.task.state,'action_required');
  await update(repo,'settlement','action_required');
  assert.equal(db.items[0].state,'action_required');assert.equal(db.items[0].completed_at,null);
  await update(repo,'settlement','completed');await update(repo,'flood','not_applicable');
  assert.equal(db.task.state,'completed');assert.equal(db.task.completed_at,at);assert.deepEqual(db.history.map(row=>row.action),['checklist_changed','checklist_changed','checklist_changed','checklist_changed','checklist_complete']);
});

test('only permitted checklist items can be marked N/A and premature generic completion remains rejected',async()=>{
  const db=new ChecklistExecutor(),repo=new PostgresAriveRepository(db);
  await assert.rejects(update(repo,'settlement','not_applicable'),/required/);
  await assert.rejects(repo.mutateWorkflowTask({employee,taskId:'ctc-1',action:'complete',at}),/Complete or mark not applicable/);
  assert.equal(db.task.state,'action_required');
});
