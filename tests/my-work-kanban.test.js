import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoanKanban, kanbanColumnFor } from '../public/my-work-kanban.js';

const now=new Date('2026-09-15T20:00:00.000Z');
const task=(id,displayLoanId,priority,overrides={})=>({id,displayLoanId,title:'Safe operational task',state:priority,priority,currentStage:'UNDERWRITING_SUBMITTED',dueAt:'2026-09-16T20:00:00.000Z',...overrides});

test('Kanban renders one loan card even when a loan has multiple open tasks',()=>{const board=buildLoanKanban([task('a','17512793','waiting'),task('b','17512793','action_required'),task('c','17512794','waiting')],{now});assert.equal(board.loans.length,2);assert.equal(board.columns.action_needed.length,1);assert.equal(board.columns.action_needed[0].tasks.length,2);});
test('most urgent task determines the loan column with Past Due above all other urgency',()=>{const board=buildLoanKanban([task('waiting','1','waiting'),task('follow','1','follow_up_due'),task('action','1','action_required'),task('past','1','past_due')],{now});assert.equal(board.loans[0].column,'past_due');assert.equal(board.loans[0].urgentTask.id,'past');assert.equal(kanbanColumnFor(task('late','2','waiting',{dueAt:'2026-09-14T20:00:00.000Z'}),{now}),'past_due');});
test('Action Needed beats Follow-Up and Waiting, and Follow-Up beats Waiting',()=>{const board=buildLoanKanban([task('action','1','action_required'),task('follow','2','follow_up_due'),task('waiting','3','waiting')],{now});assert.deepEqual(board.loans.map(loan=>loan.column),['action_needed','follow_up','waiting']);});
test('column counts are loan counts, with task detail retained for drawer rendering',()=>{const board=buildLoanKanban([task('one','1','follow_up_due'),task('two','1','waiting'),task('three','2','follow_up_due'),task('four','3','waiting')],{now});assert.equal(board.columns.follow_up.length,2);assert.equal(board.columns.waiting.length,1);assert.equal(board.columns.follow_up[0].tasks.length,2);});
