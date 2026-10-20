import assert from 'node:assert/strict';
import { BUNDLED_EXERCISES as catalog, mergeExerciseCatalog, exerciseSearchScore } from '../js/exercises.js';
import { activityMet, analyseExerciseEntry, analyseWorkout, caloriesFromMet, calculateProgression, statistics, addDays, localDateString, xpSummary, workoutXp, xpForLevel, muscleBalance, calendarIntensity, detectPersonalRecords } from '../js/calculations.js';
const settings = {bodyWeightKg:72,heightCm:171,referenceSex:'male',weeklyMuscleTargetSets:10};
const exercise = id => { const value=catalog.find(e=>e.id===id); assert.ok(value,id); return value; };
const entry = (id, overrides={}) => ({exerciseId:id,restSeconds:90,sets:[{weightKg:20,reps:10,seconds:30,completed:true},{weightKg:20,reps:10,seconds:30,completed:true}],...overrides});
const analyse = (id, overrides={}, profile=settings) => analyseExerciseEntry(entry(id,overrides),exercise(id),profile);
const near = (actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
assert.equal(catalog.length,193);
for (const e of catalog) {
  const result=analyseExerciseEntry(entry(e.id,{activity:{durationMin:30,intensity:'moderate'}}),e,settings);
  for(const key of ['calories','volumeKg','activeMinutes','durationMinutes']) assert.ok(Number.isFinite(result[key])&&result[key]>=0,`${e.id}: ${key}`);
  assert.ok(e.calorie.source,`${e.id}: provenance`);
  if(e.inputType==='activity') {
    assert.ok(e.fields.includes('durationMin'));
    assert.ok(!e.fields.includes('weightKg'));
  } else assert.ok(e.calorie.sessionMet>0);
}
assert.equal(exercise('seated-cable-row').inputType,'sets');
assert.equal(exercise('one-arm-lat-pulldown').inputType,'sets');
assert.equal(exercise('rowing-machine').inputType,'activity');
assert.ok(exerciseSearchScore(exercise('seated-cable-row'),'cable row')>exerciseSearchScore(exercise('rowing-machine'),'cable row'));
for(const stroke of ['freestyle','breaststroke','backstroke','butterfly','sidestroke']) assert.equal(exercise(`swimming-${stroke}`).stroke,stroke);
near(caloriesFromMet(5.3,72,30),200.34);
near(activityMet(exercise('swimming-breaststroke'),{stroke:'freestyle',durationMin:30,distanceKm:1,intensity:'moderate'},settings),5.3);
near(activityMet(exercise('swimming-breaststroke'),{intensity:'vigorous'},settings),10.3);
near(activityMet(exercise('swimming-freestyle'),{durationMin:30,distanceKm:1.5},settings),8);
near(activityMet(exercise('swimming-butterfly'),{},settings),13.8);
near(activityMet(exercise('rowing-machine'),{watts:150,intensity:'light'},settings),11);
near(activityMet(exercise('stationary-bike'),{watts:100},settings),6);
near(activityMet(exercise('running'),{durationMin:30,distanceKm:4.5},settings),9);
near(activityMet(exercise('walking'),{durationMin:30,elevationM:500},settings),3.8);
for(const id of ['soccer','basketball','tennis','bouldering','kayaking','skiing','snowboarding','stationary-bike','rowing-machine']) assert.ok(activityMet(exercise(id),{intensity:'vigorous'},settings)>activityMet(exercise(id),{intensity:'light'},settings),id);
near(analyse('one-arm-lat-pulldown').totalReps,40);
near(analyse('one-arm-lat-pulldown').volumeKg,800);
near(analyse('db-bench-press').volumeKg,800);
near(analyse('bulgarian-split-squat').volumeKg,1600);
near(analyse('cable-lateral-raise').volumeKg,800);
assert.ok(analyse('assisted-pull-up').volumeKg<analyse('pull-up').volumeKg);
assert.equal(analyse('assisted-pull-up').level.value,null);
near(analyse('pull-up',{}, {...settings,bodyWeightKg:144}).calories,analyse('pull-up').calories*2);
// Retired timing fields must not influence automatic energy estimates.
near(analyse('seated-cable-row',{durationMin:10,restSeconds:0,repSeconds:30}).calories,analyse('seated-cable-row').calories);
near(analyse('seated-cable-row').durationMinutes,64/60 + exercise('seated-cable-row').defaults.restSeconds/60);
near(analyse('seated-cable-row').calories,3.5*3.5*72/200*analyse('seated-cable-row').durationMinutes);
assert.ok(analyse('seated-cable-row',{sets:[{reps:10,weightKg:20}]}).calories<analyse('seated-cable-row').calories);
near(analyse('seated-cable-row',{sets:[{reps:0},{reps:0}]}).calories,0);
near(analyse('plank').totalReps,0);
near(analyse('seated-cable-row',{trackCompletion:true,sets:[{reps:10,weightKg:20,completed:false}]}).calories,0);
assert.ok(analyse('seated-cable-row',{sets:[{reps:10,weightKg:20,completed:false}]}).calories>0,'Legacy false flags remain logged');
const today=localDateString();
const workout={id:'regression',date:today,bodyWeightKg:72,exercises:[entry('seated-cable-row')]};
assert.equal(analyseWorkout({...workout,durationMin:600},catalog,settings).calories,analyseWorkout(workout,catalog,settings).calories,'Idle timer time does not generate calories');
assert.equal(analyseWorkout(workout,catalog,settings).calories,analyseWorkout(workout,catalog,{...settings,bodyWeightKg:100}).calories);
assert.equal(calculateProgression([workout],catalog,settings,'seated-cable-row','level').length,1);
const windowWorkouts=[workout,{...workout,id:'first',date:addDays(today,-27)}];
const stats=statistics(windowWorkouts,catalog,settings,28);
assert.equal(stats.weekly.reduce((sum,w)=>sum+w.calories,0),stats.totalCalories,'Partial first week included');
assert.equal(xpSummary([workout],catalog,settings).xp,workoutXp(analyseWorkout(workout,catalog,settings)));
// Reach each rounded XP threshold exactly (using duration-only, no rank/PR bonuses).
for (let targetLevel=2;targetLevel<=54;targetLevel+=1) {
  const minutes=(xpForLevel(targetLevel)-80)/(0.5+2.3*3.5*72/200*0.12);
  const leveled={id:'boundary',date:today,exercises:[{exerciseId:'stretching',activity:{durationMin:minutes}}]};
  // Workout rounding can move the final XP by a point; assert the displayed threshold agrees.
  const summary=xpSummary([leveled],catalog,settings);
  assert.ok(summary.xp>=xpForLevel(summary.level));
  assert.ok(summary.xp<xpForLevel(summary.level+1));
}
assert.equal(xpSummary([{...workout,date:addDays(today,1)}],catalog,settings).xp,0);
assert.equal(xpSummary([{id:'empty',date:today,exercises:[]}],catalog,settings).xp,0);
const prWorkouts=[{...workout,id:'baseline',date:addDays(today,-1)}, {...workout,id:'improved',exercises:[entry('seated-cable-row',{sets:[{weightKg:40,reps:10}]})]}];
assert.equal(calendarIntensity(prWorkouts,catalog,settings,today).get(today).xp,workoutXp(analyseWorkout(prWorkouts[1],catalog,settings),1),'Calendar includes earned PR bonus');
assert.equal(calendarIntensity([{...workout,date:addDays(today,1)}],catalog,settings,addDays(today,1)).get(addDays(today,1)).xp,0,'Planned workouts earn no calendar XP');
assert.equal(calendarIntensity([{id:'empty',date:today,exercises:[]}],catalog,settings,today).get(today).xp,0);
near(analyse('pull-up',{sets:[{reps:10,weightKg:20},{reps:14,weightKg:0}]},{...settings,bodyWeightKg:200}).level.value,14);
const duplicateEntries={...workout,id:'duplicates',exercises:[entry('seated-cable-row'),entry('seated-cable-row',{sets:[{reps:10,weightKg:40}]}),entry('seated-cable-row',{sets:[{reps:10,weightKg:60}]})]};
assert.equal(detectPersonalRecords([duplicateEntries],catalog,settings).recordsByWorkout.get('duplicates').length,0,'First session establishes a baseline regardless of duplicate entries');
assert.equal(detectPersonalRecords([{...workout,date:addDays(today,-1)},duplicateEntries],catalog,settings).recordsByWorkout.get('duplicates').length,1,'One PR per exercise per session');
const future=muscleBalance([{...workout,date:addDays(today,1)}],catalog,settings,7);
assert.ok(future.every(m=>m.lastTrained===null));
const stale=mergeExerciseCatalog([{id:'seated-cable-row',name:'Cable row',inputType:'activity',fields:['durationMin','distanceKm']}]);
assert.equal(stale.find(e=>e.id==='seated-cable-row').inputType,'sets');
const custom=mergeExerciseCatalog([],[{id:'custom-a',name:'My exercise',muscles:{primary:['shoulders','unknown']}}]);
assert.deepEqual(custom.find(e=>e.id==='custom-a').muscles.primary,['sideDelts']);
console.log('Regression tests passed: all 193 exercises, calories, inputs, history, XP, catalog compatibility.');
