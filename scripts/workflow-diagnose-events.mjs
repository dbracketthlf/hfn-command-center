import { Pool } from 'pg';
import { postgresOperatorPoolOptions } from '../src/config/runtime.js';
import { safeInboundEventHistory } from '../src/domain/event-history-diagnostic.js';

const loanIndex=process.argv.indexOf('--loan'),displayLoanId=loanIndex>=0?String(process.argv[loanIndex+1]??'').trim():'';
if(!displayLoanId)throw new Error('Usage: npm run workflow:diagnose-events -- --loan <displayLoanId>');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const pool=new Pool(postgresOperatorPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{
  const loan=await pool.query(`select id,arive_system_guid "ariveSystemGuid",arive_display_loan_id "displayLoanId" from loans where arive_display_loan_id=$1`,[displayLoanId]);
  if(loan.rowCount!==1)throw new Error(loan.rowCount?'Ambiguous loan identity':'Loan not found');
  const row=loan.rows[0],events=await pool.query(`select id,"source",external_id "sourceEventId",received_at "receivedAt",processing_status "processingStatus",payload->>'currentLoanStatus' "currentLoanStatus",payload->>'triggerSource' "triggerSource",payload->>'suppliedEventId' "suppliedEventId",payload->'incomingFieldPresence' "incomingFieldPresence",payload->'topLevelKeys' "topLevelKeys",payload->'payloadStructure' "payloadStructure",payload->'recognizedTrackerFieldLocations' "recognizedTrackerFieldLocations",payload->'trackerContext' "trackerContext",payload->'milestoneDates' "milestoneDates" from inbound_events where source='zapier-arive' and payload->>'ariveSystemGuid'=$1 order by received_at asc,id asc`,[row.ariveSystemGuid]);
  console.log(JSON.stringify({displayLoanId:row.displayLoanId,eventsInspected:events.rowCount,events:safeInboundEventHistory(events.rows)},null,2));
}finally{await pool.end();}
