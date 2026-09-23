import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresAriveRepository, resolveOperationalOwnerForLoan } from '../src/storage/postgres-arive.js';

class StateClient {
  constructor(){this.keys=new Set();this.events=[];this.loans=new Map();this.snapshots=new Map();}
  loanById(id){return [...this.loans.values()].find(row=>row.id===id);}
  release(){}
  async query(sql,args=[]){
    const query=sql.toLowerCase();
    if(['begin','commit','rollback'].includes(query))return {};
    if(query.startsWith('insert into inbound_events')||query.startsWith('update inbound_events'))return {rowCount:1,rows:[]};
    if(query.startsWith('insert into webhook_idempotency')){if(this.keys.has(args[1]))return {rowCount:0,rows:[]};this.keys.add(args[1]);return {rowCount:1,rows:[{}]};}
    if(query.startsWith('insert into loans')){if(!this.loans.has(args[1]))this.loans.set(args[1],{id:args[0],currentStage:'UNKNOWN',effectiveAt:null,eventId:null});return {rowCount:1,rows:[]};}
    if(query.startsWith('select id,current_stage')){const row=this.loans.get(args[0]);return {rows:[{id:row.id,current_stage:row.currentStage,current_stage_effective_at:row.effectiveAt,current_stage_event_id:row.eventId}]};}
    if(query.startsWith('select operational_snapshot')){const row=this.loanById(args[0]);return {rows:[{operational_snapshot:this.snapshots.get(args[0])??{},operational_snapshot_effective_at:row.snapshotAt??null}]};}
    if(query.startsWith('update loans set operational_snapshot')){const row=this.loanById(args[2]);this.snapshots.set(args[2],args[0]);row.snapshotAt=args[1];return {rowCount:1,rows:[]};}
    if(query.includes('operational_assignment_overrides')||query.includes('employee_capabilities'))return {rowCount:0,rows:[]};
    if(query.startsWith('insert into loan_stage_events')){this.events.push({id:args[0],type:args[2],occurredAt:args[3]});return {rowCount:1,rows:[{id:args[0]}]};}
    if(query.startsWith('update loans set arive_display_loan_id')){const row=this.loanById(args[0]);row.currentStage=args[6];row.effectiveAt=args[7];row.eventId=args[8];return {rowCount:1,rows:[]};}
    if(query.includes('workflow_tasks')||query.includes('assistant_tasks')||query.includes('workflow_task_history'))return {rowCount:0,rows:[]};
    throw new Error(`Unhandled SQL: ${sql}`);
  }
}
class StatePool { constructor(){this.client=new StateClient();} async connect(){return this.client;} }
class RecordingRepository extends PostgresAriveRepository {
  constructor(pool){super(pool);this.workflowSyncs=[];}
  async syncWorkflowForEvent(_client,event){this.workflowSyncs.push(event);}
  async syncClosingDisclosureTask(){return 0;}
  async reconcileWorkflowMilestones(){return [];}
  async syncVictoryEvents(){}
}
const event=(id,status,date,modified,extra={})=>({zapierEventId:id,ariveLoanId:'ordered-guid',ariveDisplayLoanId:'ORDERED-1',currentLoanStatus_status:status,currentLoanStatus_date:date,modifiedDateTime:modified,...extra});

test('newer stage stays current while a delayed older stage remains in immutable event history without workflow sync',async()=>{
  const pool=new StatePool(),repository=new RecordingRepository(pool);
  await repository.receive(event('ctc-current','CLEAR_TO_CLOSE','2026-09-20T18:00:00Z','2026-09-20T18:01:00Z'));
  await repository.receive(event('uw-delayed','UNDERWRITING_SUBMITTED','2026-09-15T18:00:00Z','2026-09-15T18:01:00Z'));
  const loan=pool.client.loans.get('ordered-guid');
  assert.equal(loan.currentStage,'CLEAR_TO_CLOSE');
  assert.equal(pool.client.events.length,2);
  assert.deepEqual(repository.workflowSyncs.map(item=>item.eventType),['CLEAR_TO_CLOSE']);
});

test('delayed tracker snapshot cannot replace newer safe evidence and a later source event still advances',async()=>{
  const pool=new StatePool(),repository=new RecordingRepository(pool);
  await repository.receive(event('new-title','UNDERWRITING_SUBMITTED','2026-09-20T18:00:00Z','2026-09-20T18:01:00Z',{titleStatus:'RECEIVED',titleDate:'2026-09-20'}));
  await repository.receive(event('old-title','LOAN_SETUP','2026-09-15T18:00:00Z','2026-09-15T18:01:00Z',{titleStatus:'NOT_ORDERED'}));
  const loan=pool.client.loans.get('ordered-guid'),snapshot=pool.client.snapshots.get(loan.id);
  assert.equal(loan.currentStage,'UNDERWRITING_SUBMITTED');
  assert.equal(snapshot.trackerContext.titleStatus,'RECEIVED');
  await repository.receive(event('newer-approval','APPROVED_WITH_CONDITION','2026-09-21T18:00:00Z','2026-09-21T18:01:00Z'));
  assert.equal(loan.currentStage,'APPROVED_WITH_CONDITION');
  assert.deepEqual(repository.workflowSyncs.map(item=>item.eventType),['UNDERWRITING_SUBMITTED','APPROVED_WITH_CONDITION']);
});

test('operational owner resolver gives override precedence and rejects inactive or wrong-capability ARIVE identities',async()=>{
  const candidate=(override,arive)=>({query:async sql=>sql.includes('operational_assignment_overrides')?{rows:override?[override]:[]}:{rows:arive?[arive]:[]}});
  const david={email:'david@hfn.test',displayName:'David',active:true,capabilities:['processor']},inactive={email:'susan@hfn.test',displayName:'Susan',active:false,capabilities:['processor']},assistant={email:'prince@hfn.test',displayName:'Prince',active:true,capabilities:['processor_assistant']};
  assert.equal((await resolveOperationalOwnerForLoan(candidate(david,inactive),{loanId:'loan',role:'processor',ariveEmail:inactive.email})).owner.email,david.email);
  assert.equal((await resolveOperationalOwnerForLoan(candidate(null,inactive),{loanId:'loan',role:'processor',ariveEmail:inactive.email})).owner,null);
  assert.equal((await resolveOperationalOwnerForLoan(candidate(null,assistant),{loanId:'loan',role:'processor',ariveEmail:assistant.email})).owner,null);
  assert.equal((await resolveOperationalOwnerForLoan(candidate(null,assistant),{loanId:'loan',role:'processor_assistant',ariveEmail:assistant.email})).owner.email,assistant.email);
});
