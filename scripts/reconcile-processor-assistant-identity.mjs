import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { processorAssistantIdentityReconciliationPlan } from '../src/domain/employee-onboarding.js';

const valueAfter=flag=>{const index=process.argv.indexOf(flag);return index>=0?process.argv[index+1]:null;};
const employeeId=String(valueAfter('--employee-id')??'').trim(),email=String(valueAfter('--email')??'').trim().toLowerCase(),currentDisplayName=String(valueAfter('--current-name')??'').trim(),displayName=String(valueAfter('--name')??'').trim(),apply=process.argv.includes('--apply'),removeAdminCapability=process.argv.includes('--remove-admin-capability'),actorEmail=String(process.env.STAFFING_TRANSITION_ACTOR_EMAIL??'').trim().toLowerCase();
if(!process.env.DATABASE_URL||!employeeId||!email||!currentDisplayName||!displayName||!actorEmail)throw new Error('DATABASE_URL, STAFFING_TRANSITION_ACTOR_EMAIL, --employee-id, --email, --current-name, and --name are required');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A valid verified employee email is required');
if(!removeAdminCapability)throw new Error('--remove-admin-capability is required to acknowledge Admin capability removal');
const client=new Client(postgresTestClientOptions(process.env.DATABASE_URL));

try {
  await client.connect();
  await client.query('begin');
  const actorResult=await client.query(`select e.id,e.email,e.active,coalesce(array_agg(c.capability) filter(where c.capability is not null),'{}') capabilities from employees e left join employee_capabilities c on c.employee_id=e.id where lower(e.email)=lower($1) group by e.id,e.email,e.active`,[actorEmail]);
  const employeeResult=await client.query(`select e.id,e.email,e.display_name "displayName",e.role,e.active,coalesce((select array_agg(c.capability) from employee_capabilities c where c.employee_id=e.id),'{}') capabilities from employees e where e.id=$1 and lower(e.email)=lower($2) for update`,[employeeId,email]);
  const nameConflictResult=await client.query(`select count(*)::int count from employees where id<>$1 and lower(trim(display_name))=lower(trim($2))`,[employeeId,displayName]);
  const activeAssignmentResult=await client.query(`select count(*)::int count from loans l left join lateral (select metadata from loan_stage_events where loan_id=l.id order by occurred_at desc,received_at desc,id desc limit 1) latest on true where l.processing_eligible_at is not null and l.current_stage not in ('LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID','ADVERSE','SUSPENDED','CANCELLED','WITHDRAWN','DENIED') and lower(coalesce(latest.metadata->>'assistantEmail',''))=lower($1)`,[email]);
  const openTaskResult=await client.query(`select count(*)::int count from workflow_tasks t where t.owner_role='processor_assistant' and t.state not in ('completed','cancelled','not_applicable') and lower(coalesce(t.owner_email,''))=lower($1)`,[email]);
  const actor=actorResult.rows[0],existingEmployee=employeeResult.rows[0]??null;
  if(!actor?.active||!actor.capabilities.includes('admin')||actor.id===employeeId)throw new Error('A distinct active Admin actor is required');
  const plan=processorAssistantIdentityReconciliationPlan({existingEmployee,employeeId,email,currentDisplayName,displayName,removeAdminCapability,nameConflictCount:nameConflictResult.rows[0]?.count??0});
  const report={dryRun:!apply,current:{employeeId:existingEmployee.id,displayName:existingEmployee.displayName,email:existingEmployee.email,legacyRole:existingEmployee.role,active:existingEmployee.active,capabilities:existingEmployee.capabilities},proposed:plan,preservedOperationalReferences:{activeAriveAssignedLoanCount:Number(activeAssignmentResult.rows[0]?.count??0),openAssistantTaskCount:Number(openTaskResult.rows[0]?.count??0)}};
  if(!apply){await client.query('rollback');console.log(JSON.stringify(report,null,2));}
  else {
    await client.query(`update employees set display_name=$2,email=$3,role='processor_assistant',active=true,updated_at=now() where id=$1 and lower(email)=lower($3)`,[employeeId,displayName,email]);
    await client.query(`delete from employee_capabilities where employee_id=$1 and capability in ('admin','processor')`,[employeeId]);
    await client.query(`insert into employee_capabilities(employee_id,capability) values($1,'processor_assistant') on conflict do nothing`,[employeeId]);
    await client.query('commit');console.log(JSON.stringify({...report,dryRun:false,applied:true},null,2));
  }
} catch(error) {
  await client.query('rollback').catch(()=>{});
  console.log(JSON.stringify({ok:false,errorCode:error?.code??'UNKNOWN',error:error?.message??'Processor Assistant identity reconciliation failed'}));
  process.exitCode=1;
} finally {await client.end().catch(()=>{});}
