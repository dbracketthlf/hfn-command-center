import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { migrationDefinitions, PostgresAriveRepository } from '../src/storage/postgres-arive.js';

test('normal repository initialization validates schema and loads the calendar without operational repairs',async()=>{
  const calls=[],pool={query:async(sql)=>{calls.push(sql);if(sql==='select name from schema_migrations')return {rows:migrationDefinitions.map(([name])=>({name}))};if(sql.includes('calendar_holidays'))return {rows:[]};throw new Error(`Unexpected query: ${sql}`);}};
  const repository=new PostgresAriveRepository(pool);
  repository.repairAssistantDeadlines=async()=>{throw new Error('startup repair must not run');};
  repository.repairClosingDisclosureTasks=async()=>{throw new Error('startup repair must not run');};
  await repository.initialize();
  assert.equal(calls.some(sql=>/^\s*(update|insert|delete)\b/i.test(sql)),false);
});

test('startup fails clearly when migrations have not been applied and repairs remain explicit commands',async()=>{
  const repository=new PostgresAriveRepository({query:async()=>{const error=new Error('missing relation');error.code='42P01';throw error;}});
  await assert.rejects(repository.initialize(),/npm run db:migrate/);
  const [manifest,repair]=await Promise.all([readFile(new URL('../package.json',import.meta.url),'utf8'),readFile(new URL('../scripts/repair-operational-tasks.mjs',import.meta.url),'utf8')]);
  assert.match(manifest,/workflow:repair-operational-tasks/);
  assert.match(repair,/includes\('--apply'\)/);
  assert.match(repair,/repairAssistantDeadlines/);
  assert.match(repair,/repairClosingDisclosureTasks/);
});
