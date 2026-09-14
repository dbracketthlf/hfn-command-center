import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOperationalSnapshot } from '../src/domain/operational-snapshot.js';
import { reconciliationEvidence } from '../src/domain/workflow-reconciliation.js';

test('safe operational snapshots retain title, appraisal, and HOI evidence across omitted partial events',()=>{
  const first=mergeOperationalSnapshot({}, {milestoneDates:{titleOrderedDate:'2026-09-10',titleReceivedDate:'2026-09-11',appraisalOrderedDate:'2026-09-09',appraisalReceivedDate:'2026-09-12',hoiOrderedDate:'2026-09-10',hoiReceivedDate:'2026-09-13'},trackerContext:{titleStatus:'RECEIVED',titleTrackerDate:'2026-09-11',appraisalStatus:'RECEIVED',appraisalTrackerDate:'2026-09-12',hoiStatus:'RECEIVED',hoiTrackerDate:'2026-09-13'}});
  const merged=mergeOperationalSnapshot(first,{milestoneDates:{},trackerContext:{}});
  assert.deepEqual(merged,first);
  assert.equal(reconciliationEvidence(merged.milestoneDates,merged.trackerContext).find(item=>item.taskType==='title_follow_up').completedAt,'2026-09-11');
});
test('new non-null safe operational values replace an older value without accepting arbitrary fields',()=>{
  const merged=mergeOperationalSnapshot({milestoneDates:{titleReceivedDate:'2026-09-11'},trackerContext:{titleStatus:'ORDERED',privateNote:'no'}},{milestoneDates:{titleReceivedDate:'2026-09-12',borrowerEmail:'not-allowed'},trackerContext:{titleStatus:'RECEIVED',rawPayload:'not-allowed'}});
  assert.deepEqual(merged,{milestoneDates:{titleReceivedDate:'2026-09-12'},trackerContext:{titleStatus:'RECEIVED'}});
});
test('safe lender/investor data is retained across partial operational snapshots',()=>{
  const first=mergeOperationalSnapshot({}, {lenderInvestorName:'HFN Approved Lender'});
  assert.equal(mergeOperationalSnapshot(first,{milestoneDates:{},trackerContext:{}}).lenderInvestorName,'HFN Approved Lender');
  assert.equal(mergeOperationalSnapshot(first,{lenderInvestorName:'Updated Approved Lender'}).lenderInvestorName,'Updated Approved Lender');
});
