import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { postgresTestClientOptions } from '../src/config/runtime.js';
import { migrationDefinitions, PostgresAriveRepository } from '../src/storage/postgres-arive.js';

const url=process.env.TEST_DATABASE_URL;
const createClient=async()=>{const client=new Client(postgresTestClientOptions(url));await client.connect();return client;};

test('PostgreSQL migration 022 establishes source-time effective state from a valid pre-022 schema',{skip:!url},async()=>{
  const client=await createClient(),schema=`hfn_migration_022_${randomUUID().replaceAll('-','')}`;
  try{
    await client.query(`create schema ${schema};set search_path to ${schema}`);
    await client.query('create table loans(id uuid primary key,current_stage text not null,updated_at timestamptz not null);create table loan_stage_events(id uuid primary key,loan_id uuid not null,event_type text not null,occurred_at timestamptz not null,received_at timestamptz not null)');
    const loanId=randomUUID(),olderEventId=randomUUID(),newerEventId=randomUUID();
    await client.query("insert into loans(id,current_stage,updated_at) values($1,'CLEAR_TO_CLOSE','2026-09-22T00:00:00Z')",[loanId]);
    // The older source event arrived later; source occurrence time must win.
    await client.query("insert into loan_stage_events(id,loan_id,event_type,occurred_at,received_at) values($1,$2,'CLEAR_TO_CLOSE','2026-09-12T18:00:00Z','2026-09-20T18:00:00Z'),($3,$2,'CLEAR_TO_CLOSE','2026-09-18T18:00:00Z','2026-09-19T18:00:00Z')",[olderEventId,loanId,newerEventId]);
    await client.query(await readFile(new URL('../db/022_effective_operational_state.sql',import.meta.url),'utf8'));
    const columns=await client.query("select column_name from information_schema.columns where table_schema=current_schema() and table_name='loans' and column_name=any($1) order by column_name",[['current_stage_effective_at','current_stage_event_id','operational_snapshot_effective_at']]);
    assert.deepEqual(columns.rows.map(row=>row.column_name),['current_stage_effective_at','current_stage_event_id','operational_snapshot_effective_at']);
    const loan=(await client.query('select current_stage_effective_at,current_stage_event_id,operational_snapshot_effective_at from loans where id=$1',[loanId])).rows[0];
    assert.equal(loan.current_stage_event_id,newerEventId);
    assert.equal(loan.current_stage_effective_at.toISOString(),'2026-09-18T18:00:00.000Z');
    assert.equal(loan.operational_snapshot_effective_at.toISOString(),'2026-09-18T18:00:00.000Z');
    const foreignKey=await client.query("select confdeltype from pg_constraint where conrelid='loans'::regclass and contype='f' and pg_get_constraintdef(oid) like '%current_stage_event_id%'");
    assert.equal(foreignKey.rows[0].confdeltype,'r');
    const index=await client.query("select indexname from pg_indexes where schemaname=current_schema() and tablename='loans' and indexname='loans_current_stage_effective_at'");
    assert.equal(index.rowCount,1);
  }finally{await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});

test('PostgreSQL migration runner executes and records the complete repository sequence',{skip:!url},async()=>{
  const client=await createClient(),schema=`hfn_all_migrations_${randomUUID().replaceAll('-','')}`;
  try{
    await client.query(`create schema ${schema};set search_path to ${schema}`);
    client.release=()=>{};
    const repository=new PostgresAriveRepository({query:(...args)=>client.query(...args),connect:async()=>client});
    await repository.applyMigrations();
    const applied=await client.query('select name from schema_migrations order by name');
    assert.deepEqual(applied.rows.map(row=>row.name),migrationDefinitions.map(([name])=>name));
    const columns=await client.query("select column_name from information_schema.columns where table_schema=current_schema() and table_name='loans' and column_name=any($1)",[['current_stage_effective_at','current_stage_event_id','operational_snapshot_effective_at']]);
    assert.equal(columns.rowCount,3);
  }finally{await client.query(`drop schema if exists ${schema} cascade`).catch(()=>{});await client.end();}
});
