import {
  collection,
  db,
  deleteDoc,
  doc,
  getDocFromCache,
  getDocFromServer,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
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
  birthYear: new Date().getFullYear() - 24,
  referenceSex: "male",
  statsWindowDays: 28,
  historyViewMode: "month",
  showRir: false,
  weeklySessionTarget: 3,
  weeklyMuscleTargetSets: 10,
  defaultRestSeconds: 90,
  autoStartRestTimer: false
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

const USER_COLLECTIONS = ["workouts", "templates", "customExercises"];

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

function currentYear() {
  return new Date().getFullYear();
}

function normalizeBirthYear(settings = {}) {
  const fromBirthYear = Number(settings.birthYear);
  if (Number.isFinite(fromBirthYear) && fromBirthYear >= 1900 && fromBirthYear <= currentYear()) return Math.round(fromBirthYear);
  const fromAge = Number(settings.age);
  if (Number.isFinite(fromAge) && fromAge > 0) return currentYear() - Math.round(fromAge);
  return DEFAULT_SETTINGS.birthYear;
}

function normalizeSettings(settings = {}) {
  const birthYear = normalizeBirthYear(settings);
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    birthYear,
    age: Math.max(0, currentYear() - birthYear),
    historyViewMode: settings.historyViewMode === "year" ? "year" : "month",
    showRir: Boolean(settings.showRir),
    autoStartRestTimer: false
  };
}

function settingsPayload(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    theme: normalized.theme === "light" ? "light" : "dark",
    accent: ["cyan", "violet", "ember", "green"].includes(normalized.accent) ? normalized.accent : "cyan",
    motion: normalized.motion === "off" ? "off" : "on",
    bodyWeightKg: Number(normalized.bodyWeightKg),
    heightCm: Number(normalized.heightCm),
    birthYear: normalizeBirthYear(normalized),
    referenceSex: ["male", "female", "neutral"].includes(normalized.referenceSex) ? normalized.referenceSex : "neutral",
    statsWindowDays: Number(normalized.statsWindowDays),
    historyViewMode: normalized.historyViewMode === "year" ? "year" : "month",
    showRir: Boolean(normalized.showRir),
    weeklySessionTarget: Number(normalized.weeklySessionTarget),
    weeklyMuscleTargetSets: Number(normalized.weeklyMuscleTargetSets),
    defaultRestSeconds: Number(normalized.defaultRestSeconds) || DEFAULT_SETTINGS.defaultRestSeconds,
    autoStartRestTimer: false,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
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
      state.settings = normalizeSettings(snapshot.exists() ? snapshot.data() : {});
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
  state.settings = normalizeSettings();
  notify();
}

function requireUser() {
  if (!state.user) throw new Error("You must be signed in.");
  return state.user;
}

function workoutPayload(workout) {
  const updatedAtMs = Date.now();
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
    updatedAt: serverTimestamp(),
    updatedAtMs
  };
}

export function saveWorkout(workout) {
  const user = requireUser();
  const id = workout.id || crypto.randomUUID();
  const data = workoutPayload(workout);
  if (!workout.id) {
    data.createdAt = serverTimestamp();
    data.createdAtMs = Date.now();
  }
  return setDoc(userDoc(user.uid, "workouts", id), data, { merge: true });
}

export function deleteWorkout(id) {
  const user = requireUser();
  return deleteDoc(userDoc(user.uid, "workouts", id));
}

export function saveCustomExercise(exercise) {
  const user = requireUser();
  const id = exercise.id || `custom-${crypto.randomUUID()}`;
  return setDoc(userDoc(user.uid, "customExercises", id), {
    ...exercise,
    id,
    source: "custom",
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  }, { merge: true });
}

export function deleteCustomExercise(id) {
  const user = requireUser();
  return deleteDoc(userDoc(user.uid, "customExercises", id));
}

export function saveSettings(settings) {
  const user = requireUser();
  return setDoc(userDoc(user.uid, "settings", "preferences"), settingsPayload(settings), { merge: true });
}

export function hasPendingWrites() {
  return Object.values(state.metadata).some(metadata => metadata.pending);
}

export function isUsingCacheOnly() {
  return [state.metadata.workouts, state.metadata.templates, state.metadata.customExercises]
    .every(metadata => metadata.fromCache);
}

function metadataScore(item) {
  return Number(item?.updatedAtMs || item?.createdAtMs || 0);
}

function stripDocumentMeta(item = {}) {
  const { pending, createdAt, updatedAt, ...data } = item;
  return data;
}

function collectionSignature(items = []) {
  return items
    .map(item => `${item.id}:${metadataScore(item)}:${item.date ?? item.name ?? ""}`)
    .sort()
    .join("|");
}

function settingsSignature(settings) {
  if (!settings) return "";
  const normalized = normalizeSettings(settings);
  return `${normalized.updatedAtMs || 0}:${normalized.bodyWeightKg}:${normalized.heightCm}:${normalized.birthYear}:${normalized.historyViewMode}:${normalized.showRir}`;
}

async function readCollection(user, name, source) {
  const reader = source === "cache" ? getDocsFromCache : source === "server" ? getDocsFromServer : getDocs;
  try {
    const snapshot = await reader(userCollection(user.uid, name));
    return snapshot.docs.map(cleanDocument);
  } catch (error) {
    if (source === "cache") return [];
    throw error;
  }
}

