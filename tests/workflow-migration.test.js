import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('workflow task migration is additive, borrower-safe, and retains task history',async()=>{const [sql,repository]=await Promise.all([readFile(new URL('../db/012_workflow_task_engine.sql',import.meta.url),'utf8'),readFile(new URL('../src/storage/postgres-arive.js',import.meta.url),'utf8')]);assert.match(sql,/create table workflow_tasks/i);assert.match(sql,/create table workflow_task_history/i);assert.match(sql,/create table workflow_task_checklist_items/i);assert.match(sql,/kpi_eligible boolean/i);assert.doesNotMatch(sql,/alter table assistant_tasks|borrower|email_address|street_address|income|assets|liabilities/i);assert.match(repository,/012_workflow_task_engine/);assert.match(repository,/syncWorkflowForEvent/);});
