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

test('tracker date aliases are preserved in the redacted operational snapshot',()=>{const normalized=normalizeArivePayload({ariveLoanId:'loan-1',hoiStatus:'ORDERED',hoiDate:'2026-09-13',titleStatus:'ORDERED',titleDate:'2026-09-12',appraisalStatus:'ORDERED',appraisalDate:'2026-09-11'});assert.equal(normalized.trackerContext.hoiTrackerDate,'2026-09-13');assert.equal(normalized.trackerContext.titleTrackerDate,'2026-09-12');assert.equal(normalized.trackerContext.appraisalTrackerDate,'2026-09-11');});

test('private My Work CTC clock and lender display are operational-only',async()=>{const [script,repository]=await Promise.all([readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8')]);assert.match(script,/UW → CTC Clock/);assert.match(script,/lenderInvestorName/);assert.match(repository,/ctcPerformanceSummary/);assert.match(repository,/l\.operational_snapshot->>'lenderInvestorName'/);});

test('private My Work UI includes authorized manual-task controls without public borrower rendering',async()=>{
  const [html,script,server]=await Promise.all([readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../server.mjs',import.meta.url),'utf8')]);
  assert.match(html,/\+ Add Task/);assert.match(html,/manual-task-dialog/);assert.match(script,/manual_operational_task_/);assert.match(script,/MANUAL/);assert.match(script,/borrowerName/);assert.match(server,/manual-options/);assert.match(server,/manual-tasks/);
});
