import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

test('checklist controls are explicit buttons, toggle state, and prevent a premature generic completion',async()=>{const script=await readFile(new URL('../public/my-work.js',import.meta.url),'utf8');assert.match(script,/type="button" class="checklist-toggle"/);assert.match(script,/completed\?'action_required':'completed'/);assert.match(script,/notApplicable\?'action_required':'not_applicable'/);assert.match(script,/wireChecklistControls\(drawer\)/);assert.match(script,/Complete the checklist to finish this task/);assert.match(script,/Ready for Re-Submittal \(Completes Task\)/);assert.match(script,/Record Follow-Up keeps this task waiting/);});

test('My Work client parses before it starts the initial queue load and replaces loading on a request failure',async()=>{const file=new URL('../public/my-work.js',import.meta.url),script=await readFile(file,'utf8'),result=spawnSync(process.execPath,['--check',fileURLToPath(file)],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(script,/try\{const response=await fetch\(`\/api\/my-work/);assert.match(script,/Unable to load secure work queue\./);});

test('Block Task uses a native required modal with the approved stored category mappings',async()=>{const [html,script,styles]=await Promise.all([readFile(new URL('../public/my-work.html',import.meta.url),'utf8'),readFile(new URL('../public/my-work.js',import.meta.url),'utf8'),readFile(new URL('../public/my-work-block.css',import.meta.url),'utf8')]);assert.match(html,/id="block-task-dialog"/);assert.match(html,/Use Block only when something is preventing you/);for(const [label,value] of [['Borrower','borrower'],['Vendor \/ Third Party','vendor'],['Lender \/ Underwriting','lender'],['ARIVE \/ System','ARIVE\/system'],['Internal HFN','internal'],['Other','other']])assert.match(html,new RegExp(`<option value="${value}">${label}<\\/option>`));assert.match(html,/id="blocked-category" required/);assert.match(html,/id="blocked-note" maxlength="500" required/);assert.match(html,/Do not enter sensitive borrower information/);assert.match(script,/openBlockTask/);assert.match(script,/UNBLOCK \/ RESUME/);assert.match(script,/Resume this task\?/);assert.doesNotMatch(script,/window\.prompt\(/);assert.match(styles,/\.blocked-details/);});

test('blocked task presentation keeps the stored reason private to My Work and labels it safely',async()=>{const script=await readFile(new URL('../public/my-work.js',import.meta.url),'utf8');assert.match(script,/Category: \$\{safe\(blockerLabel\(item\.blockedCategory\)\)\}/);assert.match(script,/Reason: \$\{safe\(item\.blockedReason\|\|'Reason unavailable'\)\}/);assert.match(script,/ARIVE\/system/);});
