import { createOperatorDatabaseClient } from '../src/storage/operator-database-client.js';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const client=createOperatorDatabaseClient({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'});
try{
  await client.connect();
  const audit=await new PostgresAriveRepository(client).auditStaleVendorTasks();
  console.log(JSON.stringify(audit,null,2));
}finally{await client.end().catch(()=>{});}
