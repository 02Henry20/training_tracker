import { LEVELS, MUSCLE_GROUPS, getExerciseById } from "./exercises.js";

const DAY_MS = 86_400_000;

export const PLAYER_RANKS = Object.freeze([
  { rank: "E", stageKey: "E", label: "Awakened", minLevel: 1, description: "The gate has opened. The focus is showing up, learning the movements and building the first streak of evidence." },
  { rank: "E+", stageKey: "E-plus", label: "Spark", minLevel: 4, description: "The first upgrade pulse. Training is no longer random; the system starts recognizing repeatable effort." },
  { rank: "D", stageKey: "D", label: "Hunter", minLevel: 7, description: "Baseline strength and conditioning are forming. Sessions begin to feel like quests instead of isolated workouts." },
  { rank: "D+", stageKey: "D-plus", label: "Breaker", minLevel: 10, description: "Capacity rises. The body can take more volume, recover cleaner and return with intent." },
  { rank: "C", stageKey: "C", label: "Raider", minLevel: 13, description: "The middle ranks. Weak links become visible, progress becomes measurable and the map starts lighting up." },
  { rank: "C+", stageKey: "C-plus", label: "Vanguard", minLevel: 16, description: "Momentum is now a weapon. You are stacking sessions with enough consistency to change the trend line." },
  { rank: "B", stageKey: "B", label: "Executor", minLevel: 19, description: "A serious training identity. Volume, intensity and standards are high enough that recovery becomes strategy." },
  { rank: "B+", stageKey: "B-plus", label: "Gatebreaker", minLevel: 22, description: "The ceiling moves. Your best sets are no longer accidents; they are summoned by preparation." },
  { rank: "A", stageKey: "A", label: "Elite", minLevel: 25, description: "High-rank output. Progress slows, but every improvement carries more weight." },
  { rank: "A+", stageKey: "A-plus", label: "Apex", minLevel: 28, description: "A refined stage where balance, precision and patience matter as much as force." },
  { rank: "S", stageKey: "S", label: "Sovereign", minLevel: 31, description: "Rare territory. The system expects excellence across repeated cycles, not a single peak." },
  { rank: "S+", stageKey: "S-plus", label: "Mythic", minLevel: 36, description: "Beyond ordinary classification. Training has become a long campaign with visible power curves." },
  { rank: "World", stageKey: "World", icon: "✦", label: "World", minLevel: 42, description: "The stage expands beyond personal baselines. The goal is durable, impressive performance across domains." },
  { rank: "Monarch", stageKey: "Monarch", icon: "♚", label: "Shadow Monarch", minLevel: 50, description: "Endgame pressure. Every session is a command: maintain the throne, sharpen the system, leave no dead zones." }
]);

export function xpForLevel(level) {
  return Math.max(0, (Math.max(1, Number(level) || 1) - 1) ** 2 * 260);
}

export function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function parseDate(value) {
  return new Date(`${value}T00:00:00`);
}

export function addDays(dateString, amount) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

export function daysBetween(start, end) {
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function round(value, digits = 1) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatDate(dateString, options = {}) {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: options.year === false ? undefined : "numeric",
    ...options
  }).format(parseDate(dateString));
}

export function startOfWeek(dateString = localDateString()) {
  const date = parseDate(dateString);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return localDateString(date);
}

export function startOfMonth(dateString = localDateString()) {
  const date = parseDate(dateString);
  date.setDate(1);
  return localDateString(date);
}

export function epley1RM(loadKg, reps) {
  const load = Number(loadKg);
  const count = Number(reps);
  if (!Number.isFinite(load) || load < 0 || !Number.isFinite(count) || count <= 0) return null;
  if (count === 1) return load;
  return load * (1 + Math.min(count, 30) / 30);
}

export function totalExternalLoad(exercise, set) {
  const weight = Math.max(0, Number(set.weightKg) || 0);
  switch (exercise?.loadMode) {
    case "perHand":
    case "perSide":
      return weight * 2;
    default:
      return weight;
  }
}

