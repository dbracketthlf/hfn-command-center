import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createOperatorDatabaseClient,operatorDatabaseClientOptions } from '../src/storage/operator-database-client.js';
import { postgresTestClientOptions } from '../src/config/runtime.js';

test('the one-shot diagnostic constructs one strict external pg.Client even when DATABASE_URL has no sslmode',async()=>{
  let options;
  class CapturingClient {constructor(value){options=value;}}
  const client=createOperatorDatabaseClient({databaseUrl:'postgresql://user:password@render.example/hfn'},{Client:CapturingClient});
  assert.ok(client instanceof CapturingClient);
  assert.deepEqual(options,{connectionString:'postgresql://user:password@render.example/hfn',ssl:{rejectUnauthorized:true}});
  const script=await readFile(new URL('../scripts/workflow-diagnose.mjs',import.meta.url),'utf8');
  assert.match(script,/createOperatorDatabaseClient/);
  assert.match(script,/await client\.connect\(\)/);
  assert.doesNotMatch(script,/new Pool|pool\.query/);
});

test('operator client options match the known-working strict standalone options without sslmode',()=>{
  const databaseUrl='postgresql://user:password@render.example/hfn';
  assert.deepEqual(operatorDatabaseClientOptions({databaseUrl,production:false}),postgresTestClientOptions(databaseUrl));
  assert.deepEqual(operatorDatabaseClientOptions({databaseUrl,production:true}),postgresTestClientOptions(databaseUrl));
});
