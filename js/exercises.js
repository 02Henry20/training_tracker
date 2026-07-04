export const MUSCLE_GROUPS = Object.freeze({
  chest: { name: "Chest", region: "upper", icon: "◇" },
  frontDelts: { name: "Front delts", region: "upper", icon: "△" },
  sideDelts: { name: "Side delts", region: "upper", icon: "◁" },
  rearDelts: { name: "Rear delts", region: "upper", icon: "▷" },
  triceps: { name: "Triceps", region: "arms", icon: "↯" },
  biceps: { name: "Biceps", region: "arms", icon: "⌁" },
  forearms: { name: "Forearms", region: "arms", icon: "≋" },
  lats: { name: "Lats", region: "back", icon: "⌄" },
  upperBack: { name: "Upper back", region: "back", icon: "⌃" },
  traps: { name: "Traps", region: "back", icon: "◆" },
  lowerBack: { name: "Lower back", region: "core", icon: "⋮" },
  abs: { name: "Abs", region: "core", icon: "▦" },
  obliques: { name: "Obliques", region: "core", icon: "◫" },
  glutes: { name: "Glutes", region: "lower", icon: "●" },
  quads: { name: "Quads", region: "lower", icon: "▴" },
  hamstrings: { name: "Hamstrings", region: "lower", icon: "▾" },
  calves: { name: "Calves", region: "lower", icon: "∧" },
  hipFlexors: { name: "Hip flexors", region: "lower", icon: "×" },
  cardio: { name: "Cardio", region: "conditioning", icon: "⌁" }
});

export const LEVELS = Object.freeze([
  { key: "starter", rank: "E", label: "Starter", min: 0 },
  { key: "novice", rank: "D", label: "Novice", min: 1 },
  { key: "intermediate", rank: "C", label: "Intermediate", min: 2 },
  { key: "advanced", rank: "B", label: "Advanced", min: 3 },
  { key: "elite", rank: "A", label: "Elite", min: 4 },
  { key: "master", rank: "S", label: "Master", min: 5 }
]);

const sexScaled = (male, femaleFactor = 0.72) => ({
  male,
  female: male.map(value => Number((value * femaleFactor).toFixed(3))),
  neutral: male.map(value => Number((value * ((1 + femaleFactor) / 2)).toFixed(3)))
});

const ratioStandard = (male, femaleFactor = 0.72) => ({
  type: "bodyweightRatio",
  thresholds: sexScaled(male, femaleFactor)
});

const repStandard = thresholds => ({ type: "repetitions", thresholds });
const timeStandard = thresholds => ({ type: "durationSeconds", thresholds });
const speedStandard = thresholds => ({ type: "speedKmh", thresholds });

function strength({
  id,
  name,
  equipment,
  pattern,
  primary,
  secondary = [],
  loadMode = "total",
  defaultSets = 3,
  defaultReps = 10,
  restSeconds = 90,
  activeMet = 3.5,
  standard = null,
  aliases = [],
  unilateral = false
}) {
  return {
    id,
    name,
    aliases,
    category: "strength",
    inputType: "sets",
    equipment,
    pattern,
    muscles: { primary, secondary },
    loadMode,
    unilateral,
    defaults: { sets: defaultSets, reps: defaultReps, restSeconds },
    calorie: { activeMet, restMet: 2.0, repSeconds: 3.2 },
    standard
  };
}

function bodyweight({
  id,
  name,
  pattern,
  primary,
  secondary = [],
  thresholds,
  defaultSets = 3,
  defaultReps = 8,
  restSeconds = 90,
  activeMet = 3.8,
  aliases = [],
  timed = false
}) {
  return {
    id,
    name,
    aliases,
    category: "strength",
    inputType: timed ? "timedSets" : "bodyweightSets",
    equipment: "Bodyweight",
    pattern,
    muscles: { primary, secondary },
    loadMode: "added",
    defaults: { sets: defaultSets, reps: defaultReps, restSeconds, seconds: timed ? thresholds[0] : null },
    calorie: { activeMet, restMet: 2.0, repSeconds: timed ? 1 : 3.0 },
    standard: timed ? timeStandard(thresholds) : repStandard(thresholds)
  };
}

function activity({
  id,
  name,
  activityType,
  primary = ["cardio"],
  secondary = [],
  baseMet,
  speedBands,
  fields,
  aliases = []
}) {
  return {
    id,
    name,
    aliases,
    category: "activity",
    inputType: "activity",
    equipment: "Activity",
    pattern: activityType,
    activityType,
    muscles: { primary, secondary },
    defaults: { durationMin: 30, distanceKm: "", elevationM: "", steps: "", intensity: "moderate" },
    calorie: { baseMet },
    standard: speedBands ? speedStandard(speedBands) : null,
    fields
  };
}

