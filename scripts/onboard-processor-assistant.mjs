import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { processorAssistantOnboardingPlan } from '../src/domain/employee-onboarding.js';
import { loadProcessorAssistantOnboardingPreflight } from '../src/storage/processor-assistant-onboarding-preflight.js';

const valueAfter=flag=>{const index=process.argv.indexOf(flag);return index>=0?process.argv[index+1]:null;};
const email=String(valueAfter('--email')??'').trim().toLowerCase(),displayName=String(valueAfter('--name')??'').trim(),apply=process.argv.includes('--apply'),actorEmail=String(process.env.STAFFING_TRANSITION_ACTOR_EMAIL??'').trim().toLowerCase();
if(!process.env.DATABASE_URL||!email||!displayName||!actorEmail)throw new Error('DATABASE_URL, STAFFING_TRANSITION_ACTOR_EMAIL, --email, and --name are required');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A valid verified employee email is required');
const client=new Client(postgresTestClientOptions(process.env.DATABASE_URL));

try {
  await client.connect();
  await client.query('begin');
  const {actorResult,employeeResult,ariveResult,taskResult,taskMismatchResult,ariveMismatchResult,nameConflictResult}=await loadProcessorAssistantOnboardingPreflight(client,{email,displayName,actorEmail});
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
