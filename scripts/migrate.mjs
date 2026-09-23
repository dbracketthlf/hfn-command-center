import { Pool } from 'pg';
import { PostgresAriveRepository } from '../src/storage/postgres-arive.js';
import { postgresMigrationPoolOptions } from '../src/config/runtime.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required for db:migrate');
const pool=new Pool(postgresMigrationPoolOptions(
  {databaseUrl:process.env.DATABASE_URL,production:process.env.NODE_ENV==='production'},
  {external:process.env.HFN_MIGRATION_EXTERNAL_DATABASE==='true'}
));
try{const repository=new PostgresAriveRepository(pool);await repository.applyMigrations();await repository.initialize();console.log('HFN database schema initialized.');}finally{await pool.end();}
