import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('My Work groups safe tasks into loan cards with human-readable state badges',async()=>{
  const [script,html,styles]=await Promise.all([
    readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),
    readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),
    readFile(new URL('../public/my-work.css',import.meta.url),'utf8')
  ]);
  assert.match(script,/groupTasksByLoan/);
  assert.match(script,/loan-group-card/);
  assert.match(script,/Action Required/);
  assert.match(script,/Next follow-up/);
  assert.match(script,/Processor/);
  assert.match(script,/Assistant/);
  assert.match(html,/my-work\.css/);
  assert.match(styles,/\.loan-group-card/);
  assert.match(styles,/\.task-state/);
  assert.match(styles,/@media\(max-width:700px\)/);
});

test('My Work modal uses associated labels and preserves grouped task rendering',async()=>{
  const [html,script,formStyles]=await Promise.all([readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../public/my-work-form.css',import.meta.url),'utf8')]);
  for(const field of ['manual-loan','manual-title','manual-assignee','manual-priority','manual-due','manual-note'])assert.match(html,new RegExp(`label for="${field}"`));
  assert.match(html,/form-row/);assert.match(html,/my-work-form\.css/);assert.match(formStyles,/grid-template-columns:1\.4fr \.8fr/);assert.match(formStyles,/@media\(max-width:520px\)/);
  assert.match(script,/groupTasksByLoan\(data\.tasks\)/);assert.match(script,/new Map\(\)/);assert.match(script,/tasks\.sort\(taskOrder\)/);assert.match(script,/sort\(\(a,b\)=>taskOrder\(a\[0\],b\[0\]\)\)/);assert.match(script,/loan-header-right/);assert.match(script,/<small class="manual-badge">MANUAL<\/small>/);assert.match(script,/data-cancel-manual/);
});
