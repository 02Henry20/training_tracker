import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.__storeTest={callbacks:[],writes:[],serverDocs:[],serverSettings:null,readGate:null};
const firebase=`export const db={};
export const collection=(...args)=>args,doc=(...args)=>args;
export const serverTimestamp=()=>null;
export const onSnapshot=(ref,options,callback)=>{globalThis.__storeTest.callbacks.push({ref,callback});return ()=>{};};
export const getDocsFromCache=async()=>({docs:[]});
export const getDocsFromServer=async ref=>{await globalThis.__storeTest.readGate;return {docs:ref.at(-1)==='workouts'?globalThis.__storeTest.serverDocs:[]};},getDocs=getDocsFromServer;
export const getDocFromCache=async()=>({exists:()=>false});
export const getDocFromServer=async()=>{await globalThis.__storeTest.readGate;return globalThis.__storeTest.serverSettings??{exists:()=>false};};
export const setDoc=async(ref,data)=>{globalThis.__storeTest.writes.push(data)},deleteDoc=async()=>{};
export const writeBatch=()=>({set(){},delete(){},commit:async()=>{}});`;
const uri=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const source=(await readFile(new URL('../js/store.js',import.meta.url),'utf8')).replace('"./firebase.js"',JSON.stringify(uri(firebase)));
const store=await import(uri(source));
store.connectOfflineUserData({uid:'test',email:'test@example.test'});
await assert.rejects(store.importState({format:'training-track-backup',workouts:{}}),/must be lists/);
await assert.rejects(store.importState({format:'training-track-backup',workouts:[{date:'2026-02-31',exercises:[]}]}),/invalid workout/);
await assert.rejects(store.importState({format:'training-track-backup',workouts:[{date:'2026-02-01',exercises:[null]}]}),/invalid exercise/);
await assert.rejects(store.importState({format:'training-track-backup',workouts:[{date:'2026-02-01',exercises:[{exerciseId:'running',activity:{durationMin:Infinity}}]}]}),/invalid training/);
await store.saveSettings({bodyWeightKg:80,motion:'subtle'});
assert.equal(store.state.settings.motion,'subtle');
await store.saveWorkout({id:'one',date:'2026-09-19',createdAtMs:100,bodyWeightKg:80,exercises:[{exerciseId:'seated-cable-row',restSeconds:0,durationMin:10,repSeconds:4,trackCompletion:true,sets:[{weightKg:30,reps:10,completed:false}]}]});
let saved=store.state.workouts[0];
assert.equal(saved.bodyWeightKg,80);
assert.equal(saved.exercises[0].restSeconds,0);
assert.equal(saved.exercises[0].durationMin,10);
assert.equal(saved.exercises[0].repSeconds,4);
assert.equal(saved.exercises[0].trackCompletion,true);
assert.equal(saved.exercises[0].sets[0].completed,false);
await store.saveWorkout({...saved,createdAtMs:undefined,title:'Edited'});
assert.equal(store.state.workouts[0].createdAtMs,100);
assert.equal(store.exportState().workouts[0].bodyWeightKg,80);
store.connectUserData({uid:'test'});
for (const {ref,callback} of globalThis.__storeTest.callbacks) {
  callback({docs:[],exists:()=>false,metadata:{fromCache:false,hasPendingWrites:false}});
}
assert.equal(JSON.parse(memory.get('ascend:user-data:test')).workouts.length,1,'Cloud snapshots cannot erase pending offline records');
const summary=await store.getSyncSummary();
assert.equal(summary.local.workouts,1);
assert.equal(summary.cloud.workouts,0);
assert.equal(summary.differs,true);
await store.resolveSyncChoice('cloud');
assert.equal(store.state.settings.bodyWeightKg,72,'Missing cloud settings reset defaults');
assert.equal(JSON.parse(memory.get('ascend:user-data:test')).workouts.length,0);
await store.importState({format:'training-track-backup',workouts:[{id:'imported',date:'2026-01-01',createdAtMs:123,exercises:[]}]});
// Import uses a batch; verify payload behavior separately via saveWorkout.
await store.saveWorkout({id:'snapshot',date:'2026-09-19',bodyWeightKg:80,exercises:[]});
assert.equal(globalThis.__storeTest.writes.at(-1).bodyWeightKg,80);
store.disconnectUserData();