export const BUNDLED_EXERCISES = Object.freeze([
  // Chest and push
  strength({ id: "db-bench-press", name: "Dumbbell Bench Press", equipment: "Dumbbells", pattern: "Horizontal push", primary: ["chest"], secondary: ["triceps", "frontDelts"], loadMode: "perHand", activeMet: 5.0, standard: ratioStandard([0.22, 0.38, 0.58, 0.78, 1.0]) }),
  strength({ id: "db-incline-bench-press", name: "Incline Dumbbell Bench Press", equipment: "Dumbbells", pattern: "Incline push", primary: ["chest", "frontDelts"], secondary: ["triceps"], loadMode: "perHand", activeMet: 5.0, standard: ratioStandard([0.18, 0.32, 0.5, 0.68, 0.88]) }),
  strength({ id: "barbell-bench-press", name: "Barbell Bench Press", equipment: "Barbell", pattern: "Horizontal push", primary: ["chest"], secondary: ["triceps", "frontDelts"], activeMet: 5.0, standard: ratioStandard([0.35, 0.55, 0.8, 1.05, 1.3]) }),
  strength({ id: "barbell-incline-bench-press", name: "Incline Barbell Bench Press", equipment: "Barbell", pattern: "Incline push", primary: ["chest", "frontDelts"], secondary: ["triceps"], activeMet: 5.0, standard: ratioStandard([0.3, 0.48, 0.7, 0.92, 1.15]) }),
  strength({ id: "machine-chest-press", name: "Machine Chest Press", equipment: "Machine", pattern: "Horizontal push", primary: ["chest"], secondary: ["triceps", "frontDelts"], activeMet: 3.5, standard: ratioStandard([0.25, 0.45, 0.7, 0.95, 1.2]) }),
  strength({ id: "cable-fly", name: "Cable Fly", equipment: "Cable", pattern: "Chest isolation", primary: ["chest"], secondary: ["frontDelts"], loadMode: "perSide", activeMet: 3.5, standard: ratioStandard([0.08, 0.14, 0.22, 0.32, 0.45], 0.75) }),
  strength({ id: "pec-deck", name: "Pec Deck", equipment: "Machine", pattern: "Chest isolation", primary: ["chest"], activeMet: 3.5, standard: ratioStandard([0.18, 0.3, 0.46, 0.65, 0.85], 0.75) }),
  bodyweight({ id: "push-up", name: "Push-up", pattern: "Horizontal push", primary: ["chest"], secondary: ["triceps", "frontDelts", "abs"], thresholds: [5, 15, 30, 45, 60], defaultReps: 12, activeMet: 3.8 }),
  bodyweight({ id: "forward-lean-push-up", name: "Forward-Lean Push-up", pattern: "Planche-style push", primary: ["frontDelts", "chest"], secondary: ["triceps", "abs"], thresholds: [3, 8, 15, 25, 40], defaultReps: 8, activeMet: 5.0, aliases: ["leaning pushup"] }),
  bodyweight({ id: "dips", name: "Dips", pattern: "Vertical push", primary: ["triceps", "chest"], secondary: ["frontDelts"], thresholds: [1, 6, 12, 20, 30], defaultReps: 8, activeMet: 5.0 }),
  bodyweight({ id: "front-dips", name: "Front Dips", pattern: "Bench dip", primary: ["triceps"], secondary: ["chest", "frontDelts"], thresholds: [5, 12, 25, 40, 60], defaultReps: 12, activeMet: 3.8, aliases: ["bench dips"] }),
  strength({ id: "close-grip-bench", name: "Close-Grip Bench Press", equipment: "Barbell", pattern: "Triceps press", primary: ["triceps"], secondary: ["chest", "frontDelts"], activeMet: 5.0, standard: ratioStandard([0.3, 0.5, 0.72, 0.95, 1.18]) }),

  // Shoulders and triceps
  strength({ id: "db-shoulder-press", name: "Dumbbell Shoulder Press", equipment: "Dumbbells", pattern: "Vertical push", primary: ["frontDelts", "sideDelts"], secondary: ["triceps"], loadMode: "perHand", activeMet: 5.0, standard: ratioStandard([0.16, 0.28, 0.42, 0.58, 0.75]) }),
  strength({ id: "barbell-overhead-press", name: "Barbell Overhead Press", equipment: "Barbell", pattern: "Vertical push", primary: ["frontDelts", "sideDelts"], secondary: ["triceps", "abs"], activeMet: 5.0, standard: ratioStandard([0.25, 0.4, 0.58, 0.75, 0.95]) }),
  strength({ id: "lateral-raise", name: "Dumbbell Lateral Raise", equipment: "Dumbbells", pattern: "Shoulder isolation", primary: ["sideDelts"], secondary: ["traps"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.035, 0.06, 0.095, 0.14, 0.2], 0.78) }),
  strength({ id: "cable-lateral-raise", name: "Cable Lateral Raise", equipment: "Cable", pattern: "Shoulder isolation", primary: ["sideDelts"], loadMode: "perSide", activeMet: 3.5, standard: ratioStandard([0.025, 0.05, 0.08, 0.12, 0.17], 0.78) }),
  strength({ id: "upright-row", name: "Upright Row", equipment: "Barbell or cable", pattern: "Vertical pull", primary: ["sideDelts", "traps"], secondary: ["biceps"], activeMet: 3.5, standard: ratioStandard([0.16, 0.28, 0.42, 0.6, 0.78]) }),
  strength({ id: "reverse-fly", name: "Reverse Fly", equipment: "Dumbbells or machine", pattern: "Rear-delt isolation", primary: ["rearDelts", "upperBack"], secondary: ["traps"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.035, 0.065, 0.1, 0.15, 0.22], 0.78) }),
  strength({ id: "face-pull", name: "Face Pull", equipment: "Cable", pattern: "Rear-delt pull", primary: ["rearDelts", "upperBack"], secondary: ["traps", "biceps"], activeMet: 3.5, standard: ratioStandard([0.12, 0.22, 0.35, 0.5, 0.68], 0.75) }),
  strength({ id: "triceps-pushdown", name: "Triceps Pushdown", equipment: "Cable", pattern: "Triceps isolation", primary: ["triceps"], activeMet: 3.5, standard: ratioStandard([0.12, 0.22, 0.35, 0.5, 0.7], 0.75) }),
  strength({ id: "skull-crusher", name: "Skull Crushers", equipment: "EZ-bar or dumbbells", pattern: "Triceps isolation", primary: ["triceps"], secondary: ["frontDelts"], activeMet: 3.5, standard: ratioStandard([0.1, 0.2, 0.32, 0.46, 0.62], 0.75) }),
  strength({ id: "overhead-triceps-extension", name: "Overhead Triceps Extension", equipment: "Cable or dumbbell", pattern: "Triceps isolation", primary: ["triceps"], activeMet: 3.5, standard: ratioStandard([0.1, 0.2, 0.32, 0.46, 0.62], 0.75) }),

  // Back and biceps
  bodyweight({ id: "pull-up", name: "Pull-up", pattern: "Vertical pull", primary: ["lats", "biceps"], secondary: ["upperBack", "forearms", "abs"], thresholds: [1, 5, 10, 15, 22], defaultReps: 6, activeMet: 5.0 }),
  bodyweight({ id: "chin-up", name: "Chin-up", pattern: "Vertical pull", primary: ["lats", "biceps"], secondary: ["upperBack", "forearms"], thresholds: [1, 6, 11, 17, 25], defaultReps: 6, activeMet: 5.0 }),
  strength({ id: "lat-pulldown", name: "Lat Pulldown", equipment: "Cable", pattern: "Vertical pull", primary: ["lats"], secondary: ["biceps", "upperBack"], activeMet: 3.5, standard: ratioStandard([0.28, 0.48, 0.7, 0.95, 1.2], 0.75) }),
  strength({ id: "one-arm-db-row", name: "One-Arm Dumbbell Row", equipment: "Dumbbell", pattern: "Horizontal pull", primary: ["lats", "upperBack"], secondary: ["biceps", "rearDelts"], loadMode: "single", unilateral: true, activeMet: 5.0, standard: ratioStandard([0.18, 0.3, 0.46, 0.64, 0.84], 0.75) }),
  strength({ id: "barbell-row", name: "Barbell Row", equipment: "Barbell", pattern: "Horizontal pull", primary: ["lats", "upperBack"], secondary: ["biceps", "rearDelts", "lowerBack"], activeMet: 5.0, standard: ratioStandard([0.3, 0.5, 0.72, 0.95, 1.2]) }),
  strength({ id: "seated-cable-row", name: "Seated Cable Row", equipment: "Cable", pattern: "Horizontal pull", primary: ["upperBack", "lats"], secondary: ["biceps", "rearDelts"], activeMet: 3.5, standard: ratioStandard([0.28, 0.48, 0.72, 0.98, 1.25], 0.75) }),
  strength({ id: "chest-supported-row", name: "Chest-Supported Row", equipment: "Dumbbells or machine", pattern: "Horizontal pull", primary: ["upperBack", "lats"], secondary: ["biceps", "rearDelts"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.18, 0.32, 0.5, 0.7, 0.92], 0.75) }),
  strength({ id: "db-shrug", name: "Dumbbell Shrug", equipment: "Dumbbells", pattern: "Scapular elevation", primary: ["traps"], secondary: ["forearms"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.3, 0.55, 0.85, 1.15, 1.5], 0.78) }),
  strength({ id: "barbell-shrug", name: "Barbell Shrug", equipment: "Barbell", pattern: "Scapular elevation", primary: ["traps"], secondary: ["forearms"], activeMet: 3.5, standard: ratioStandard([0.45, 0.8, 1.15, 1.55, 2.0], 0.78) }),
  strength({ id: "barbell-curl", name: "Barbell Biceps Curl", equipment: "Barbell or EZ-bar", pattern: "Elbow flexion", primary: ["biceps"], secondary: ["forearms"], activeMet: 3.5, standard: ratioStandard([0.12, 0.22, 0.34, 0.48, 0.65], 0.75), aliases: ["biceps curl barbell"] }),
  strength({ id: "db-curl", name: "Dumbbell Biceps Curl", equipment: "Dumbbells", pattern: "Elbow flexion", primary: ["biceps"], secondary: ["forearms"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.08, 0.14, 0.22, 0.32, 0.44], 0.75), aliases: ["dumbbell curl"] }),
  strength({ id: "hammer-curl", name: "Hammer Curl", equipment: "Dumbbells", pattern: "Elbow flexion", primary: ["biceps", "forearms"], loadMode: "perHand", activeMet: 3.5, standard: ratioStandard([0.08, 0.15, 0.24, 0.34, 0.46], 0.75) }),
  strength({ id: "preacher-curl", name: "Preacher Curl", equipment: "EZ-bar or machine", pattern: "Elbow flexion", primary: ["biceps"], secondary: ["forearms"], activeMet: 3.5, standard: ratioStandard([0.1, 0.18, 0.29, 0.42, 0.58], 0.75) }),

  // Lower body
  strength({ id: "barbell-squat", name: "Barbell Back Squat", equipment: "Barbell", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["hamstrings", "lowerBack", "abs"], defaultReps: 8, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.5, 0.8, 1.15, 1.5, 1.9]), aliases: ["squats"] }),
  strength({ id: "front-squat", name: "Front Squat", equipment: "Barbell", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["abs", "upperBack"], defaultReps: 8, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.4, 0.65, 0.95, 1.25, 1.55]) }),
  strength({ id: "goblet-squat", name: "Goblet Squat", equipment: "Dumbbell or kettlebell", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["abs"], defaultReps: 10, activeMet: 5.0, standard: ratioStandard([0.18, 0.3, 0.46, 0.65, 0.85], 0.75) }),
  strength({ id: "deadlift", name: "Conventional Deadlift", equipment: "Barbell", pattern: "Hinge", primary: ["glutes", "hamstrings", "lowerBack"], secondary: ["upperBack", "traps", "forearms"], defaultReps: 5, restSeconds: 150, activeMet: 5.0, standard: ratioStandard([0.65, 1.0, 1.4, 1.8, 2.2]) }),
  strength({ id: "romanian-deadlift", name: "Romanian Deadlift", equipment: "Barbell or dumbbells", pattern: "Hinge", primary: ["hamstrings", "glutes"], secondary: ["lowerBack", "forearms"], defaultReps: 8, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.4, 0.7, 1.0, 1.3, 1.65]) }),
  strength({ id: "hip-thrust", name: "Hip Thrust", equipment: "Barbell or machine", pattern: "Hip extension", primary: ["glutes"], secondary: ["hamstrings"], defaultReps: 10, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.5, 0.85, 1.2, 1.6, 2.05], 0.78) }),
  strength({ id: "leg-press", name: "Leg Press", equipment: "Machine", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["hamstrings"], defaultReps: 10, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.8, 1.4, 2.1, 3.0, 4.0], 0.78) }),
  strength({ id: "bulgarian-split-squat", name: "Bulgarian Split Squat", equipment: "Dumbbells", pattern: "Single-leg squat", primary: ["quads", "glutes"], secondary: ["hamstrings", "abs"], loadMode: "perHand", unilateral: true, defaultReps: 8, activeMet: 5.0, standard: ratioStandard([0.12, 0.22, 0.36, 0.52, 0.72], 0.75) }),
  strength({ id: "walking-lunge", name: "Walking Lunge", equipment: "Dumbbells or bodyweight", pattern: "Single-leg squat", primary: ["quads", "glutes"], secondary: ["hamstrings", "calves"], loadMode: "perHand", unilateral: true, defaultReps: 10, activeMet: 5.0, standard: ratioStandard([0.08, 0.16, 0.28, 0.42, 0.6], 0.75) }),
  strength({ id: "leg-extension", name: "Leg Extension", equipment: "Machine", pattern: "Knee extension", primary: ["quads"], defaultReps: 12, activeMet: 3.5, standard: ratioStandard([0.22, 0.38, 0.58, 0.8, 1.05], 0.75) }),
  strength({ id: "leg-curl", name: "Leg Curl", equipment: "Machine", pattern: "Knee flexion", primary: ["hamstrings"], defaultReps: 12, activeMet: 3.5, standard: ratioStandard([0.18, 0.32, 0.48, 0.68, 0.9], 0.75) }),
  strength({ id: "standing-calf-raise", name: "Standing Calf Raise", equipment: "Machine or dumbbells", pattern: "Plantar flexion", primary: ["calves"], defaultReps: 15, activeMet: 3.5, standard: ratioStandard([0.35, 0.65, 1.0, 1.4, 1.9], 0.78), aliases: ["calf raises"] }),
  strength({ id: "seated-calf-raise", name: "Seated Calf Raise", equipment: "Machine", pattern: "Plantar flexion", primary: ["calves"], defaultReps: 15, activeMet: 3.5, standard: ratioStandard([0.2, 0.38, 0.6, 0.85, 1.15], 0.78) }),
  strength({ id: "back-extension", name: "Back Extension", equipment: "Roman chair", pattern: "Hip extension", primary: ["lowerBack", "glutes"], secondary: ["hamstrings"], loadMode: "added", defaultReps: 12, activeMet: 3.5, standard: ratioStandard([0, 0.08, 0.18, 0.32, 0.5], 0.75) }),

  // Core
  bodyweight({ id: "plank", name: "Plank", pattern: "Anti-extension", primary: ["abs"], secondary: ["obliques", "glutes", "frontDelts"], thresholds: [30, 60, 90, 150, 240], defaultSets: 3, restSeconds: 60, activeMet: 2.8, timed: true }),
  bodyweight({ id: "side-plank", name: "Side Plank", pattern: "Anti-lateral flexion", primary: ["obliques"], secondary: ["abs", "glutes"], thresholds: [20, 45, 75, 120, 180], defaultSets: 3, restSeconds: 45, activeMet: 2.8, timed: true }),
  bodyweight({ id: "hanging-leg-raise", name: "Hanging Leg Raise", pattern: "Hip flexion", primary: ["abs", "hipFlexors"], secondary: ["forearms"], thresholds: [3, 8, 15, 25, 40], defaultReps: 8, activeMet: 3.8, aliases: ["hanging leg raises"] }),
  bodyweight({ id: "ab-wheel", name: "Ab Wheel Rollout", pattern: "Anti-extension", primary: ["abs"], secondary: ["lats", "frontDelts", "triceps"], thresholds: [3, 8, 15, 25, 40], defaultReps: 8, activeMet: 3.8, aliases: ["ab roller"] }),
  strength({ id: "cable-crunch", name: "Cable Crunch", equipment: "Cable", pattern: "Spinal flexion", primary: ["abs"], secondary: ["obliques"], defaultReps: 12, activeMet: 3.5, standard: ratioStandard([0.18, 0.32, 0.5, 0.72, 0.98], 0.75) }),

  // Endurance and outdoor
  activity({ id: "running", name: "Running", activityType: "running", primary: ["cardio", "quads", "glutes", "calves"], secondary: ["hamstrings", "abs"], baseMet: 9.3, speedBands: [6, 8, 10, 12, 14], fields: ["durationMin", "distanceKm", "elevationM"] }),
  activity({ id: "walking", name: "Walking", activityType: "walking", primary: ["cardio", "calves", "quads"], secondary: ["glutes"], baseMet: 3.8, speedBands: [3, 4, 5, 6, 7], fields: ["durationMin", "distanceKm", "steps", "elevationM"], aliases: ["step count"] }),
  activity({ id: "hiking", name: "Hiking", activityType: "hiking", primary: ["cardio", "quads", "glutes", "calves"], secondary: ["hamstrings", "lowerBack"], baseMet: 5.3, speedBands: [2, 3, 4, 5, 6], fields: ["durationMin", "distanceKm", "elevationM", "packKg"] }),
  activity({ id: "cycling", name: "Cycling", activityType: "cycling", primary: ["cardio", "quads", "glutes"], secondary: ["hamstrings", "calves"], baseMet: 7.0, speedBands: [10, 15, 20, 25, 32], fields: ["durationMin", "distanceKm", "elevationM"], aliases: ["biking"] }),
  activity({ id: "swimming", name: "Swimming", activityType: "swimming", primary: ["cardio", "lats", "shoulders"].filter(Boolean), secondary: ["chest", "triceps", "abs", "glutes"], baseMet: 6.0, speedBands: [1, 1.5, 2, 2.5, 3], fields: ["durationMin", "distanceKm", "stroke"] }),
  activity({ id: "rowing-machine", name: "Rowing Machine", activityType: "rowing", primary: ["cardio", "upperBack", "lats", "quads"], secondary: ["biceps", "glutes", "hamstrings"], baseMet: 7.3, speedBands: [8, 10, 12, 14, 16], fields: ["durationMin", "distanceKm", "watts"] }),
  activity({ id: "elliptical", name: "Elliptical Trainer", activityType: "elliptical", primary: ["cardio", "quads", "glutes"], secondary: ["hamstrings", "calves"], baseMet: 5.0, fields: ["durationMin", "intensity"] }),
  activity({ id: "stair-climber", name: "Stair Climber", activityType: "stairs", primary: ["cardio", "quads", "glutes", "calves"], secondary: ["hamstrings"], baseMet: 9.3, fields: ["durationMin", "floors", "intensity"] }),
  activity({ id: "jump-rope", name: "Jump Rope", activityType: "jumpRope", primary: ["cardio", "calves"], secondary: ["shoulders", "forearms", "abs"].filter(Boolean), baseMet: 11.0, fields: ["durationMin", "intensity"] }),

  // Expanded calisthenics
  bodyweight({ id: "wide-grip-pull-up", name: "Wide-Grip Pull-up", pattern: "Vertical pull", primary: ["lats", "upperBack"], secondary: ["biceps", "forearms", "abs"], thresholds: [1, 4, 8, 13, 20], defaultReps: 5, activeMet: 5.0, aliases: ["wide pull up"] }),
  bodyweight({ id: "neutral-grip-pull-up", name: "Neutral-Grip Pull-up", pattern: "Vertical pull", primary: ["lats", "biceps"], secondary: ["upperBack", "forearms"], thresholds: [1, 5, 10, 16, 24], defaultReps: 6, activeMet: 5.0 }),
  bodyweight({ id: "assisted-pull-up", name: "Assisted Pull-up", pattern: "Vertical pull", primary: ["lats", "biceps"], secondary: ["upperBack", "forearms"], thresholds: [4, 8, 14, 22, 32], defaultReps: 8, activeMet: 4.0 }),
  bodyweight({ id: "muscle-up", name: "Muscle-up", pattern: "Explosive pull/push", primary: ["lats", "chest", "triceps"], secondary: ["biceps", "upperBack", "abs"], thresholds: [1, 2, 5, 9, 15], defaultReps: 3, restSeconds: 120, activeMet: 6.0 }),
  bodyweight({ id: "inverted-row", name: "Inverted Row", pattern: "Horizontal pull", primary: ["upperBack", "lats"], secondary: ["biceps", "rearDelts", "abs"], thresholds: [5, 12, 22, 35, 50], defaultReps: 10, activeMet: 4.0, aliases: ["australian pull up"] }),
  bodyweight({ id: "pike-push-up", name: "Pike Push-up", pattern: "Vertical push", primary: ["frontDelts", "sideDelts"], secondary: ["triceps", "chest", "abs"], thresholds: [3, 8, 16, 28, 42], defaultReps: 8, activeMet: 4.6 }),
  bodyweight({ id: "handstand-push-up", name: "Handstand Push-up", pattern: "Vertical push", primary: ["frontDelts", "sideDelts", "triceps"], secondary: ["chest", "abs"], thresholds: [1, 3, 7, 12, 20], defaultReps: 4, restSeconds: 120, activeMet: 6.0 }),
  bodyweight({ id: "diamond-push-up", name: "Diamond Push-up", pattern: "Triceps push", primary: ["triceps", "chest"], secondary: ["frontDelts", "abs"], thresholds: [3, 10, 22, 36, 55], defaultReps: 10, activeMet: 4.3 }),
  bodyweight({ id: "decline-push-up", name: "Decline Push-up", pattern: "Incline bodyweight push", primary: ["chest", "frontDelts"], secondary: ["triceps", "abs"], thresholds: [5, 14, 28, 44, 62], defaultReps: 12, activeMet: 4.3 }),
  bodyweight({ id: "archer-push-up", name: "Archer Push-up", pattern: "Unilateral push", primary: ["chest", "triceps"], secondary: ["frontDelts", "abs"], thresholds: [2, 6, 12, 20, 32], defaultReps: 6, activeMet: 5.2 }),
  bodyweight({ id: "l-sit", name: "L-Sit Hold", pattern: "Compression hold", primary: ["abs", "hipFlexors"], secondary: ["triceps", "frontDelts"], thresholds: [5, 12, 25, 45, 75], defaultSets: 3, restSeconds: 60, activeMet: 3.2, timed: true }),
  bodyweight({ id: "hollow-body-hold", name: "Hollow Body Hold", pattern: "Anti-extension", primary: ["abs"], secondary: ["hipFlexors"], thresholds: [15, 30, 60, 90, 150], defaultSets: 3, restSeconds: 45, activeMet: 2.8, timed: true }),
  bodyweight({ id: "burpee", name: "Burpee", pattern: "Full-body conditioning", primary: ["cardio", "quads", "chest"], secondary: ["glutes", "calves", "triceps", "abs"], thresholds: [8, 15, 25, 40, 60], defaultReps: 10, activeMet: 8.0 }),
  bodyweight({ id: "mountain-climber", name: "Mountain Climbers", pattern: "Core conditioning", primary: ["abs", "hipFlexors", "cardio"], secondary: ["frontDelts", "quads"], thresholds: [20, 40, 70, 110, 160], defaultReps: 40, activeMet: 7.0 }),

  // Expanded gym library
  strength({ id: "machine-shoulder-press", name: "Machine Shoulder Press", equipment: "Machine", pattern: "Vertical push", primary: ["frontDelts", "sideDelts"], secondary: ["triceps"], activeMet: 4.0, standard: ratioStandard([0.22, 0.38, 0.58, 0.78, 1.0], 0.75), aliases: ["shoulder press"] }),
  strength({ id: "smith-machine-bench", name: "Smith Machine Bench Press", equipment: "Smith machine", pattern: "Horizontal push", primary: ["chest"], secondary: ["triceps", "frontDelts"], activeMet: 4.5, standard: ratioStandard([0.35, 0.58, 0.82, 1.08, 1.32]) }),
  strength({ id: "hack-squat", name: "Hack Squat", equipment: "Machine", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["hamstrings"], defaultReps: 10, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.6, 1.0, 1.55, 2.2, 3.0], 0.78) }),
  strength({ id: "smith-machine-squat", name: "Smith Machine Squat", equipment: "Smith machine", pattern: "Squat", primary: ["quads", "glutes"], secondary: ["hamstrings", "lowerBack"], defaultReps: 10, restSeconds: 120, activeMet: 5.0, standard: ratioStandard([0.5, 0.85, 1.25, 1.65, 2.1]) }),
  strength({ id: "glute-bridge", name: "Glute Bridge", equipment: "Barbell or bodyweight", pattern: "Hip extension", primary: ["glutes"], secondary: ["hamstrings", "abs"], defaultReps: 12, activeMet: 4.2, standard: ratioStandard([0.2, 0.45, 0.8, 1.15, 1.55], 0.78) }),
  strength({ id: "cable-curl", name: "Cable Curl", equipment: "Cable", pattern: "Elbow flexion", primary: ["biceps"], secondary: ["forearms"], activeMet: 3.5, standard: ratioStandard([0.1, 0.19, 0.3, 0.44, 0.6], 0.75) }),
  strength({ id: "rope-hammer-curl", name: "Rope Hammer Curl", equipment: "Cable", pattern: "Elbow flexion", primary: ["biceps", "forearms"], activeMet: 3.5, standard: ratioStandard([0.1, 0.2, 0.32, 0.46, 0.62], 0.75) }),
  strength({ id: "rear-delt-machine", name: "Rear Delt Machine", equipment: "Machine", pattern: "Rear-delt isolation", primary: ["rearDelts", "upperBack"], secondary: ["traps"], activeMet: 3.5, standard: ratioStandard([0.12, 0.22, 0.34, 0.5, 0.68], 0.75) }),
  strength({ id: "assisted-dip-machine", name: "Assisted Dip Machine", equipment: "Machine", pattern: "Vertical push", primary: ["triceps", "chest"], secondary: ["frontDelts"], activeMet: 4.0, standard: ratioStandard([0.2, 0.38, 0.58, 0.8, 1.05], 0.75) }),
  strength({ id: "cable-woodchop", name: "Cable Woodchop", equipment: "Cable", pattern: "Rotational core", primary: ["obliques", "abs"], secondary: ["lats", "frontDelts"], activeMet: 3.8, standard: ratioStandard([0.08, 0.16, 0.26, 0.4, 0.58], 0.75) }),

  // Expanded outdoor and sport activities
  activity({ id: "trail-running", name: "Trail Running", activityType: "running", primary: ["cardio", "quads", "glutes", "calves"], secondary: ["hamstrings", "abs"], baseMet: 10.5, speedBands: [5, 7, 9, 11, 13], fields: ["durationMin", "distanceKm", "elevationM"] }),
  activity({ id: "bouldering", name: "Bouldering", activityType: "climbing", primary: ["lats", "forearms", "upperBack"], secondary: ["biceps", "abs", "glutes"], baseMet: 8.0, fields: ["durationMin", "intensity"], aliases: ["climbing"] }),
  activity({ id: "soccer", name: "Soccer", activityType: "fieldSport", primary: ["cardio", "quads", "calves"], secondary: ["glutes", "hamstrings", "abs"], baseMet: 7.0, fields: ["durationMin", "intensity"] }),
  activity({ id: "basketball", name: "Basketball", activityType: "courtSport", primary: ["cardio", "quads", "calves"], secondary: ["glutes", "hamstrings", "sideDelts"], baseMet: 6.5, fields: ["durationMin", "intensity"] }),
  activity({ id: "tennis", name: "Tennis", activityType: "courtSport", primary: ["cardio", "quads", "sideDelts"], secondary: ["calves", "glutes", "forearms", "obliques"], baseMet: 7.0, fields: ["durationMin", "intensity"] }),
  activity({ id: "kayaking", name: "Kayaking", activityType: "paddling", primary: ["lats", "upperBack", "cardio"], secondary: ["biceps", "forearms", "abs", "obliques"], baseMet: 5.0, fields: ["durationMin", "distanceKm", "intensity"] }),
  activity({ id: "skiing", name: "Skiing", activityType: "winterSport", primary: ["quads", "glutes", "cardio"], secondary: ["hamstrings", "calves", "abs"], baseMet: 7.0, fields: ["durationMin", "intensity"] }),
  activity({ id: "snowboarding", name: "Snowboarding", activityType: "winterSport", primary: ["quads", "glutes", "cardio"], secondary: ["hamstrings", "calves", "abs", "obliques"], baseMet: 5.3, fields: ["durationMin", "intensity"] })
]);

