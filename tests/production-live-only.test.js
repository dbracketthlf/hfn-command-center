import test from 'node:test';
import assert from 'node:assert/strict';
import { createHfnServer } from '../server.mjs';
import { createAriveStore } from '../src/integrations/arive.js';
import { buildLiveDashboard } from '../src/domain/dashboard.js';

async function withServer(run){const server=createHfnServer({store:createAriveStore(),environment:'production',webhookSecret:'secret'});await new Promise(resolve=>server.listen(0,resolve));try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}}
test('production never falls back to demo File Detail data or synthetic homepage rendering',async()=>withServer(async base=>{const loans=await (await fetch(base+'/api/loans')).json();const html=await (await fetch(base+'/')).text();assert.equal(loans.source,'live');assert.deepEqual(loans.loans,[]);assert.equal(JSON.stringify(loans).includes('HFN-2609'),false);assert.match(html,/HFN_PRODUCTION=true/);}));
test('insufficient live assistant history returns collecting data rather than a synthetic score',()=>{const dashboard=buildLiveDashboard({counts:{activeLoans:1,newFiles:0,uwSubmitted:0,clearToClose:0,fundedMtd:0,pastSla:0},processorLoans:[],processorSlas:[],funded:[],assistantTasks:[{assistant:'Live Assistant',applicableAt:'2026-09-10T17:00:00Z',dueAt:'2026-09-11T17:00:00Z',completedAt:null}],attention:[]});assert.equal(dashboard.assistants[0].score,'Collecting data');assert.equal(dashboard.assistants[0].slaCompliancePercent,null);assert.equal(JSON.stringify(dashboard).includes('HFN-2609'),false);});
