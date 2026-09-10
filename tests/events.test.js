import test from 'node:test'; import assert from 'node:assert/strict';
import { emptyIntegrationState, ingestEvent } from '../src/domain/events.js';
const approved = { loanId:'loan-1', type:'APPROVED_WITH_CONDITION', occurredAt:'2026-09-14T10:00:00-07:00', receivedAt:'2026-09-14T10:01:00-07:00', source:'zapier', sourceEventId:'evt-1', metadata:{assistantId:'joshua'} };
test('duplicate event does not create a duplicate milestone', () => { const first=ingestEvent(emptyIntegrationState(),approved); const second=ingestEvent(first.state,approved); assert.equal(second.outcome,'duplicate'); assert.equal(second.state.events.length,1); });
test('duplicate approved event does not create duplicate assistant tasks', () => { const first=ingestEvent(emptyIntegrationState(),approved); const duplicate=ingestEvent(first.state,approved); assert.equal(first.tasksCreated,4); assert.equal(duplicate.state.tasks.length,4); });
test('malformed webhook is auditable rather than discarded', () => { const result=ingestEvent(emptyIntegrationState(),{source:'zapier'}); assert.equal(result.outcome,'failed'); assert.equal(result.state.failed.length,1); });
