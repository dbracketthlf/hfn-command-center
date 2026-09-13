import test from 'node:test';
import assert from 'node:assert/strict';
import { followUpCadence, followUpForInitialTask } from '../src/domain/third-party-follow-ups.js';
import { nextFollowUpAt } from '../src/domain/workflow-engine.js';

const calendar={businessStart:{hour:8,minute:30},businessEnd:{hour:17,minute:0},workdays:[1,2,3,4,5],holidays:['2026-09-14']};
test('third-party initial tasks have separate persistent follow-up definitions',()=>{
  assert.deepEqual(Object.entries({order_appraisal:'appraisal_follow_up',order_title_escrow:'title_follow_up',request_insurance_eoi:'insurance_follow_up',order_payoff:'payoff_follow_up'}).map(([initial,successor])=>followUpForInitialTask(initial).taskType),['appraisal_follow_up','title_follow_up','insurance_follow_up','payoff_follow_up']);
});
test('title and payoff use three business-day recurring follow-ups',()=>{
  assert.equal(nextFollowUpAt('2026-09-11T23:00:00.000Z',followUpCadence({task_type:'title_follow_up'}),calendar),'2026-09-17T23:00:00.000Z');
  assert.equal(followUpCadence({task_type:'payoff_follow_up'},{afterFollowUp:true}),3);
});
test('insurance uses three business days initially and two after a recorded follow-up',()=>{
  assert.equal(followUpCadence({task_type:'insurance_follow_up'}),3);
  assert.equal(followUpCadence({task_type:'insurance_follow_up'},{afterFollowUp:true}),2);
});
test('appraisal supports payment then scheduling/completion cadence phases',()=>{
  assert.equal(followUpCadence({task_type:'appraisal_follow_up'}),1);
  assert.equal(followUpCadence({task_type:'appraisal_follow_up'},{phase:'paid_waiting_scheduling'}),2);
  assert.equal(followUpCadence({task_type:'appraisal_follow_up'},{phase:'scheduled_waiting_completion'}),2);
});
