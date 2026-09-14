import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('My Work renders a compact loan-first Kanban and preserves human-readable urgency',async()=>{
  const [script,html,styles]=await Promise.all([
    readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),
    readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),
    readFile(new URL('../public/my-work-kanban.css',import.meta.url),'utf8')
  ]);
  assert.match(script,/buildLoanKanban/);
  assert.match(script,/kanban-loan-card/);
  assert.match(script,/loan-detail/);
  assert.match(script,/Action Needed/);
  assert.match(script,/Next follow-up/);
  assert.match(script,/Processor/);
  assert.match(script,/Assistant/);
  assert.match(script,/my-work-kanban\.css/);
  assert.match(styles,/\.kanban-board/);
  assert.match(styles,/\.task-state/);
  assert.match(styles,/@media\(max-width:1180px\)/);
});

test('My Work modal uses associated labels and preserves grouped task rendering',async()=>{
  const [html,script,formStyles]=await Promise.all([readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../public/my-work-form.css',import.meta.url),'utf8')]);
  for(const field of ['manual-loan','manual-title','manual-assignee','manual-priority','manual-due','manual-note'])assert.match(html,new RegExp(`label for="${field}"`));
  assert.match(html,/form-row/);assert.match(html,/my-work-form\.css/);assert.match(formStyles,/grid-template-columns:1\.4fr \.8fr/);assert.match(formStyles,/@media\(max-width:520px\)/);
  assert.match(script,/buildLoanKanban\(data\.tasks\)/);assert.match(script,/drawer-tasks/);assert.match(script,/<small class="manual-badge">MANUAL<\/small>/);assert.match(script,/data-cancel-manual/);
});

test('conditions workflow uses explicit processor actions without changing My Work grouping',async()=>{const script=await readFile(new URL('../public/my-work.js',import.meta.url),'utf8');assert.match(script,/Review Complete/);assert.match(script,/Record Follow-Up/);assert.match(script,/Ready for Re-Submittal/);assert.match(script,/review_complete/);assert.match(script,/ready_for_resubmittal/);});
