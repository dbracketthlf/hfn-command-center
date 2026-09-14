import { Pool } from 'pg';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresPoolOptions } from '../src/config/runtime.js';

if(!process.argv.includes('--apply'))throw new Error('This explicit operational repair requires --apply. It is never run during web-server startup.');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required; the connection value is never printed');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{const repository=new PostgresAriveRepository(pool);await repository.initialize();await repository.repairAssistantDeadlines();await repository.repairClosingDisclosureTasks();console.log('Operational task repairs completed.');}finally{await pool.end();}
