import { Pool } from 'pg'; import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for db:migrate');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:true}:undefined});
try{await new PostgresAriveRepository(pool).initialize();console.log('HFN database schema initialized.');}finally{await pool.end();}
