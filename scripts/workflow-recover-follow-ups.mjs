import { Pool } from 'pg';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresPoolOptions } from '../src/config/runtime.js';
import { defaultCalendar } from '../src/domain/sla.js';
import { followUpForInitialTask } from '../src/domain/third-party-follow-ups.js';

const apply=process.argv.includes('--apply'),dryRun=process.argv.includes('--dry-run')||!apply;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
const receivedKey={order_appraisal:'appraisalReceivedDate',order_title_escrow:'titleReceivedDate',request_insurance_eoi:'hoiReceivedDate',order_payoff:null};
try{
  const client=await pool.connect();
  try{
    await client.query('begin');
    const holidays=await client.query("select h.holiday_date::text holiday_date from calendar_holidays h join business_calendars c on c.id=h.calendar_id where c.name='HFN'");
    const repository=new PostgresAriveRepository(pool); repository.calendar={...defaultCalendar,holidays:holidays.rows.map(row=>row.holiday_date)};
    const candidates=await client.query(`select t.id,t.loan_id,t.task_type,t.completed_at,l.arive_display_loan_id "displayLoanId",coalesce(i.payload->'milestoneDates','{}'::jsonb) dates
      from workflow_tasks t join loans l on l.id=t.loan_id
      left join lateral (select payload from inbound_events where source='zapier-arive' and payload->>'ariveSystemGuid'=l.arive_system_guid order by received_at desc,id desc limit 1) i on true
      where t.task_type=any($1) and t.state='completed' and l.processing_eligible_at is not null
      and l.current_stage not in ('LOAN_FUNDED','BROKER_CHECK_RECEIVED','COMMISSION_PAID','ADVERSE','SUSPENDED')`,[Object.keys(receivedKey)]);
    const proposed=[];
    for(const task of candidates.rows){
      const config=followUpForInitialTask(task.task_type),key=receivedKey[task.task_type];
      if(!config||(key&&task.dates?.[key]))continue;
      const exists=await client.query('select id from workflow_tasks where loan_id=$1 and task_type=$2',[task.loan_id,config.taskType]);
      if(exists.rowCount)continue;
      proposed.push({displayLoanId:task.displayLoanId,initialTaskType:task.task_type,followUpTaskType:config.taskType,ownerRole:'processor_assistant',kpiEligible:false});
      if(!dryRun)await repository.createThirdPartyFollowUp(client,task.id,{at:task.completed_at});
    }
    if(dryRun)await client.query('rollback');else await client.query('commit');
    console.log(JSON.stringify({dryRun,tasksWouldCreate:proposed.length,tasks:proposed},null,2));
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}finally{await pool.end();}