const docFor=data=>({id:data.id,data:()=>data,exists:()=>true,metadata:{fromCache:false,hasPendingWrites:false}});
const emit=(name,fromCache=true,docs=[])=>{
  const listener=globalThis.__storeTest.callbacks.findLast(({ref})=>ref.at(-1)===name);
  listener.callback({docs,exists:()=>false,metadata:{fromCache,hasPendingWrites:false}});
};
const backup={format:'training-track-backup',workouts:[{date:'2026-01-01',exercises:[]},{date:'2026-01-02',exercises:[]}],customExercises:[{name:'One'},{name:'Two'}]};
store.connectOfflineUserData({uid:'import-test'});
await store.importState(backup);
assert.equal(store.state.workouts.length,2,'ID-less workout imports remain distinct');
assert.equal(new Set(store.state.workouts.map(w=>w.id)).size,2);
assert.equal(new Set(store.state.customExercises.map(e=>e.id)).size,2);
await store.saveWorkout({...store.state.workouts[0],title:'Edited import'});
assert.equal(store.state.workouts.length,2,'Editing one imported record preserves the other');
await assert.rejects(store.importState({format:'training-track-backup',workouts:[{date:'2026-01-01',durationMin:Infinity,exercises:[]}]}),/invalid training/);
await assert.rejects(store.importState({format:'training-track-backup',workouts:[{id:'nested/path',date:'2026-01-01',exercises:[]}]}),/invalid record ID/);
await store.saveSettings({bodyWeightKg:Infinity,heightCm:-1,statsWindowDays:Infinity,bodyWindowDays:-7,weeklySessionTarget:0});
assert.equal(store.state.settings.bodyWeightKg,store.DEFAULT_SETTINGS.bodyWeightKg);
assert.equal(store.state.settings.statsWindowDays,28);
assert.equal(store.state.settings.weeklySessionTarget,3);

// A live cached login must not wipe its local mirror before hydration finishes.
const recovery={id:'recovery',date:'2026-01-01',title:'Local',updatedAtMs:1,exercises:[]};
memory.set('ascend:user-data:cache-test',JSON.stringify({workouts:[recovery],pendingLocal:false}));
store.connectUserData({uid:'cache-test'});
emit('workouts');
assert.equal(store.state.workouts.length,1,'Empty cache does not hide the device history');
assert.equal(JSON.parse(memory.get('ascend:user-data:cache-test')).workouts.length,1);
emit('customExercises');emit('preferences');
assert.equal(JSON.parse(memory.get('ascend:user-data:cache-test')).workouts.length,1);
await store.saveWorkout({...recovery,title:'Queued'});
assert.equal(JSON.parse(memory.get('ascend:user-data:cache-test')).pendingLocal,true,'Online writes retain recovery status until acknowledged');
store.connectUserData({uid:'cache-test'});
emit('workouts',false);emit('customExercises',false);emit('preferences',false);
await store.saveWorkout({id:'second',date:'2026-01-02',exercises:[]});
assert.deepEqual(JSON.parse(memory.get('ascend:user-data:cache-test')).workouts.map(w=>w.id).sort(),['recovery','second'],'Edits during sync resolution are persisted with protected records');
await store.resolveSyncChoice('device');
assert.equal(JSON.parse(memory.get('ascend:user-data:cache-test')).pendingLocal,false,'Acknowledged sync clears the recovery flag');

memory.set('ascend:user-data:early-cloud',JSON.stringify({workouts:[recovery],pendingLocal:true}));
store.connectUserData({uid:'early-cloud'});
await store.resolveSyncChoice('cloud');
assert.equal(JSON.parse(memory.get('ascend:user-data:early-cloud')).workouts.length,0,'Explicit cloud fetch persists before initial listeners finish');

// Compare contents, rather than only dates and update metadata.
memory.set('ascend:user-data:compare-test',JSON.stringify({workouts:[recovery],pendingLocal:true}));
store.connectUserData({uid:'compare-test'});
globalThis.__storeTest.serverDocs=[docFor({...recovery,title:'Different'})];
assert.equal((await store.getSyncSummary()).differs,true,'Changed payload with matching timestamps is a conflict');
globalThis.__storeTest.serverDocs=[docFor({...recovery,updatedAtMs:999})];
assert.equal((await store.getSyncSummary()).differs,false,'Timestamp-only acknowledgements are not conflicts');

let release;
globalThis.__storeTest.readGate=new Promise(resolve=>{release=resolve;});
const cloudRead=store.resolveSyncChoice('cloud');
const staleListener=globalThis.__storeTest.callbacks.findLast(({ref})=>ref.at(-1)==='workouts');
store.connectOfflineUserData({uid:'another-user'});
staleListener.callback({docs:[docFor(recovery)],metadata:{fromCache:false,hasPendingWrites:false}});
assert.equal(store.state.workouts.length,0,'Late callbacks from the old account are ignored');
release();
await assert.rejects(cloudRead,/account changed/);
assert.equal(store.state.user.uid,'another-user');
assert.equal(store.state.workouts.length,0,'Late cloud reads cannot hydrate another account');
store.disconnectUserData();
delete globalThis.__storeTest;
console.log('Store regression tests passed: round trips, rest=0, timestamps, motion, offline recovery.');