export function caloriesFromMet(met, bodyWeightKg, minutes) {
  const safeMet = Math.max(1, Number(met) || 1);
  const safeWeight = Math.max(20, Number(bodyWeightKg) || 70);
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  return safeMet * 3.5 * safeWeight / 200 * safeMinutes;
}

function speedKmh(activity, settings) {
  const durationHours = Number(activity.durationMin) / 60;
  let distanceKm = Number(activity.distanceKm);
  if ((!Number.isFinite(distanceKm) || distanceKm <= 0) && Number(activity.steps) > 0) {
    const strideM = Math.max(0.45, Number(settings.heightCm || 170) * 0.00415);
    distanceKm = Number(activity.steps) * strideM / 1000;
  }
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(durationHours) || durationHours <= 0) return null;
  return distanceKm / durationHours;
}

function metForRunning(speed) {
  if (!Number.isFinite(speed)) return 9.3;
  if (speed < 6.9) return 6.5;
  if (speed < 8.0) return 7.8;
  if (speed < 8.9) return 8.5;
  if (speed < 10.4) return 9.3;
  if (speed < 11.1) return 10.5;
  if (speed < 12.0) return 11.0;
  if (speed < 12.9) return 11.8;
  if (speed < 13.9) return 12.5;
  if (speed < 15.5) return 14.8;
  return 16.8;
}

function metForWalking(speed) {
  if (!Number.isFinite(speed)) return 3.8;
  if (speed < 3.2) return 2.3;
  if (speed < 4.0) return 2.8;
  if (speed < 4.8) return 3.0;
  if (speed < 5.6) return 3.8;
  if (speed < 6.4) return 4.8;
  if (speed < 7.2) return 5.5;
  return 7.0;
}

function metForCycling(speed) {
  if (!Number.isFinite(speed)) return 7.0;
  if (speed < 10) return 3.5;
  if (speed < 16) return 5.8;
  if (speed < 19.2) return 6.8;
  if (speed < 22.4) return 8.0;
  if (speed < 25.6) return 10.0;
  if (speed < 32) return 12.0;
  return 16.8;
}

function metForSwimming(speed, stroke) {
  const normalizedStroke = String(stroke ?? "").toLowerCase();
  if (normalizedStroke === "butterfly") return 13.8;
  if (normalizedStroke === "breaststroke") return speed && speed > 2.2 ? 10.3 : 5.3;
  if (normalizedStroke === "backstroke") return speed && speed > 2.0 ? 9.5 : 4.8;
  if (!Number.isFinite(speed)) return 6.0;
  if (speed < 1.6) return 5.8;
  if (speed < 2.3) return 8.0;
  return 9.8;
}

export function activityMet(exercise, activity = {}, settings = {}) {
  const speed = speedKmh(activity, settings);
  const elevation = Math.max(0, Number(activity.elevationM) || 0);
  const distance = Math.max(0.1, Number(activity.distanceKm) || 0.1);
  const gradeProxy = elevation / (distance * 1000);
  const intensity = activity.intensity ?? "moderate";

  switch (exercise?.activityType) {
    case "running":
      return clamp(metForRunning(speed) + Math.min(5, gradeProxy * 22), 5.5, 18.5);
    case "walking":
      return clamp(metForWalking(speed) + Math.min(5, gradeProxy * 18), 2.0, 12.0);
    case "hiking": {
      const packBonus = Math.min(2.5, Math.max(0, Number(activity.packKg) || 0) / 8);
      return clamp(5.3 + Math.min(5, gradeProxy * 20) + packBonus, 3.8, 12.0);
    }
    case "cycling":
      return clamp(metForCycling(speed) + Math.min(2.5, gradeProxy * 10), 3.5, 16.8);
    case "swimming":
      return metForSwimming(speed, activity.stroke);
    case "rowing": {
      const watts = Number(activity.watts);
      if (Number.isFinite(watts) && watts > 0) {
        if (watts < 100) return 5.0;
        if (watts < 150) return 7.5;
        if (watts < 200) return 11.0;
        return 14.0;
      }
      return 7.3;
    }
    case "stairs":
      return intensity === "light" ? 6.8 : intensity === "vigorous" ? 11.0 : 9.3;
    case "elliptical":
      return intensity === "light" ? 3.5 : intensity === "vigorous" ? 9.0 : 5.0;
    case "jumpRope":
      return intensity === "light" ? 8.3 : intensity === "vigorous" ? 12.3 : 11.0;
    default:
      return Number(exercise?.calorie?.baseMet) || 4.0;
  }
}

