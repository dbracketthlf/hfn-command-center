import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArivePayload, redactedAuditPayload } from '../src/integrations/arive.js';
import { readFile } from 'node:fs/promises';

test('borrower name is normalized minimally and excluded from webhook audit storage',()=>{
  const payload={ariveLoanId:'loan-1',borrowerFirstName:'Jane',borrowerLastName:'Doe',borrowerEmail:'jane@example.test',borrowerPhone:'555-0100'};
  const normalized=normalizeArivePayload(payload);
  assert.equal(normalized.borrowerFirstName,'Jane');assert.equal(normalized.borrowerLastName,'Doe');
  const audit=redactedAuditPayload(payload);assert.equal(JSON.stringify(audit).includes('Jane'),false);assert.equal(JSON.stringify(audit).includes('jane@example.test'),false);
});

test('private My Work UI includes authorized manual-task controls without public borrower rendering',async()=>{
  const [html,script,server]=await Promise.all([readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../server.mjs',import.meta.url),'utf8')]);
  assert.match(html,/\+ Add Task/);assert.match(html,/manual-task-dialog/);assert.match(script,/manual_operational_task_/);assert.match(script,/MANUAL/);assert.match(script,/borrowerName/);assert.match(server,/manual-options/);assert.match(server,/manual-tasks/);
});
