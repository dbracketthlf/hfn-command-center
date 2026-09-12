import test from 'node:test';
import assert from 'node:assert/strict';
import { createHfnServer } from '../server.mjs';

test('dashboard failure stays private to the client and logs safe route diagnostics',async()=>{const original=console.error,logs=[];console.error=value=>logs.push(value);const server=createHfnServer({environment:'production',webhookSecret:'secret',store:{dashboard:async()=>{throw new Error('monthly funding query failed');}}});await new Promise(resolve=>server.listen(0,resolve));try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/dashboard`),body=await response.json();assert.equal(response.status,500);assert.deepEqual(body,{ok:false,error:'Internal error'});assert.match(logs[0],/api\/dashboard/);assert.match(logs[0],/monthly funding query failed/);}finally{console.error=original;await new Promise(resolve=>server.close(resolve));}});
