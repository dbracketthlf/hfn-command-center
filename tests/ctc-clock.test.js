import test from 'node:test';
import assert from 'node:assert/strict';
import { ctcClock, summarizeCtcClocks } from '../src/domain/ctc-clock.js';

test('CTC clock uses only a persisted UW Submitted timestamp and calendar-day bands',()=>{
  const uw='2026-09-01T18:00:00.000Z';
  assert.equal(ctcClock({uwSubmittedAt:uw,now:'2026-09-15T18:00:00.000Z'}).status,'ON_TRACK');
  assert.equal(ctcClock({uwSubmittedAt:uw,now:'2026-09-16T18:00:00.000Z'}).status,'AT_RISK');
  const critical=ctcClock({uwSubmittedAt:uw,now:'2026-09-21T18:00:00.000Z'});
  assert.equal(critical.status,'CRITICAL');assert.equal(critical.elapsedCalendarDays,20);assert.equal(critical.targetCtcDate,'2026-09-21');
  assert.equal(ctcClock({clearToCloseAt:'2026-09-21T18:00:00.000Z'}).status,'TIMING_UNAVAILABLE');
});

test('CTC completion is measured as calendar days in Pacific time',()=>{
  const uw='2026-10-30T23:30:00.000Z';
  const met=ctcClock({uwSubmittedAt:uw,clearToCloseAt:'2026-11-19T17:00:00.000Z'});
  const missed=ctcClock({uwSubmittedAt:uw,clearToCloseAt:'2026-11-20T18:00:00.000Z'});
  assert.deepEqual({status:met.status,days:met.elapsedCalendarDays},{status:'GOAL_MET',days:20});
  assert.deepEqual({status:missed.status,days:missed.elapsedCalendarDays},{status:'GOAL_MISSED',days:21});
});

test('management CTC metrics exclude unknown timing and show unavailable completed metrics without observations',()=>{
  const none=summarizeCtcClocks([{clearToCloseAt:'2026-09-10T18:00:00Z'}],{now:'2026-09-15T18:00:00Z'});
  assert.equal(none.activeUwToCtc,0);assert.equal(none.averageCompletedDurationDays,null);assert.equal(none.hitRate,null);
  const summary=summarizeCtcClocks([
    {uwSubmittedAt:'2026-09-01T18:00:00Z'},
    {uwSubmittedAt:'2026-09-01T18:00:00Z',clearToCloseAt:'2026-09-11T18:00:00Z'},
    {uwSubmittedAt:'2026-09-01T18:00:00Z',clearToCloseAt:'2026-09-23T18:00:00Z'}
  ],{now:'2026-09-16T18:00:00Z'});
  assert.equal(summary.activeUwToCtc,1);assert.equal(summary.atRisk,1);assert.equal(summary.averageCompletedDurationDays,16);assert.deepEqual(summary.hitRate,{numerator:1,denominator:2,percentage:50});
});