// Normalize unsupported umbrella names used by a few endurance activities.
const MUSCLE_ALIASES = { shoulders: "sideDelts" };
for (const exercise of BUNDLED_EXERCISES) {
  exercise.muscles.primary = exercise.muscles.primary.map(key => MUSCLE_ALIASES[key] ?? key);
  exercise.muscles.secondary = exercise.muscles.secondary.map(key => MUSCLE_ALIASES[key] ?? key);
}

export function mergeExerciseCatalog(remote = [], custom = []) {
  const merged = new Map(BUNDLED_EXERCISES.map(exercise => [exercise.id, exercise]));
  for (const exercise of remote) {
    if (exercise?.id && exercise?.name) merged.set(exercise.id, { ...merged.get(exercise.id), ...exercise, source: "remote" });
  }
  for (const exercise of custom) {
    if (exercise?.id && exercise?.name) merged.set(exercise.id, { ...exercise, source: "custom" });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getExerciseById(id, catalog = BUNDLED_EXERCISES) {
  return catalog.find(exercise => exercise.id === id) ?? null;
}

export function searchableExerciseText(exercise) {
  return [exercise.name, exercise.equipment, exercise.pattern, ...(exercise.aliases ?? []), ...exercise.muscles.primary, ...exercise.muscles.secondary]
    .join(" ")
    .toLowerCase();
}
