import {
  collection,
  db,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from "./firebase.js";

export const DEFAULT_SETTINGS = Object.freeze({
  theme: "dark",
  accent: "cyan",
  motion: "on",
  bodyWeightKg: 72,
  heightCm: 171,
  age: 24,
  referenceSex: "male",
  statsWindowDays: 28,
  weeklySessionTarget: 3,
  weeklyMuscleTargetSets: 10,
  defaultRestSeconds: 90,
  autoStartRestTimer: true
});

export const state = {
  user: null,
  workouts: [],
  templates: [],
  customExercises: [],
  remoteExercises: [],
  settings: { ...DEFAULT_SETTINGS },
  metadata: {
    workouts: { fromCache: true, pending: false },
    templates: { fromCache: true, pending: false },
    customExercises: { fromCache: true, pending: false },
    settings: { fromCache: true, pending: false }
  },
  catalogAvailable: true
};

const listeners = new Set();
let unsubscribers = [];
let errorHandler = null;

function notify() {
  for (const listener of listeners) listener(state);
}

export function subscribeState(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function setStoreErrorHandler(handler) {
  errorHandler = handler;
}

function reportError(error) {
  console.error(error);
  errorHandler?.(error);
}

function rootDoc() {
  return doc(db, "apps", "training-track");
}

function userCollection(userId, name) {
  return collection(db, "apps", "training-track", "users", userId, name);
}

function userDoc(userId, collectionName, documentId) {
  return doc(db, "apps", "training-track", "users", userId, collectionName, documentId);
}

function catalogCollection() {
  return collection(db, "apps", "training-track", "exerciseCatalog");
}

function cleanDocument(document) {
  const data = document.data();
  return {
    id: document.id,
    ...data,
    createdAtMs: data.createdAt?.toMillis?.() ?? data.createdAtMs ?? 0,
    updatedAtMs: data.updatedAt?.toMillis?.() ?? data.updatedAtMs ?? 0,
    pending: document.metadata?.hasPendingWrites ?? false
  };
}

function setMetadata(key, snapshot) {
  state.metadata[key] = {
    fromCache: snapshot.metadata.fromCache,
    pending: snapshot.metadata.hasPendingWrites
  };
}

export function connectUserData(user) {
  disconnectUserData();
  state.user = user;

  unsubscribers.push(onSnapshot(
    userCollection(user.uid, "workouts"),
    { includeMetadataChanges: true },
    snapshot => {
      state.workouts = snapshot.docs.map(cleanDocument).sort((a, b) => `${b.date}${b.createdAtMs}`.localeCompare(`${a.date}${a.createdAtMs}`));
      setMetadata("workouts", snapshot);
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    userCollection(user.uid, "templates"),
    { includeMetadataChanges: true },
    snapshot => {
      state.templates = snapshot.docs.map(cleanDocument).sort((a, b) => a.name.localeCompare(b.name));
      setMetadata("templates", snapshot);
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    userCollection(user.uid, "customExercises"),
    { includeMetadataChanges: true },
    snapshot => {
      state.customExercises = snapshot.docs.map(cleanDocument).sort((a, b) => a.name.localeCompare(b.name));
      setMetadata("customExercises", snapshot);
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    userDoc(user.uid, "settings", "preferences"),
    { includeMetadataChanges: true },
    snapshot => {
      state.settings = { ...DEFAULT_SETTINGS, ...(snapshot.exists() ? snapshot.data() : {}) };
      state.metadata.settings = {
        fromCache: snapshot.metadata.fromCache,
        pending: snapshot.metadata.hasPendingWrites
      };
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    catalogCollection(),
    { includeMetadataChanges: true },
    snapshot => {
      state.remoteExercises = snapshot.docs.map(cleanDocument).filter(item => item.active !== false);
      state.catalogAvailable = true;
      notify();
    },
    error => {
      state.catalogAvailable = false;
      console.warn("Remote exercise catalog unavailable; bundled catalog remains active.", error);
      notify();
    }
  ));

  notify();
}

export function disconnectUserData() {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  state.user = null;
  state.workouts = [];
  state.templates = [];
  state.customExercises = [];
  state.remoteExercises = [];
  state.settings = { ...DEFAULT_SETTINGS };
  notify();
}

function requireUser() {
  if (!state.user) throw new Error("You must be signed in.");
  return state.user;
}

function workoutPayload(workout) {
  return {
    date: workout.date,
    title: workout.title || "Training session",
    durationMin: Number(workout.durationMin) || null,
    notes: workout.notes || "",
    exercises: (workout.exercises ?? []).map(entry => ({
      exerciseId: entry.exerciseId,
      restSeconds: Number(entry.restSeconds) || null,
      notes: entry.notes || "",
      sets: (entry.sets ?? []).map(set => ({
        weightKg: Number(set.weightKg) || 0,
        reps: Number(set.reps) || 0,
        seconds: Number(set.seconds) || 0,
        rir: set.rir === "" || set.rir == null ? null : Number(set.rir),
        completed: set.completed !== false
      })),
      activity: entry.activity ? {
        durationMin: Number(entry.activity.durationMin) || 0,
        distanceKm: Number(entry.activity.distanceKm) || 0,
        elevationM: Number(entry.activity.elevationM) || 0,
        steps: Number(entry.activity.steps) || 0,
        packKg: Number(entry.activity.packKg) || 0,
        watts: Number(entry.activity.watts) || 0,
        floors: Number(entry.activity.floors) || 0,
        stroke: entry.activity.stroke || "freestyle",
        intensity: entry.activity.intensity || "moderate"
      } : null
    })),
    updatedAt: serverTimestamp()
  };
}

export function saveWorkout(workout) {
  const user = requireUser();
  const id = workout.id || crypto.randomUUID();
  const data = workoutPayload(workout);
  if (!workout.id) data.createdAt = serverTimestamp();
  return setDoc(userDoc(user.uid, "workouts", id), data, { merge: true });
}

export function deleteWorkout(id) {
  const user = requireUser();
  return deleteDoc(userDoc(user.uid, "workouts", id));
}

export function saveTemplate(template) {
  const user = requireUser();
  const id = template.id || crypto.randomUUID();
  return setDoc(userDoc(user.uid, "templates", id), {
    name: template.name || "Routine",
    exercises: (template.exercises ?? []).map(entry => ({
      exerciseId: entry.exerciseId,
      restSeconds: Number(entry.restSeconds) || null,
      sets: (entry.sets ?? []).map(set => ({
        weightKg: Number(set.weightKg) || 0,
        reps: Number(set.reps) || 0,
        seconds: Number(set.seconds) || 0,
        rir: set.rir === "" || set.rir == null ? null : Number(set.rir)
      })),
      activity: entry.activity ?? null
    })),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function deleteTemplate(id) {
  const user = requireUser();
  return deleteDoc(userDoc(user.uid, "templates", id));
}

export function saveCustomExercise(exercise) {
  const user = requireUser();
  const id = exercise.id || `custom-${crypto.randomUUID()}`;
  return setDoc(userDoc(user.uid, "customExercises", id), {
    ...exercise,
    id,
    source: "custom",
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function deleteCustomExercise(id) {
  const user = requireUser();
  return deleteDoc(userDoc(user.uid, "customExercises", id));
}

export function saveSettings(settings) {
  const user = requireUser();
  return setDoc(userDoc(user.uid, "settings", "preferences"), {
    theme: settings.theme === "light" ? "light" : "dark",
    accent: ["cyan", "violet", "ember", "green"].includes(settings.accent) ? settings.accent : "cyan",
    motion: settings.motion === "off" ? "off" : "on",
    bodyWeightKg: Number(settings.bodyWeightKg),
    heightCm: Number(settings.heightCm),
    age: Number(settings.age),
    referenceSex: ["male", "female", "neutral"].includes(settings.referenceSex) ? settings.referenceSex : "neutral",
    statsWindowDays: Number(settings.statsWindowDays),
    weeklySessionTarget: Number(settings.weeklySessionTarget),
    weeklyMuscleTargetSets: Number(settings.weeklyMuscleTargetSets),
    defaultRestSeconds: Number(settings.defaultRestSeconds),
    autoStartRestTimer: Boolean(settings.autoStartRestTimer),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export function hasPendingWrites() {
  return Object.values(state.metadata).some(metadata => metadata.pending);
}

export function isUsingCacheOnly() {
  return [state.metadata.workouts, state.metadata.templates, state.metadata.customExercises]
    .every(metadata => metadata.fromCache);
}

export function exportState() {
  return {
    format: "training-track-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings },
    workouts: state.workouts.map(({ pending, createdAt, updatedAt, ...workout }) => workout),
    templates: state.templates.map(({ pending, createdAt, updatedAt, ...template }) => template),
    customExercises: state.customExercises.map(({ pending, createdAt, updatedAt, ...exercise }) => exercise)
  };
}

export async function importState(backup) {
  const user = requireUser();
  if (!backup || backup.format !== "training-track-backup") throw new Error("This is not a Training Track backup.");
  const operations = [];
  for (const workout of backup.workouts ?? []) {
    const id = workout.id || crypto.randomUUID();
    operations.push({ ref: userDoc(user.uid, "workouts", id), data: { ...workoutPayload(workout), createdAt: serverTimestamp() } });
  }
  for (const template of backup.templates ?? []) {
    const id = template.id || crypto.randomUUID();
    operations.push({ ref: userDoc(user.uid, "templates", id), data: { ...template, updatedAt: serverTimestamp() } });
  }
  for (const exercise of backup.customExercises ?? []) {
    const id = exercise.id || `custom-${crypto.randomUUID()}`;
    operations.push({ ref: userDoc(user.uid, "customExercises", id), data: { ...exercise, id, updatedAt: serverTimestamp() } });
  }
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) batch.set(operation.ref, operation.data, { merge: true });
    await batch.commit();
  }
  if (backup.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
}
