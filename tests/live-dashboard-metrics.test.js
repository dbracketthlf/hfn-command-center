import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveDashboard } from '../src/domain/dashboard.js';

test('live dashboard calculates KPI and scoreboards from persisted operational rows only', () => {
  const dashboard = buildLiveDashboard({
    counts:{activeLoans:2,newFiles:1,uwSubmitted:1,clearToClose:0,fundedMtd:1,pastSla:1},
    processorLoans:[{processor:'Susan Vu',currentStage:'UNDERWRITING_SUBMITTED'},{processor:'Elizabeth Martinez',currentStage:'LOAN_SETUP'}],
    processorSlas:[{processor:'Susan Vu',metricKey:'setup',state:'completed'},{processor:'Susan Vu',metricKey:'setup',state:'breached'}],
    funded:[{processor:'Susan Vu'}],
    assistantTasks:[{assistant:'Assistant One',applicableAt:'2026-09-10T17:00:00Z',dueAt:'2026-09-11T17:00:00Z',completedAt:'2026-09-11T16:00:00Z'}],
    attention:[{kind:'assistant-breached',displayLoanId:'LIVE-1',detail:'title ordered'}]
  });
  assert.equal(dashboard.source,'live');
  assert.equal(dashboard.kpis.activeLoans,2);
  assert.equal(dashboard.processors.find(item=>item.name==='Susan Vu').setupSla,undefined);
  assert.equal(dashboard.assistants[0].completionPercent,100);
  assert.equal(JSON.stringify(dashboard).includes('HFN-26091'),false);
});
