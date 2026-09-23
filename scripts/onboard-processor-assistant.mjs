import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { processorAssistantOnboardingPlan } from '../src/domain/employee-onboarding.js';

const valueAfter=flag=>{const index=process.argv.indexOf(flag);return index>=0?process.argv[index+1]:null;};
const email=String(valueAfter('--email')??'').trim().toLowerCase(),displayName=String(valueAfter('--name')??'').trim(),apply=process.argv.includes('--apply'),actorEmail=String(process.env.STAFFING_TRANSITION_ACTOR_EMAIL??'').trim().toLowerCase();
if(!process.env.DATABASE_URL||!email||!displayName||!actorEmail)throw new Error('DATABASE_URL, STAFFING_TRANSITION_ACTOR_EMAIL, --email, and --name are required');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A valid verified employee email is required');
const client=new Client(postgresTestClientOptions(process.env.DATABASE_URL));
const open=`state not in ('completed','cancelled','not_applicable')`;

try {
  await client.connect();
  await client.query('begin');
  const [actorResult,employeeResult,ariveResult,taskResult,taskMismatchResult,ariveMismatchResult,nameConflictResult]=await Promise.all([
    client.query(`select e.id,e.email,e.active,coalesce(array_agg(c.capability) filter(where c.capability is not null),'{}') capabilities from employees e left join employee_capabilities c on c.employee_id=e.id where lower(e.email)=lower($1) group by e.id,e.email,e.active`,[actorEmail]),
    client.query(`select e.id,e.email,e.display_name "displayName",e.role,e.active,coalesce((select array_agg(c.capability) from employee_capabilities c where c.employee_id=e.id),'{}') capabilities from employees e where lower(e.email)=lower($1) for update`,[email]),
    client.query(`select l.arive_display_loan_id "displayLoanId" from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc,id desc limit 1) latest on true where l.processing_eligible_at is not null and l.current_stage not in ('LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID','ADVERSE','SUSPENDED','CANCELLED','WITHDRAWN','DENIED') and lower(coalesce(latest.metadata->>'assistantEmail',''))=lower($1) order by l.arive_display_loan_id`,[email]),
    client.query(`select l.arive_display_loan_id "displayLoanId",t.id "taskId",t.task_type "taskType",t.state from workflow_tasks t join loans l on l.id=t.loan_id where t.owner_role='processor_assistant' and ${open} and lower(coalesce(t.owner_email,''))=lower($1) order by l.arive_display_loan_id,t.id`,[email]),
    client.query(`select l.arive_display_loan_id "displayLoanId",t.id "taskId",t.owner_email "ownerEmail" from workflow_tasks t join loans l on l.id=t.loan_id where t.owner_role='processor_assistant' and ${open} and lower(coalesce(t.owner_name,''))=lower($1) and lower(coalesce(t.owner_email,''))<>lower($2) order by l.arive_display_loan_id,t.id`,[displayName,email]),
    client.query(`select l.arive_display_loan_id "displayLoanId",nullif(latest.metadata->>'assistantEmail','') "assistantEmail" from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc,id desc limit 1) latest on true where l.processing_eligible_at is not null and l.current_stage not in ('LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID','ADVERSE','SUSPENDED','CANCELLED','WITHDRAWN','DENIED') and lower(coalesce(latest.metadata->>'assistant',''))=lower($1) and lower(coalesce(latest.metadata->>'assistantEmail',''))<>lower($2) order by l.arive_display_loan_id`,[displayName,email]),
    client.query(`select count(*)::int count from employees where lower(display_name)=lower($1) and lower(email)<>lower($2)`,[displayName,email])
  ]);
  const actor=actorResult.rows[0];
  if(!actor?.active||!actor.capabilities.includes('admin'))throw new Error('An active Admin actor is required');
  const identityMismatches=[...taskMismatchResult.rows.map(row=>({kind:'open_task_owner_email_mismatch',...row})),...ariveMismatchResult.rows.map(row=>({kind:'arive_assistant_email_mismatch',...row})),...(Number(nameConflictResult.rows[0]?.count)>0?[{kind:'existing_employee_name_email_mismatch',count:Number(nameConflictResult.rows[0].count)}]:[])];
  const plan=processorAssistantOnboardingPlan({existingEmployee:employeeResult.rows[0]??null,email,displayName,identityMismatches});
  const report={dryRun:!apply,plan,existingAriveAssignedActiveLoans:ariveResult.rows.map(row=>row.displayLoanId),existingOpenAssistantTasks:taskResult.rows.map(row=>({displayLoanId:row.displayLoanId,taskId:row.taskId,taskType:row.taskType,state:row.state})),identityMismatches};
  if(!apply){await client.query('rollback');console.log(JSON.stringify(report,null,2));}
  else {
    let employeeId=employeeResult.rows[0]?.id;
    if(plan.action==='create'){employeeId=randomUUID();await client.query(`insert into employees(id,email,display_name,role,active) values($1,$2,$3,'processor_assistant',true)`,[employeeId,email,displayName]);}
    else await client.query(`update employees set active=true,updated_at=now() where id=$1 and email=$2 and display_name=$3 and role='processor_assistant'`,[employeeId,email,displayName]);
    await client.query(`insert into employee_capabilities(employee_id,capability) values($1,'processor_assistant') on conflict do nothing`,[employeeId]);
    await client.query('commit');console.log(JSON.stringify({...report,dryRun:false,applied:true},null,2));
  }
} catch(error) {
  await client.query('rollback').catch(()=>{});
  console.log(JSON.stringify({ok:false,errorCode:error?.code??'UNKNOWN',error:error?.message??'Processor Assistant onboarding failed'}));
  process.exitCode=1;
} finally {await client.end().catch(()=>{});}
