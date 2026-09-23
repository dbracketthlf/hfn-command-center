import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';

const valueAfter = flag => { const index=process.argv.indexOf(flag); return index >= 0 ? process.argv[index+1] : null; };
const fromName=valueAfter('--from'),toName=valueAfter('--to'),apply=process.argv.includes('--apply'),grantTargetProcessor=process.argv.includes('--grant-target-processor-capability'),deactivateSource=process.argv.includes('--deactivate-source'),actorEmail=process.env.STAFFING_TRANSITION_ACTOR_EMAIL?.trim().toLowerCase();
if(!process.env.DATABASE_URL||!fromName||!toName||!actorEmail)throw new Error('DATABASE_URL, STAFFING_TRANSITION_ACTOR_EMAIL, --from, and --to are required');
const client=new Client(postgresTestClientOptions(process.env.DATABASE_URL));
const terminal=['LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID','ADVERSE','SUSPENDED','CANCELLED','WITHDRAWN','DENIED'];

try {
  await client.connect();
  await client.query('begin');
  const people=await client.query(`select e.id,e.email,e.display_name "displayName",e.active,coalesce(array_agg(c.capability) filter(where c.capability is not null),'{}') capabilities from employees e left join employee_capabilities c on c.employee_id=e.id where lower(e.display_name)=lower($1) or lower(e.display_name)=lower($2) or lower(e.email)=lower($3) group by e.id,e.email,e.display_name,e.active`,[fromName,toName,actorEmail]);
  const find=name=>people.rows.find(row=>row.displayName.toLowerCase()===name.toLowerCase()),from=find(fromName),to=find(toName),actor=people.rows.find(row=>row.email.toLowerCase()===actorEmail);
  if(!from||!to||!actor||!actor.active||!actor.capabilities.includes('admin'))throw new Error('Authorized active Admin, source employee, and target employee are required');
  if(!to.active||(!to.capabilities.includes('processor')&&!grantTargetProcessor))throw new Error('Target must be an active Processor, or --grant-target-processor-capability must be supplied');
  const [loans,tasks]=await Promise.all([
    client.query(`select l.id,l.arive_display_loan_id "displayLoanId",l.current_stage "currentStage" from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc,id desc limit 1) latest on true where l.processing_eligible_at is not null and upper(coalesce(l.current_stage,'')) <> all($1::text[]) and lower(coalesce(latest.metadata->>'processorEmail',''))=lower($2) order by l.arive_display_loan_id`,[terminal,from.email]),
    client.query(`select t.id,t.loan_id "loanId",l.arive_display_loan_id "displayLoanId",t.task_type "taskType",t.state,t.due_at "dueAt",t.workflow_cycle "workflowCycle",t.kpi_eligible "kpiEligible" from workflow_tasks t join loans l on l.id=t.loan_id where t.owner_role='processor' and lower(coalesce(t.owner_email,''))=lower($1) and t.state not in ('completed','cancelled','not_applicable') order by l.arive_display_loan_id,t.due_at nulls last,t.id`,[from.email])
  ]);
  const report={dryRun:!apply,requestedActions:{grantTargetProcessorCapability:grantTargetProcessor,deactivateSource},from:{displayName:from.displayName,email:from.email},to:{displayName:to.displayName,email:to.email},activeLoans:loans.rows.map(row=>({displayLoanId:row.displayLoanId,currentStage:row.currentStage})),openProcessorTasks:tasks.rows.map(row=>({displayLoanId:row.displayLoanId,taskId:row.id,taskType:row.taskType,state:row.state,dueAt:row.dueAt,workflowCycle:row.workflowCycle,kpiEligible:row.kpiEligible}))};
  if(!apply){await client.query('rollback');console.log(JSON.stringify(report,null,2));process.exitCode=0;}
  else {
    if(grantTargetProcessor)await client.query(`insert into employee_capabilities(employee_id,capability) values($1,'processor') on conflict do nothing`,[to.id]);
    for(const loan of loans.rows){const existing=await client.query(`select o.employee_id "employeeId" from operational_assignment_overrides o where o.loan_id=$1 and o.owner_role='processor' and o.released_at is null`,[loan.id]);if(existing.rowCount&&existing.rows[0].employeeId!==to.id)throw new Error(`Active Processor override already exists for ${loan.displayLoanId}`);if(!existing.rowCount)await client.query(`insert into operational_assignment_overrides(id,loan_id,owner_role,employee_id,reason,effective_at,created_by_email) values($1,$2,'processor',$3,'staffing_transition',now(),$4)`,[randomUUID(),loan.id,to.id,actor.email]);}
    for(const task of tasks.rows){const updated=await client.query(`update workflow_tasks set owner_email=$2,owner_name=$3,updated_at=now() where id=$1 and owner_role='processor' and state not in ('completed','cancelled','not_applicable') returning id`,[task.id,to.email,to.displayName]);if(updated.rowCount)await client.query(`insert into workflow_task_history(id,task_id,occurred_at,action,from_state,to_state,actor_email,metadata) values($1,$2,now(),'reassigned_due_to_staffing_change',$3,$3,$4,$5)`,[randomUUID(),task.id,task.state,actor.email,{previousOwnerEmail:from.email,newOwnerEmail:to.email,reason:'staffing_transition'}]);}
    if(deactivateSource)await client.query(`update employees set active=false,updated_at=now() where id=$1 and active=true`,[from.id]);
    await client.query('commit');console.log(JSON.stringify({...report,dryRun:false,applied:true},null,2));
  }
} catch(error) {
  await client.query('rollback').catch(()=>{});
  console.log(JSON.stringify({ok:false,errorCode:error?.code??'UNKNOWN',error:error?.message??'Staffing transition failed'}));
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
