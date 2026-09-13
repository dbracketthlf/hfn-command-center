import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { postgresPoolOptions } from '../src/config/runtime.js';
const email=String(process.env.HFN_BOOTSTRAP_ADMIN_EMAIL??'').trim().toLowerCase(),displayName=String(process.env.HFN_BOOTSTRAP_ADMIN_NAME??'HFN Administrator').trim();
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('HFN_BOOTSTRAP_ADMIN_EMAIL must be a valid email address');
const pool=new Pool(postgresPoolOptions({databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'}));
try{const result=await pool.query(`insert into employees(id,email,display_name,role,active) values($1,$2,$3,'admin',true) on conflict(email) do update set display_name=excluded.display_name,role='admin',active=true,updated_at=now() returning email,display_name`,[randomUUID(),email,displayName]);console.log(`Admin authorized: ${result.rows[0].email}`);}finally{await pool.end();}
