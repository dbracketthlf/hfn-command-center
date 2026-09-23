import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { createPrivateManualTask, manualTaskOptions } from '../src/storage/private-my-work.js';

const david={id:'david-id',email:'david@hfn.test',displayName:'David Brackett',active:true,capabilities:['processor']};
const prince={id:'prince-id',email:'prince@hfn.test',displayName:'Prince Del Rosario',active:true,capabilities:['processor_assistant']};

class RoutingClient {
  constructor({owners={}}={}){this.owners=owners;this.inserts=[];}
  release(){}
  async query(sql,args=[]){
    const query=sql.toLowerCase();
    if(['begin','commit','rollback'].includes(query))return {rows:[],rowCount:0};
    if(query.includes('from loans l left join loan_stage_events e on e.id=l.current_stage_event_id'))return {rowCount:1,rows:[{id:'loan-id',displayLoanId:'SAFE-1',currentStage:'UNDERWRITING_SUBMITTED',borrower_first_name:null,borrower_last_name:null,processor_email:'susan@hfn.test',processor_name:'Susan Vu',assistant_email:'old-assistant@hfn.test',assistant_name:'Old Assistant',processorEmail:'susan@hfn.test',processor:'Susan Vu',assistantEmail:'old-assistant@hfn.test',assistant:'Old Assistant'}]};
    if(query.includes('operational_assignment_overrides')){const owner=this.owners[args[1]]??null;return {rowCount:owner?1:0,rows:owner?[owner]:[]};}
    if(query.includes('from employees e join employee_capabilities'))return {rowCount:0,rows:[]};
    if(query.startsWith('insert into workflow_tasks')){this.inserts.push(args);return {rowCount:1,rows:[{id:args[0]}]};}
    if(query.startsWith('insert into workflow_task_history'))return {rowCount:1,rows:[]};
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}
class RoutingPool {
  constructor(options){this.client=new RoutingClient(options);}
  query(...args){return this.client.query(...args);}
  async connect(){return this.client;}
}

test('manual task options and tasks use the effective override instead of stale ARIVE ownership',async()=>{
  const pool=new RoutingPool({owners:{processor:david,processor_assistant:prince}});
  const admin={email:'admin@hfn.test',role:'admin',capabilities:['admin']};
  const options=await manualTaskOptions(pool,admin);
  assert.deepEqual(options.loans[0].assignees,[{email:david.email,name:david.displayName,role:'processor'},{email:prince.email,name:prince.displayName,role:'processor_assistant'}]);

  await createPrivateManualTask(pool,{employee:admin,loanId:'loan-id',title:'Processor task',assigneeEmail:david.email,dueAt:'2026-09-24T18:00:00Z'});
  await createPrivateManualTask(pool,{employee:admin,loanId:'loan-id',title:'Assistant task',assigneeEmail:prince.email,dueAt:'2026-09-24T18:00:00Z'});
  assert.equal(pool.client.inserts[0][4],'processor');
  assert.equal(pool.client.inserts[0][5],david.email);
  assert.equal(pool.client.inserts[1][4],'processor_assistant');
  assert.equal(pool.client.inserts[1][5],prince.email);
  await assert.rejects(()=>createPrivateManualTask(pool,{employee:admin,loanId:'loan-id',title:'Stale owner',assigneeEmail:'susan@hfn.test',dueAt:'2026-09-24T18:00:00Z'}),/Assignee is not permitted/);
});

test('manual workflow leaves an unavailable capability-safe owner explicitly unassigned',async()=>{
  const pool=new RoutingPool();
  const repository=new PostgresAriveRepository(pool);
  await repository.createManualWorkflow({employee:{email:'admin@hfn.test',role:'admin',capabilities:['admin']},loanId:'loan-id',type:'appraisal_correction'});
  const inserted=pool.client.inserts[0];
  assert.equal(inserted[5],'processor_assistant');
  assert.equal(inserted[6],null);
  assert.equal(inserted[7],null);
  assert.deepEqual(inserted[12],{assignmentException:'No active processor_assistant assignment'});
});
