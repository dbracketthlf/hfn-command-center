import test from 'node:test';
import assert from 'node:assert/strict';
import { createHfnServer } from '../server.mjs';

async function withServer(employee,run){
  const calls=[];
  const store={monthlyFundingGoal:async(year,month)=>{calls.push(['get',year,month]);return {year,month};},saveMonthlyFundingGoal:async goal=>{calls.push(['put',goal]);return goal;}};
  const auth={session:async()=>employee};
  const server=createHfnServer({store,auth,environment:'production',webhookSecret:'arive-only-secret'});
  await new Promise(resolve=>server.listen(0,resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`,calls);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('funding-goal GET and PUT require the authenticated Entra Admin role, never the webhook secret',async()=>{
  await withServer(null,async base=>{
    assert.equal((await fetch(`${base}/api/admin/funding-goals`,{headers:{Authorization:'Bearer arive-only-secret'}})).status,401);
    assert.equal((await fetch(`${base}/api/admin/funding-goals`,{method:'PUT',headers:{Authorization:'Bearer arive-only-secret','Content-Type':'application/json'},body:'{}'})).status,401);
  });
  for(const role of ['processor','processor_assistant'])await withServer({email:`${role}@hfn.test`,role},async base=>{
    assert.equal((await fetch(`${base}/api/admin/funding-goals`,{headers:{Authorization:'Bearer arive-only-secret'}})).status,403);
    assert.equal((await fetch(`${base}/api/admin/funding-goals`,{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  });
  await withServer({email:'admin@hfn.test',role:'admin'},async(base,calls)=>{
    assert.equal((await fetch(`${base}/api/admin/funding-goals?year=2026&month=9`)).status,200);
    assert.equal((await fetch(`${base}/api/admin/funding-goals`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:2026,month:9,fundedLoanGoal:30,fundedVolumeGoal:15000000})})).status,200);
    assert.equal(calls.length,2);
  });
});