function levelFromThresholds(value, thresholds, higherIsBetter = true) {
  if (!Number.isFinite(value) || !thresholds?.length) return { ...LEVELS[0], index: 0, value: null, progress: 0 };
  let index = 0;
  if (higherIsBetter) {
    for (let i = 0; i < thresholds.length; i += 1) if (value >= thresholds[i]) index = i + 1;
  } else {
    for (let i = 0; i < thresholds.length; i += 1) if (value <= thresholds[i]) index = i + 1;
  }
  index = clamp(index, 0, LEVELS.length - 1);
  const lower = index === 0 ? 0 : thresholds[index - 1];
  const upper = thresholds[index] ?? lower * 1.2;
  const progress = upper === lower ? 1 : clamp((value - lower) / (upper - lower), 0, 1);
  return { ...LEVELS[index], index, value, progress };
}

function bestStrengthSet(exercise, entry) {
  const sets = (entry.sets ?? []).filter(set => Number(set.reps) > 0 || Number(set.seconds) > 0);
  if (!sets.length) return null;
  if (exercise.inputType === "timedSets") {
    return sets.reduce((best, set) => Number(set.seconds) > Number(best.seconds) ? set : best, sets[0]);
  }
  if (exercise.inputType === "bodyweightSets") {
    return sets.reduce((best, set) => {
      const score = Number(set.reps) + Math.max(0, Number(set.weightKg) || 0) * 0.35;
      const bestScore = Number(best.reps) + Math.max(0, Number(best.weightKg) || 0) * 0.35;
      return score > bestScore ? set : best;
    }, sets[0]);
  }
  return sets.reduce((best, set) => {
    const estimate = epley1RM(totalExternalLoad(exercise, set), set.reps) ?? 0;
    const bestEstimate = epley1RM(totalExternalLoad(exercise, best), best.reps) ?? 0;
    return estimate > bestEstimate ? set : best;
  }, sets[0]);
}

export function evaluateExerciseLevel(exercise, entry, settings) {
  const standard = exercise?.standard;
  if (!standard) return { ...LEVELS[0], index: 0, value: null, progress: 0 };
  const best = bestStrengthSet(exercise, entry);

  if (standard.type === "bodyweightRatio") {
    if (!best) return { ...LEVELS[0], index: 0, value: null, progress: 0 };
    const bodyWeight = Math.max(20, Number(settings.bodyWeightKg) || 70);
    const estimated = epley1RM(totalExternalLoad(exercise, best), best.reps);
    const ratio = estimated == null ? null : estimated / bodyWeight;
    const profile = ["male", "female", "neutral"].includes(settings.referenceSex) ? settings.referenceSex : "neutral";
    return levelFromThresholds(ratio, standard.thresholds[profile] ?? standard.thresholds.neutral);
  }

  if (standard.type === "repetitions") {
    if (!best) return { ...LEVELS[0], index: 0, value: null, progress: 0 };
    const bodyWeight = Math.max(20, Number(settings.bodyWeightKg) || 70);
    const addedBonus = Math.max(0, Number(best.weightKg) || 0) / bodyWeight * 25;
    return levelFromThresholds(Number(best.reps) + addedBonus, standard.thresholds);
  }

  if (standard.type === "durationSeconds") {
    if (!best) return { ...LEVELS[0], index: 0, value: null, progress: 0 };
    return levelFromThresholds(Number(best.seconds), standard.thresholds);
  }

  if (standard.type === "speedKmh") {
    const speed = speedKmh(entry.activity ?? {}, settings);
    return levelFromThresholds(speed, standard.thresholds);
  }

  return { ...LEVELS[0], index: 0, value: null, progress: 0 };
}

