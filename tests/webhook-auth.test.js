import test from 'node:test'; import assert from 'node:assert/strict';
import { createHfnServer } from '../server.mjs'; import { createAriveStore } from '../src/integrations/arive.js';
const payload={ariveLoanId:'persist-guid',currentLoanStatus_status:'UNDERWRITING_SUBMITTED',currentLoanStatus_date:'2026-09-14T10:00:00-07:00'};
async function withServer(run){const store=createAriveStore(),server=createHfnServer({store,environment:'production',webhookSecret:'unit-secret'});await new Promise(r=>server.listen(0,r));try{await run(`http://127.0.0.1:${server.address().port}`,store);}finally{await new Promise(r=>server.close(r));}}
const send=(base,headers={})=>fetch(base+'/api/integrations/arive/events',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
test('unauthorized webhook is rejected before audit/processing',async()=>withServer(async(base,store)=>{assert.equal((await send(base)).status,401);assert.equal(store.audits.length,0);}));
test('authorized bearer webhook is accepted',async()=>withServer(async base=>{const response=await send(base,{Authorization:'Bearer unit-secret'});assert.equal(response.status,200);assert.equal((await response.json()).tasksCreated,8);}));
test('duplicate authorized delivery is idempotent',async()=>withServer(async(base,store)=>{await send(base,{'X-HFN-Webhook-Secret':'unit-secret'});const response=await send(base,{'X-HFN-Webhook-Secret':'unit-secret'});assert.equal((await response.json()).outcome,'duplicate');assert.equal(store.integration.tasks.length,8);}));
