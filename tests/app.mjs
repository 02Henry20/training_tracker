// Exercise actual app workflows without Firebase or a browser dependency.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as calculations from '../js/calculations.js';
import * as exercises from '../js/exercises.js';

const nodes=new Map();
const element=()=>({
  value:'',innerHTML:'',textContent:'',hidden:false,dataset:{},style:{},children:[],
  classList:{add(){},remove(){},toggle(){}},
  append(child){this.children.push(child);},replaceChildren(){this.children=[];},
  querySelector:()=>element(),querySelectorAll:()=>[],checkValidity:()=>true
});
const node=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
const state={user:{uid:'one'},workouts:[],customExercises:[],remoteExercises:[],settings:{bodyWeightKg:72,heightCm:171,showDurationPrompt:false}};
let saves=0,releaseSave;
const sandbox={...calculations,...exercises,console,Date,Intl,JSON,Set,Map,Promise,Number,String,Math,
  state,DEFAULT_SETTINGS:{...state.settings},navigator:{onLine:true},
  document:{querySelector:node,querySelectorAll:()=>[],createElement:element,documentElement:{dataset:{}},body:{style:{}}},
  window:{matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout:()=>1,clearTimeout(){},clearInterval(){},requestAnimationFrame(){}},
  saveWorkout:async()=>{saves++;await new Promise(resolve=>{releaseSave=resolve;});}
};
const source=(await readFile(new URL('../js/app.js',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?from "[^"]+";\r?\n/gm,'');
vm.createContext(sandbox);
vm.runInContext(source.slice(0,source.indexOf('setStoreErrorHandler(error =>')),sandbox);
const run=code=>vm.runInContext(code,sandbox);

state.customExercises=[{id:'custom-legacy',name:'Legacy lift',inputType:'sets',muscles:{primary:['quads']}}];
assert.ok(run('catalog().some(exercise => exercise.id === "custom-legacy")'),'Historical custom definitions remain available');

const maliciousId='session"><img src=x onerror=alert(1)>';
const workout={id:maliciousId,date:calculations.localDateString(),title:'Session',exercises:[{exerciseId:'seated-cable-row',sets:[{weightKg:20,reps:10}]}]};
state.workouts=[workout];
const analysis=calculations.analyseWorkout(workout,exercises.BUNDLED_EXERCISES,state.settings);
const list=element();
sandbox.renderSessionList(list,[analysis]);
assert.ok(!list.children[0].innerHTML.includes('<img'),'Backup IDs cannot inject markup into session rows');
sandbox.openWorkoutDetail(maliciousId);
assert.ok(!node('#detail-content').innerHTML.includes('<img'),'Backup IDs cannot inject markup into detail actions');

// Account transitions clear drafts, timers, and pending confirmations.
run('handleStateChange(); draftWorkout.exercises = [{ exerciseId: "running" }]; draftWorkout.startedAtMs = Date.now();');
const confirm=run('askConfirmation("Delete?", "Confirm")');
state.user={uid:'two'};
run('handleStateChange()');
assert.equal(await confirm,false);
assert.equal(run('draftWorkout.exercises.length'),0);
assert.equal(run('draftWorkout.startedAtMs'),null);
assert.equal(node('#modal-backdrop').hidden,true);

// Two submissions while persistence is pending must result in one write.
state.workouts=[];
node('#workout-date').value=calculations.localDateString();
run('draftWorkout.exercises = [{ exerciseId: "seated-cable-row", sets: [{ weightKg:20, reps:10 }] }];');
const first=sandbox.submitWorkout({preventDefault(){}});
await sandbox.submitWorkout({preventDefault(){}});
assert.equal(saves,1);
// Starting another draft while the old write finishes must not erase the new one.
run('draftWorkout = createEmptyDraft(); draftWorkout.title = "Next session";');
releaseSave();await first;
assert.equal(run('draftWorkout.title'),'Next session');
assert.equal(run('workoutSubmitting'),false);

// A signed-out duration dialog cannot save into the next account.
state.settings.showDurationPrompt=true;
run('draftWorkout.exercises = [{ exerciseId: "seated-cable-row", sets: [{ weightKg:20, reps:10 }] }];');
const awaitingDuration=sandbox.submitWorkout({preventDefault(){}});
state.user=null;
run('handleStateChange()');
await awaitingDuration;
assert.equal(saves,1);

console.log('App workflow tests passed: custom history, HTML escaping, account isolation, duplicate saves, pending dialogs.');
