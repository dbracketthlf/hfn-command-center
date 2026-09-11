import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('processor assistant repair migration uses only the newest redacted team-role snapshot', async () => {
  const migration = await readFile(new URL('../db/004_repair_processor_assistant_role.sql', import.meta.url), 'utf8');
  assert.match(migration, /AssistantProcessor/);
  assert.match(migration, /distinct on \(ie\.payload->>'ariveSystemGuid'\)/);
  assert.match(migration, /jsonb_typeof\(ie\.payload->'loanTeamRoles'\) = 'array'/);
  assert.doesNotMatch(migration, /borrower/i);
});
