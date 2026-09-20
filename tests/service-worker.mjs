import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const handlers=new Map(),added=[],deleted=[],stored=[];
let skipped=0,failAsset=false,responseOk=true;
const sandbox={URL,Promise,self:{location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:()=>{skipped+=1;},clients:{claim:async()=>{}}},caches:{
  open:async()=>({add:async path=>{if(failAsset&&path==='./js/app.js')throw Error('Missing asset');added.push(path);},put:async request=>stored.push(request.url)}),
  keys:async()=>['ascend-v0.3.20','ascend-v0.4.0','another-app-cache'],
  delete:async name=>deleted.push(name),match:async()=>({cached:true})
},fetch:async()=>({ok:responseOk,clone:()=>({})})};
vm.runInNewContext(await readFile(new URL('../service-worker.js',import.meta.url),'utf8'),sandbox);
async function event(name,props={}){
  const promises=[];
  handlers.get(name)({...props,waitUntil:p=>promises.push(p),respondWith:p=>promises.push(p)});
  // waitUntil may be called while respondWith's fetch promise resolves.
  for(let i=0;i<promises.length;i++) await promises[i];
}
await event('install');
assert.ok(added.includes('./styles/refinements.css'));
assert.equal(skipped,0,'Updates wait for the existing update action');
failAsset=true;
await assert.rejects(event('install'),/Missing asset/);
await event('activate');
assert.deepEqual(deleted,['ascend-v0.3.20'],'Unrelated caches survive');
const request={method:'GET',url:'https://example.test/js/app.js',mode:'cors'};
await event('fetch',{request});
assert.equal(stored.length,1);
responseOk=false;
await event('fetch',{request});
assert.equal(stored.length,1,'404 responses cannot replace cached modules');
await event('message',{data:{type:'SKIP_WAITING'}});
assert.equal(skipped,1);
console.log('Service worker tests passed: complete install, update control, cache isolation, HTTP errors.');
