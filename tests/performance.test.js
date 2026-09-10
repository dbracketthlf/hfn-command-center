import test from 'node:test'; import assert from 'node:assert/strict';
import { performanceScore, rankAssistants } from '../src/domain/performance.js'; import { assistantWeights } from '../src/domain/rules.js';
test('performance is normalized and not increased by raw task volume', () => assert.equal(performanceScore({completion:.8,sla:.9,turnaround:.8,backlog:.9},assistantWeights),84));
test('leaderboard ranks assistants by normalized score', () => { const ranks=rankAssistants([{name:'Sophia',metrics:{completion:.7,sla:.7,turnaround:.8,backlog:.8}},{name:'Joshua',metrics:{completion:.9,sla:.9,turnaround:.9,backlog:.9}}],assistantWeights); assert.deepEqual(ranks.map(x=>x.name),['Joshua','Sophia']); assert.deepEqual(ranks.map(x=>x.rank),[1,2]); });