async function readSettings(user, source) {
  const reader = source === "cache" ? getDocFromCache : getDocFromServer;
  try {
    const snapshot = await reader(userDoc(user.uid, "settings", "preferences"));
    return snapshot.exists() ? cleanDocument(snapshot) : null;
  } catch (error) {
    if (source === "cache") return null;
    throw error;
  }
}

async function readUserBundle(user, source) {
  const [workouts, templates, customExercises, settings] = await Promise.all([
    readCollection(user, "workouts", source),
    readCollection(user, "templates", source),
    readCollection(user, "customExercises", source),
    readSettings(user, source)
  ]);
  return { workouts, templates, customExercises, settings };
}

function mergeByNewest(localItems = [], cloudItems = []) {
  const merged = new Map();
  for (const item of cloudItems) merged.set(item.id, item);
  for (const item of localItems) {
    const existing = merged.get(item.id);
    if (!existing || metadataScore(item) >= metadataScore(existing)) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function mergeSettings(localSettings, cloudSettings) {
  if (!localSettings) return cloudSettings;
  if (!cloudSettings) return localSettings;
  return metadataScore(localSettings) >= metadataScore(cloudSettings) ? localSettings : cloudSettings;
}

function bundleCounts(bundle) {
  return {
    workouts: bundle.workouts.length,
    customExercises: bundle.customExercises.length,
    templates: bundle.templates.length,
    settings: bundle.settings ? 1 : 0
  };
}

function bundleDiffers(local, cloud) {
  return collectionSignature(local.workouts) !== collectionSignature(cloud.workouts)
    || collectionSignature(local.customExercises) !== collectionSignature(cloud.customExercises)
    || settingsSignature(local.settings) !== settingsSignature(cloud.settings);
}

async function writeUserBundle(user, bundle) {
  const operations = [];
  for (const workout of bundle.workouts ?? []) {
    const id = workout.id || crypto.randomUUID();
    const createdAtMs = Number(workout.createdAtMs) || Date.now();
    operations.push({
      type: "set",
      ref: userDoc(user.uid, "workouts", id),
      data: { ...workoutPayload(stripDocumentMeta(workout)), createdAtMs, updatedAtMs: Date.now() }
    });
  }
  for (const exercise of bundle.customExercises ?? []) {
    const id = exercise.id || `custom-${crypto.randomUUID()}`;
    operations.push({
      type: "set",
      ref: userDoc(user.uid, "customExercises", id),
      data: { ...stripDocumentMeta(exercise), id, source: "custom", updatedAt: serverTimestamp(), updatedAtMs: Date.now() }
    });
  }
  if (bundle.settings) {
    operations.push({
      type: "set",
      ref: userDoc(user.uid, "settings", "preferences"),
      data: settingsPayload(bundle.settings)
    });
  }
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      batch.set(operation.ref, operation.data, { merge: true });
    }
    await batch.commit();
  }
}

export async function getSyncSummary() {
  const user = requireUser();
  const [local, cloud] = await Promise.all([
    readUserBundle(user, "cache"),
    readUserBundle(user, "server")
  ]);
  return {
    local: bundleCounts(local),
    cloud: bundleCounts(cloud),
    differs: bundleDiffers(local, cloud),
    hasLocal: local.workouts.length > 0 || local.customExercises.length > 0 || Boolean(local.settings)
  };
}

export async function resolveSyncChoice(mode) {
  const user = requireUser();
  if (mode === "cloud") {
    await Promise.all([
      readCollection(user, "workouts", "server"),
      readCollection(user, "customExercises", "server"),
      readSettings(user, "server")
    ]);
    notify();
    return;
  }

  const local = await readUserBundle(user, "cache");
  const bundle = mode === "device"
    ? local
    : (() => {
        return readUserBundle(user, "server").then(cloud => ({
          workouts: mergeByNewest(local.workouts, cloud.workouts),
          templates: [],
          customExercises: mergeByNewest(local.customExercises, cloud.customExercises),
          settings: mergeSettings(local.settings, cloud.settings)
        }));
      })();
  await writeUserBundle(user, await bundle);
}

export async function resetAllData() {
  const user = requireUser();
  const operations = [{ ref: userDoc(user.uid, "settings", "preferences") }];
  for (const name of USER_COLLECTIONS) {
    const snapshot = await getDocs(userCollection(user.uid, name));
    for (const document of snapshot.docs) operations.push({ ref: document.ref });
  }
  for (let index = 0; index < operations.length; index += 400) {
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) batch.delete(operation.ref);
    await batch.commit();
  }
}

export function exportState() {
  return {
    format: "training-track-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: { ...state.settings },
    workouts: state.workouts.map(({ pending, createdAt, updatedAt, ...workout }) => workout),
    customExercises: state.customExercises.map(({ pending, createdAt, updatedAt, ...exercise }) => exercise)
  };
}

export async function importState(backup) {
  const user = requireUser();
  if (!backup || backup.format !== "training-track-backup") throw new Error("This is not an Ascend backup.");
  const operations = [];
  for (const workout of backup.workouts ?? []) {
    const id = workout.id || crypto.randomUUID();
    operations.push({ ref: userDoc(user.uid, "workouts", id), data: { ...workoutPayload(workout), createdAt: serverTimestamp() } });
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
