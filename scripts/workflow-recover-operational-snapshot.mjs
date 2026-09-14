import { Pool } from 'pg';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresPoolOptions } from '../src/config/runtime.js';

const loanIndex=process.argv.indexOf('--loan'),displayLoanId=loanIndex>=0?String(process.argv[loanIndex+1]??'').trim():'';
if(!displayLoanId)throw new Error('Usage: npm run workflow:recover-operational-snapshot -- --loan <displayLoanId> [--dry-run|--apply]');
const apply=process.argv.includes('--apply'),dryRun=process.argv.includes('--dry-run')||!apply;
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{console.log(JSON.stringify(await new PostgresAriveRepository(pool).recoverOperationalSnapshot({displayLoanId,dryRun}),null,2));}finally{await pool.end();}