export function analyseExerciseEntry(entry, exercise, settings) {
  if (!exercise) return null;
  const bodyWeight = Math.max(20, Number(settings.bodyWeightKg) || 70);
  let calories = 0;
  let volumeKg = 0;
  let totalReps = 0;
  let activeMinutes = 0;
  let durationMinutes = 0;
  let bestE1RM = null;
  let bestSet = null;

  if (exercise.inputType === "activity") {
    const activity = entry.activity ?? {};
    durationMinutes = Math.max(0, Number(activity.durationMin) || 0);
    activeMinutes = durationMinutes;
    calories = caloriesFromMet(activityMet(exercise, activity, settings), bodyWeight, durationMinutes);
  } else {
    const sets = entry.sets ?? [];
    for (const set of sets) {
      const reps = Math.max(0, Number(set.reps) || 0);
      const seconds = Math.max(0, Number(set.seconds) || 0);
      const load = totalExternalLoad(exercise, set);
      totalReps += reps;
      volumeKg += load * reps;
      activeMinutes += exercise.inputType === "timedSets"
        ? seconds / 60
        : reps * (Number(exercise.calorie?.repSeconds) || 3) / 60;
      if (exercise.inputType === "sets") {
        const estimate = epley1RM(load, reps);
        if (estimate != null && (bestE1RM == null || estimate > bestE1RM)) {
          bestE1RM = estimate;
          bestSet = set;
        }
      }
    }
    const restSeconds = Math.max(0, Number(entry.restSeconds ?? exercise.defaults?.restSeconds) || 0);
    const restMinutes = Math.max(0, sets.length - 1) * restSeconds / 60;
    durationMinutes = activeMinutes + restMinutes;
    calories = caloriesFromMet(exercise.calorie?.activeMet ?? 3.5, bodyWeight, activeMinutes)
      + caloriesFromMet(exercise.calorie?.restMet ?? 2.0, bodyWeight, restMinutes);
    bestSet ??= bestStrengthSet(exercise, entry);
  }

  return {
    exerciseId: exercise.id,
    calories,
    volumeKg,
    totalReps,
    activeMinutes,
    durationMinutes,
    bestE1RM,
    bestSet,
    level: evaluateExerciseLevel(exercise, entry, settings),
    speedKmh: exercise.inputType === "activity" ? speedKmh(entry.activity ?? {}, settings) : null
  };
}

