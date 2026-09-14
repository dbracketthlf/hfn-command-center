import test from 'node:test';
import assert from 'node:assert/strict';
import { executiveProgress } from '../src/domain/executive-progress.js';

test('executive progress separates Pacific current and previous calendar months using canonical CTC completion',()=>{
  const result=executiveProgress({now:'2026-09-01T01:00:00.000Z',currentFunding:{count:2,volume:1200000},previousFunding:{count:3,volume:1500000},ctcRows:[
    {uwSubmittedAt:'2026-08-10T18:00:00Z',clearToCloseAt:'2026-08-29T18:00:00Z'},
    {uwSubmittedAt:'2026-08-01T18:00:00Z',clearToCloseAt:'2026-08-23T18:00:00Z'},
    {uwSubmittedAt:'2026-08-15T18:00:00Z',clearToCloseAt:'2026-09-01T01:00:00Z'},
    {uwSubmittedAt:null,clearToCloseAt:'2026-08-20T18:00:00Z'}
  ]});
  // 01:00Z is still August in Pacific time, so the prior period is July.
  assert.deepEqual(result.currentPeriod,{year:2026,month:8});assert.deepEqual(result.previousPeriod,{year:2026,month:7});assert.equal(result.currentMonth.fundingVolume,1200000);assert.equal(result.previousMonth.fundingVolume,1500000);assert.equal(result.currentMonth.uwToCtc.eligibleObservations,3);assert.equal(result.currentMonth.uwToCtc.goalHits,2);assert.equal(result.currentMonth.uwToCtc.goalMisses,1);assert.equal(result.previousMonth.uwToCtc.eligibleObservations,0);assert.equal(result.previousMonth.uwToCtc.averageCalendarDays,null);
});

test('executive CTC hit rate treats twenty days as a hit and excludes unknown timing',()=>{
  const result=executiveProgress({now:'2026-09-15T18:00:00Z',currentFunding:{count:1,volume:500000},previousFunding:{count:1,volume:400000},ctcRows:[
    {uwSubmittedAt:'2026-08-15T18:00:00Z',clearToCloseAt:'2026-09-04T18:00:00Z'},
    {uwSubmittedAt:'2026-08-10T18:00:00Z',clearToCloseAt:'2026-09-01T18:00:00Z'},
    {uwSubmittedAt:null,clearToCloseAt:'2026-09-05T18:00:00Z'}
  ]}),ctc=result.currentMonth.uwToCtc;
  assert.equal(ctc.eligibleObservations,2);assert.equal(ctc.goalHits,1);assert.equal(ctc.goalMisses,1);assert.equal(ctc.hitRate,50);
});
