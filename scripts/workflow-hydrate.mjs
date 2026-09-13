import { Pool } from 'pg';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresPoolOptions } from '../src/config/runtime.js';
const apply=process.argv.includes('--apply'),dryRun=process.argv.includes('--dry-run')||!apply;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{const result=await new PostgresAriveRepository(pool).hydrateWorkflowTasks({dryRun});console.log(JSON.stringify(result,null,2));}finally{await pool.end();}
