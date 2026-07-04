import assert from "node:assert/strict";
import { BUNDLED_EXERCISES, MUSCLE_GROUPS, exerciseSearchScore } from "../js/exercises.js";
import { PLAYER_RANKS, analyseWorkout, muscleBalance, statistics, xpForLevel, xpSummary } from "../js/calculations.js";

const ids = new Set();
for (const exercise of BUNDLED_EXERCISES) {
  assert.ok(exercise.id && exercise.name, "Every exercise needs an id and name");
  assert.ok(!ids.has(exercise.id), `Duplicate exercise id: ${exercise.id}`);
  ids.add(exercise.id);
  for (const muscle of [...exercise.muscles.primary, ...exercise.muscles.secondary]) {
    assert.ok(MUSCLE_GROUPS[muscle], `Unknown muscle ${muscle} in ${exercise.id}`);
  }
  if (exercise.standard?.thresholds && Array.isArray(exercise.standard.thresholds)) {
    assert.equal(exercise.standard.thresholds.length, 5);
  }
}

const settings = {
  bodyWeightKg: 72,
  heightCm: 171,
  referenceSex: "male",
  weeklyMuscleTargetSets: 10,
  weeklySessionTarget: 3
};
const today = new Date().toISOString().slice(0, 10);
const workout = {
  id: "smoke-workout",
  date: today,
  title: "Smoke test",
  exercises: [
    {
      exerciseId: "db-bench-press",
      restSeconds: 90,
      sets: [
        { weightKg: 24, reps: 10, rir: 2, completed: true },
        { weightKg: 24, reps: 9, rir: 2, completed: true }
      ]
    },
    {
      exerciseId: "running",
      sets: [],
      activity: { durationMin: 30, distanceKm: 5, elevationM: 20 }
    }
  ]
};

const analysis = analyseWorkout(workout, BUNDLED_EXERCISES, settings);
assert.ok(analysis.calories > 0);
assert.ok(analysis.volumeKg > 0);
assert.equal(analysis.exerciseResults.length, 2);
assert.equal(statistics([workout], BUNDLED_EXERCISES, settings, 28).sessions, 1);
assert.ok(muscleBalance([workout], BUNDLED_EXERCISES, settings, 7).some(item => item.score > 0));
assert.ok(xpSummary([workout], BUNDLED_EXERCISES, settings).xp > 0);
assert.equal(xpForLevel(4) - xpForLevel(3), xpForLevel(3) - xpForLevel(2));
assert.ok(PLAYER_RANKS.every((rank, index) => index === 0 || rank.minLevel - PLAYER_RANKS[index - 1].minLevel === 4));
assert.ok(exerciseSearchScore(BUNDLED_EXERCISES.find(exercise => exercise.id === "barbell-squat"), "sqaut") > 0);

console.log(`Smoke test passed: ${BUNDLED_EXERCISES.length} bundled exercises.`);