export function analyseWorkout(workout, catalog, settings) {
  const exerciseResults = [];
  const muscleScore = Object.fromEntries(Object.keys(MUSCLE_GROUPS).map(key => [key, 0]));
  let calories = 0;
  let volumeKg = 0;
  let activeMinutes = 0;
  let estimatedMinutes = 0;
  let sets = 0;

  for (const entry of workout.exercises ?? []) {
    const exercise = getExerciseById(entry.exerciseId, catalog);
    if (!exercise) continue;
    const result = analyseExerciseEntry(entry, exercise, settings);
    if (!result) continue;
    exerciseResults.push({ ...result, exercise });
    calories += result.calories;
    volumeKg += result.volumeKg;
    activeMinutes += result.activeMinutes;
    estimatedMinutes += result.durationMinutes;

    const strengthSetCount = exercise.inputType === "activity"
      ? Math.max(1, result.activeMinutes / 15)
      : (entry.sets ?? []).filter(set => Number(set.reps) > 0 || Number(set.seconds) > 0).length;
    sets += exercise.inputType === "activity" ? 0 : strengthSetCount;
    for (const muscle of exercise.muscles.primary ?? []) muscleScore[muscle] = (muscleScore[muscle] ?? 0) + strengthSetCount;
    for (const muscle of exercise.muscles.secondary ?? []) muscleScore[muscle] = (muscleScore[muscle] ?? 0) + strengthSetCount * 0.45;
  }

  const explicitDuration = Number(workout.durationMin);
  const durationMin = Number.isFinite(explicitDuration) && explicitDuration > 0 ? explicitDuration : estimatedMinutes;
  if (durationMin > estimatedMinutes && estimatedMinutes > 0) {
    calories += caloriesFromMet(1.8, settings.bodyWeightKg, durationMin - estimatedMinutes);
  }

  return {
    ...workout,
    exerciseResults,
    calories: round(calories, 0) ?? 0,
    volumeKg: round(volumeKg, 0) ?? 0,
    activeMinutes: round(activeMinutes, 0) ?? 0,
    durationMin: round(durationMin, 0) ?? 0,
    sets,
    muscleScore
  };
}

export function buildWorkoutAnalyses(workouts, catalog, settings) {
  return [...workouts]
    .sort((a, b) => `${a.date}${a.createdAtMs ?? 0}`.localeCompare(`${b.date}${b.createdAtMs ?? 0}`))
    .map(workout => analyseWorkout(workout, catalog, settings));
}

export function detectPersonalRecords(workouts, catalog, settings) {
  const best = new Map();
  const recordsByWorkout = new Map();
  for (const workout of buildWorkoutAnalyses(workouts, catalog, settings)) {
    const records = [];
    for (const result of workout.exerciseResults) {
      const comparable = result.bestE1RM ?? result.level.value;
      if (!Number.isFinite(comparable)) continue;
      const previous = best.get(result.exerciseId);
      if (previous == null || comparable > previous.value + 0.0001) {
        if (previous != null) records.push({ exerciseId: result.exerciseId, exercise: result.exercise, value: comparable, previous: previous.value, result });
        best.set(result.exerciseId, { value: comparable, date: workout.date, workoutId: workout.id, result });
      }
    }
    recordsByWorkout.set(workout.id, records);
  }
  return { best, recordsByWorkout };
}

