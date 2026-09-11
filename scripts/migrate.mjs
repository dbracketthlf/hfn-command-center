import { Pool } from 'pg'; import { PostgresAriveRepository } from '../src/storage/postgres-arive.js'; import { postgresPoolOptions } from '../src/config/runtime.js';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for db:migrate');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{await new PostgresAriveRepository(pool).initialize();console.log('HFN database schema initialized.');}finally{await pool.end();}
