import { Pool } from 'pg';
import { readFile } from 'node:fs/promises';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresPoolOptions } from '../src/config/runtime.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for db:migrate');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
async function apply(name,file){const applied=await pool.query('select name from schema_migrations where name=$1',[name]);if(applied.rowCount)return;const client=await pool.connect();try{await client.query('begin');await client.query(await readFile(new URL(file,import.meta.url),'utf8'));await client.query('insert into schema_migrations(name) values($1)',[name]);await client.query('commit');}catch(error){await client.query('rollback');throw error;}finally{client.release();}}
try{await new PostgresAriveRepository(pool).initialize();await apply('010_historical_funding_corrections','../db/010_historical_funding_corrections.sql');await apply('016_private_my_work','../db/016_private_my_work.sql');console.log('HFN database schema initialized.');}finally{await pool.end();}
