import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Integration Health is removed from the public dashboard and rendered in the Admin Command Center',async()=>{
  const [dashboard,app,admin]=await Promise.all([
    readFile(new URL('../public/index.html',import.meta.url),'utf8'),
    readFile(new URL('../public/app.js',import.meta.url),'utf8'),
    readFile(new URL('../public/admin-command-center.js',import.meta.url),'utf8')
  ]);
  assert.doesNotMatch(dashboard,/Integration health/i);
  assert.doesNotMatch(dashboard,/MORNING COMMAND BRIEF/);
  assert.doesNotMatch(app,/refreshIntegrationHealth|integration-state|event-log/);
  assert.match(admin,/SYSTEM &amp; INTEGRATION HEALTH/);
  assert.match(admin,/integrationHealthSection\(data\.integrationHealth\)/);
  assert.match(admin,/MORNING COMMAND BRIEF/);
  assert.match(admin,/morningCommandBrief\(data\.morningBrief\)/);
  assert.match(admin,/MONTH-END CLOSING OUTLOOK/);
  assert.match(admin,/closingOutlookSection\(data\.closingOutlook\)/);
  assert.match(admin,/WHERE THE PIPELINE IS WAITING/);
  assert.match(admin,/pipelineWaitingSection\(data\.pipelineWaiting\)/);
  assert.doesNotMatch(dashboard,/WHERE THE PIPELINE IS WAITING/);
});
