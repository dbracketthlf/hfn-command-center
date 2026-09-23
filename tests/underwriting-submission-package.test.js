import test from 'node:test';
import assert from 'node:assert/strict';
import { legitimateSubmissionOutstanding, submissionItemLabel, submissionItemTypeForTask, submissionPackageItemTypes } from '../src/domain/underwriting-submission-package.js';
import { readFile } from 'node:fs/promises';

test('V1 submission package accepts only normalized operational item types',()=>{
  assert.deepEqual(submissionPackageItemTypes,['appraisal','title','insurance','payoff','borrower_conditions']);
  assert.equal(submissionItemTypeForTask('review_title'),'title');
  assert.equal(submissionItemTypeForTask('review_payoff'),'payoff');
  assert.equal(submissionItemTypeForTask('review_unknown'),null);
  assert.equal(submissionItemLabel('borrower_conditions'),'Borrower Conditions');
});

test('submission outstanding list is derived from real open work and never fabricates missing vendor categories',()=>{
  const outstanding=legitimateSubmissionOutstanding([
    {id:'a',taskType:'title_follow_up',state:'waiting',waitingOn:'title_escrow'},
    {id:'b',taskType:'review_title',state:'action_required',waitingOn:'processor_review_issue'},
    {id:'c',taskType:'borrower_conditions_follow_up',state:'waiting',waitingOn:'borrower'},
    {id:'d',taskType:'order_payoff',state:'completed'},
    {id:'e',taskType:'arbitrary_task',state:'action_required'}
  ],[{itemType:'title'}]);
  assert.deepEqual(outstanding,[{itemType:'borrower_conditions',label:'Borrower Conditions',taskType:'borrower_conditions_follow_up',taskId:'c',waitingOn:'borrower'}]);
});

test('submission package persistence is additive, PII-free, immutable, and does not introduce a document store',async()=>{
  const migration=await readFile(new URL('../db/020_underwriting_submission_packages.sql',import.meta.url),'utf8');
  assert.match(migration,/underwriting_submission_packages/);
  assert.match(migration,/underwriting_submission_package_items/);
  assert.match(migration,/unique \(package_id, source_task_id\)/i);
  assert.match(migration,/items are immutable/i);
  assert.doesNotMatch(migration,/document_content|raw_payload|borrower_name|borrower_email|street|ssn|dob/i);
});
