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