export function trainingStreak(workouts, today = localDateString()) {
  const dates = new Set(workouts.map(workout => workout.date).filter(Boolean));
  if (!dates.size) return 0;
  let cursor = dates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function consistencyStreak(workouts, weeklyTarget = 3, today = localDateString()) {
  const weekGroups = new Map();
  for (const workout of workouts) {
    const week = startOfWeek(workout.date);
    if (!weekGroups.has(week)) weekGroups.set(week, new Set());
    weekGroups.get(week).add(workout.date);
  }
  let week = startOfWeek(today);
  let streak = 0;
  for (let i = 0; i < 104; i += 1) {
    const count = weekGroups.get(week)?.size ?? 0;
    const currentWeek = i === 0;
    if (count >= weeklyTarget || (currentWeek && count > 0)) streak += 1;
    else if (!currentWeek) break;
    week = addDays(week, -7);
  }
  return streak;
}

export function calculateProgression(workouts, catalog, settings, exerciseId, metric = "level") {
  const points = [];
  for (const workout of buildWorkoutAnalyses(workouts, catalog, settings)) {
    for (const result of workout.exerciseResults) {
      if (result.exerciseId !== exerciseId) continue;
      let value = null;
      if (metric === "e1rm") value = result.bestE1RM;
      else if (metric === "volume") value = result.volumeKg;
      else if (metric === "reps") value = result.totalReps;
      else if (metric === "seconds") value = result.bestSet?.seconds;
      else if (metric === "duration") value = result.activeMinutes;
      else if (metric === "speed") value = result.speedKmh;
      else value = result.level.index + result.level.progress;
      if (Number.isFinite(value)) points.push({ date: workout.date, value, workoutId: workout.id });
    }
  }
  return points;
}

export function muscleBalance(workouts, catalog, settings, days = 7) {
  const end = localDateString();
  const start = addDays(end, -(Math.max(1, days) - 1));
  const totals = Object.fromEntries(Object.keys(MUSCLE_GROUPS).map(key => [key, 0]));
  const lastTrained = Object.fromEntries(Object.keys(MUSCLE_GROUPS).map(key => [key, null]));
  const bestExerciseScores = new Map();
  const analyses = buildWorkoutAnalyses(workouts, catalog, settings);
  for (const workout of analyses) {
    for (const result of workout.exerciseResults) {
      if (result.level.value == null) continue;
      const score = result.level.index + result.level.progress;
      if (!bestExerciseScores.has(result.exerciseId) || score > bestExerciseScores.get(result.exerciseId)) {
        bestExerciseScores.set(result.exerciseId, score);
      }
    }
    for (const [muscle, score] of Object.entries(workout.muscleScore)) {
      if (score > 0 && (!lastTrained[muscle] || workout.date > lastTrained[muscle])) lastTrained[muscle] = workout.date;
      if (workout.date >= start && workout.date <= end) totals[muscle] += score;
    }
  }
  const weeklyTarget = Math.max(1, Number(settings.weeklyMuscleTargetSets) || 10) * Math.max(1, days / 7);
  return Object.keys(MUSCLE_GROUPS).map(key => {
    const score = totals[key];
    const ratio = score / weeklyTarget;
    const daysSince = lastTrained[key] ? daysBetween(lastTrained[key], end) : null;
    let status = "missing";
    if (ratio >= 1.25) status = "high";
    else if (ratio >= 0.75) status = "balanced";
    else if (ratio >= 0.3) status = "low";
    const recovery = daysSince == null ? "fresh" : daysSince <= 1 ? "recovering" : daysSince <= 3 ? "ready" : "fresh";

    const levelInputs = [];
    for (const [exerciseId, exerciseScore] of bestExerciseScores.entries()) {
      const exercise = getExerciseById(exerciseId, catalog);
      if (!exercise) continue;
      if (exercise.muscles.primary.includes(key)) levelInputs.push({ score: exerciseScore, weight: 1 });
      else if (exercise.muscles.secondary.includes(key)) levelInputs.push({ score: exerciseScore, weight: 0.35 });
    }
    const levelWeight = levelInputs.reduce((sum, item) => sum + item.weight, 0);
    const levelScore = levelWeight > 0
      ? levelInputs.reduce((sum, item) => sum + item.score * item.weight, 0) / levelWeight
      : 0;
    const levelIndex = clamp(Math.floor(levelScore), 0, LEVELS.length - 1);
    const level = { ...LEVELS[levelIndex], progress: clamp(levelScore - levelIndex, 0, 1), score: levelScore, hasData: levelInputs.length > 0 };

    return { key, ...MUSCLE_GROUPS[key], score: round(score, 1), target: round(weeklyTarget, 1), ratio, status, lastTrained: lastTrained[key], daysSince, recovery, level };
  });
}

export function xpSummary(workouts, catalog, settings) {
  const analyses = buildWorkoutAnalyses(workouts, catalog, settings);
  const prs = detectPersonalRecords(workouts, catalog, settings);
  let xp = 0;
  for (const workout of analyses) {
    const prCount = prs.recordsByWorkout.get(workout.id)?.length ?? 0;
    xp += 80 + workout.activeMinutes * 0.5 + workout.calories * 0.12 + prCount * 35 + Math.min(120, workout.sets * 3);
  }
  xp = Math.round(xp);
  const level = Math.max(1, Math.floor(Math.sqrt(xp / 260)) + 1);
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const progress = clamp((xp - currentFloor) / Math.max(1, nextFloor - currentFloor), 0, 1);
  const rank = [...PLAYER_RANKS].reverse().find(item => level >= item.minLevel) ?? PLAYER_RANKS[0];
  return { xp, level, progress, rank, nextXp: nextFloor };
}

export function statistics(workouts, catalog, settings, days = 28) {
  const end = localDateString();
  const start = addDays(end, -(Math.max(1, Number(days) || 28) - 1));
  const analyses = buildWorkoutAnalyses(workouts, catalog, settings).filter(workout => workout.date >= start && workout.date <= end);
  const activeDates = new Set(analyses.map(workout => workout.date));
  const totalCalories = analyses.reduce((sum, workout) => sum + workout.calories, 0);
  const totalMinutes = analyses.reduce((sum, workout) => sum + workout.durationMin, 0);
  const totalVolume = analyses.reduce((sum, workout) => sum + workout.volumeKg, 0);
  const totalSets = analyses.reduce((sum, workout) => sum + workout.sets, 0);
  const weeks = Math.max(1, days / 7);
  const weekly = [];
  for (let offset = Math.ceil(days / 7) - 1; offset >= 0; offset -= 1) {
    const weekStart = addDays(startOfWeek(end), -offset * 7);
    const weekEnd = addDays(weekStart, 6);
    const weekWorkouts = analyses.filter(workout => workout.date >= weekStart && workout.date <= weekEnd);
    weekly.push({
      date: weekStart,
      sessions: new Set(weekWorkouts.map(workout => workout.date)).size,
      calories: weekWorkouts.reduce((sum, workout) => sum + workout.calories, 0),
      minutes: weekWorkouts.reduce((sum, workout) => sum + workout.durationMin, 0)
    });
  }
  return {
    start,
    end,
    analyses,
    sessions: activeDates.size,
    workouts: analyses.length,
    sessionsPerWeek: activeDates.size / weeks,
    totalCalories,
    totalMinutes,
    totalVolume,
    totalSets,
    weekly
  };
}

export function calendarIntensity(workouts, catalog, settings, monthDate) {
  const start = startOfMonth(monthDate);
  const date = parseDate(start);
  date.setMonth(date.getMonth() + 1);
  const end = addDays(localDateString(date), -1);
  const byDate = new Map();
  for (const workout of buildWorkoutAnalyses(workouts, catalog, settings)) {
    if (workout.date < start || workout.date > end) continue;
    const current = byDate.get(workout.date) ?? { date: workout.date, calories: 0, minutes: 0, workouts: [] };
    current.calories += workout.calories;
    current.minutes += workout.durationMin;
    current.workouts.push(workout);
    byDate.set(workout.date, current);
  }
  const maxCalories = Math.max(1, ...[...byDate.values()].map(day => day.calories));
  for (const day of byDate.values()) {
    day.intensity = clamp(day.calories / maxCalories, 0, 1);
    day.tier = day.calories < 120 ? 1 : day.calories < 250 ? 2 : day.calories < 450 ? 3 : 4;
  }
  return byDate;
}

export function suggestedFocus(workouts, catalog, settings) {
  const balance = muscleBalance(workouts, catalog, settings, 7)
    .filter(item => item.key !== "cardio")
    .sort((a, b) => a.ratio - b.ratio);
  const weak = balance.filter(item => item.status === "missing" || item.status === "low").slice(0, 3);
  if (!weak.length) return { title: "Balanced week", text: "Your recent muscle coverage is broadly balanced. Progress a priority lift or take a recovery session.", muscles: [] };
  return {
    title: `Focus: ${weak.map(item => item.name).join(", ")}`,
    text: "These groups have the lowest effective-set coverage in the selected week. Treat this as a planning cue, not a medical assessment.",
    muscles: weak
  };
}
