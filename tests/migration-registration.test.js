import test from 'node:test';import assert from 'node:assert/strict';import { readFile } from 'node:fs/promises';
test('normal migration command registers historical funding migration',async()=>{const source=await readFile(new URL('../scripts/migrate.mjs',import.meta.url),'utf8');assert.match(source,/010_historical_funding_corrections/);assert.match(source,/schema_migrations/);});
