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
  motion: "on",
  bodyWeightKg: 72,
  heightCm: 171,
  birthYear: new Date().getFullYear() - 24,
  referenceSex: "male",
  statsWindowDays: 28,
  bodyWindowDays: 14,
  bodySortMode: "least",
  historyViewMode: "month",
  showRir: false,
  showDurationPrompt: true,
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
  metadata: initialMetadata(),
  catalogAvailable: true
};

const listeners = new Set();
let unsubscribers = [];
let errorHandler = null;
// Retain offline edits while live snapshots arrive, until the sync choice resolves.
let protectedDeviceBundle = null;
let initializedSnapshots = new Set();

const USER_COLLECTIONS = ["workouts", "templates", "customExercises"];
const LOCAL_USER_KEY = "ascend:last-user";
const LOCAL_DATA_PREFIX = "ascend:user-data:";

function initialMetadata() {
  return {
    workouts: { fromCache: true, pending: false },
    customExercises: { fromCache: true, pending: false },
    settings: { fromCache: true, pending: false }
  };
}

function resetMetadata() {
  state.metadata = initialMetadata();
}

function canUseLocalStorage() {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readJson(key, fallback = null) {
  if (!canUseLocalStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Local cache write failed", error);
  }
}

function removeJson(key) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore local cleanup failures.
  }
}

function localDataKey(userId) {
  return `${LOCAL_DATA_PREFIX}${userId}`;
}

function sortWorkouts(workouts = []) {
  return [...workouts].sort((a, b) => `${b.date}${b.createdAtMs ?? 0}`.localeCompare(`${a.date}${a.createdAtMs ?? 0}`));
}

function sortCustomExercises(exercises = []) {
  return [...exercises].sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function bundleFromState() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    workouts: state.workouts.map(stripDocumentMeta),
    customExercises: state.customExercises.map(stripDocumentMeta),
    settings: stripDocumentMeta(state.settings)
  };
}

function normalizeBundle(bundle = {}) {
  if (!bundle || typeof bundle !== "object") bundle = {};
  return {
    pendingLocal: bundle.pendingLocal === true,
    workouts: sortWorkouts((Array.isArray(bundle.workouts) ? bundle.workouts : []).filter(item => item && typeof item.date === "string").map(stripDocumentMeta)),
    templates: [],
    customExercises: sortCustomExercises((Array.isArray(bundle.customExercises) ? bundle.customExercises : []).filter(item => item && typeof item.name === "string").map(stripDocumentMeta)),
    settings: bundle.settings ? normalizeSettings(bundle.settings) : null
  };
}

function cacheUserProfile(user) {
  if (!user?.uid) return;
  writeJson(LOCAL_USER_KEY, {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    cachedAt: new Date().toISOString()
  });
}

export function getCachedUserProfile(email = "") {
  const profile = readJson(LOCAL_USER_KEY, null);
  if (!profile?.uid) return null;
  if (email && profile.email && profile.email.toLowerCase() !== email.toLowerCase()) return null;
  return profile;
}

function readLocalBundle(userId) {
  return normalizeBundle(readJson(localDataKey(userId), {}));
}

function writeLocalBundle(userId, bundle) {
  if (!userId) return;
  writeJson(localDataKey(userId), normalizeBundle(bundle));
}

function mirrorStateToLocal() {
  if (!state.user?.uid) return;
  if (protectedDeviceBundle) return;
  // Do not let an early, partial cache snapshot erase the local recovery copy.
  if (!isOfflineUser() && initializedSnapshots.size < 3 && !hasPendingWrites()) return;
  if (!isOfflineUser() && isUsingCacheOnly() && !hasPendingWrites()) return;
  writeLocalBundle(state.user.uid, { ...bundleFromState(), pendingLocal: hasPendingWrites() });
}

function hydrateFromBundle(bundle) {
  const normalized = normalizeBundle(bundle);
  state.workouts = normalized.workouts;
  state.customExercises = normalized.customExercises;
  if (normalized.settings) state.settings = normalizeSettings(normalized.settings);
}

function markLocalPending(key = null) {
  const targets = key ? [key] : Object.keys(state.metadata);
  for (const target of targets) state.metadata[target] = { fromCache: true, pending: true };
}

function persistLocalMutation(key, removedId = null) {
  if (!protectedDeviceBundle) { mirrorStateToLocal(); return; }
  if (key === "settings") protectedDeviceBundle.settings = stripDocumentMeta(state.settings);
  else protectedDeviceBundle[key] = mergeByNewest(state[key], protectedDeviceBundle[key])
    .filter(item => item.id !== removedId);
  protectedDeviceBundle.pendingLocal = true;
  writeLocalBundle(state.user.uid, protectedDeviceBundle);
}

function isOfflineUser(user = state.user) {
  return Boolean(user?.offlineOnly);
}

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
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
  const birthYear = normalizeBirthYear(settings);
  const bounded = (key, min, max) => {
    const value = Number(settings[key]);
    return Number.isFinite(value) && value >= min && value <= max ? value : DEFAULT_SETTINGS[key];
  };
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    birthYear,
    age: Math.max(0, currentYear() - birthYear),
    bodyWeightKg: bounded("bodyWeightKg", 20, 400),
    heightCm: bounded("heightCm", 120, 230),
    weeklySessionTarget: bounded("weeklySessionTarget", 1, 14),
    weeklyMuscleTargetSets: bounded("weeklyMuscleTargetSets", 1, 40),
    statsWindowDays: Math.round(bounded("statsWindowDays", 7, 730)),
    bodyWindowDays: Math.round(bounded("bodyWindowDays", 7, 365)),
    bodySortMode: settings.bodySortMode === "most" ? "most" : "least",
    historyViewMode: settings.historyViewMode === "year" ? "year" : "month",
    showRir: Boolean(settings.showRir),
    showDurationPrompt: settings.showDurationPrompt !== false,
    autoStartRestTimer: false
  };
}

function settingsPayload(settings = {}) {
  const normalized = normalizeSettings(settings);
  return {
    theme: normalized.theme === "light" ? "light" : "dark",
    motion: ["off", "subtle", "on"].includes(normalized.motion) ? normalized.motion : "on",
    bodyWeightKg: Number(normalized.bodyWeightKg),
    heightCm: Number(normalized.heightCm),
    birthYear: normalizeBirthYear(normalized),
    referenceSex: ["male", "female", "neutral"].includes(normalized.referenceSex) ? normalized.referenceSex : "neutral",
    statsWindowDays: Number(normalized.statsWindowDays),
    bodyWindowDays: Number(normalized.bodyWindowDays),
    bodySortMode: normalized.bodySortMode === "most" ? "most" : "least",
    historyViewMode: normalized.historyViewMode === "year" ? "year" : "month",
    showRir: Boolean(normalized.showRir),
    showDurationPrompt: normalized.showDurationPrompt !== false,
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
  resetMetadata();
  cacheUserProfile(user);
  const deviceBundle = readLocalBundle(user.uid);
  protectedDeviceBundle = deviceBundle.pendingLocal ? deviceBundle : null;
  hydrateFromBundle(deviceBundle);
  notify();

  unsubscribers.push(onSnapshot(
    userCollection(user.uid, "workouts"),
    { includeMetadataChanges: true },
    snapshot => {
      if (state.user !== user) return;
      if (!snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || snapshot.docs.length || !state.workouts.length) state.workouts = sortWorkouts(snapshot.docs.map(cleanDocument));
      initializedSnapshots.add("workouts");
      setMetadata("workouts", snapshot);
      mirrorStateToLocal();
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    userCollection(user.uid, "customExercises"),
    { includeMetadataChanges: true },
    snapshot => {
      if (state.user !== user) return;
      if (!snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites || snapshot.docs.length || !state.customExercises.length) state.customExercises = sortCustomExercises(snapshot.docs.map(cleanDocument));
      initializedSnapshots.add("customExercises");
      setMetadata("customExercises", snapshot);
      mirrorStateToLocal();
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    userDoc(user.uid, "settings", "preferences"),
    { includeMetadataChanges: true },
    snapshot => {
      if (state.user !== user) return;
      if (snapshot.exists() || !snapshot.metadata.fromCache) state.settings = normalizeSettings(snapshot.exists() ? snapshot.data() : {});
      initializedSnapshots.add("settings");
      state.metadata.settings = {
        fromCache: snapshot.metadata.fromCache,
        pending: snapshot.metadata.hasPendingWrites
      };
      mirrorStateToLocal();
      notify();
    },
    reportError
  ));

  unsubscribers.push(onSnapshot(
    catalogCollection(),
    { includeMetadataChanges: true },
    snapshot => {
      if (state.user !== user) return;
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

export function connectOfflineUserData(profile) {
  disconnectUserData();
  if (!profile?.uid) throw new Error("No cached offline user is available.");
  state.user = { uid: profile.uid, email: profile.email ?? "", displayName: profile.displayName ?? "", offlineOnly: true };
  resetMetadata();
  hydrateFromBundle(readLocalBundle(profile.uid));
  notify();
}

export function disconnectUserData() {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  protectedDeviceBundle = null;
  initializedSnapshots = new Set();
  state.user = null;
  state.workouts = [];
  state.templates = [];
  state.customExercises = [];
  state.remoteExercises = [];
  state.settings = normalizeSettings();
  resetMetadata();
  notify();
}

function requireUser() {
  if (!state.user) throw new Error("You must be signed in.");
  return state.user;
}

function assertCurrentUser(user) {
  if (state.user !== user) throw new Error("The signed-in account changed. Please try again.");
}

function workoutPayload(workout) {
  const updatedAtMs = Date.now();
  return {
    date: workout.date,
    title: workout.title || "Training session",
    durationMin: Number(workout.durationMin) || null,
    bodyWeightKg: Number(workout.bodyWeightKg) >= 20 ? Number(workout.bodyWeightKg) : null,
    notes: workout.notes || "",
    exercises: (workout.exercises ?? []).map(entry => ({
      exerciseId: entry.exerciseId,
      restSeconds: entry.restSeconds == null || entry.restSeconds === "" ? null : Math.max(0, Number(entry.restSeconds) || 0),
      durationMin: Number(entry.durationMin) > 0 ? Number(entry.durationMin) : null,
      repSeconds: Number(entry.repSeconds) > 0 ? Number(entry.repSeconds) : null,
      trackCompletion: entry.trackCompletion === true,
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
        inclinePercent: Number(entry.activity.inclinePercent) || 0,
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

function localWorkoutDocument(id, workout) {
  const data = workoutPayload(workout);
  const createdAtMs = Number(workout.createdAtMs) || state.workouts.find(item => item.id === id)?.createdAtMs || Date.now();
  const { createdAt, updatedAt, ...local } = data;
  return {
    ...local,
    id,
    createdAtMs: workout.id ? (Number(workout.createdAtMs) || createdAtMs) : createdAtMs,
    updatedAtMs: data.updatedAtMs
  };
}

function saveLocalWorkout(user, workout) {
  const id = workout.id || crypto.randomUUID();
  const document = localWorkoutDocument(id, workout);
  const existing = state.workouts.filter(item => item.id !== id);
  state.workouts = sortWorkouts([...existing, document]);
  markLocalPending("workouts");
  persistLocalMutation("workouts");
  notify();
}

export function saveWorkout(workout) {
  const user = requireUser();
  if (isOfflineUser(user)) {
    saveLocalWorkout(user, workout);
    return Promise.resolve();
  }
  const id = workout.id || crypto.randomUUID();
  saveLocalWorkout(user, { ...workout, id });
  const data = workoutPayload(workout);
  if (!workout.id) {
    data.createdAt = serverTimestamp();
    data.createdAtMs = Date.now();
  }
  return setDoc(userDoc(user.uid, "workouts", id), data, { merge: true });
}

export function deleteWorkout(id) {
  const user = requireUser();
  if (isOfflineUser(user)) {
    state.workouts = state.workouts.filter(workout => workout.id !== id);
    markLocalPending("workouts");
    persistLocalMutation("workouts", id);
    notify();
    return Promise.resolve();
  }
  return deleteDoc(userDoc(user.uid, "workouts", id));
}

export function saveCustomExercise(exercise) {
  const user = requireUser();
  const id = exercise.id || `custom-${crypto.randomUUID()}`;
  if (isOfflineUser(user)) {
    const document = { ...stripDocumentMeta(exercise), id, source: "custom", updatedAtMs: Date.now() };
    state.customExercises = sortCustomExercises([...state.customExercises.filter(item => item.id !== id), document]);
    markLocalPending("customExercises");
    persistLocalMutation("customExercises");
    notify();
    return Promise.resolve();
  }
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
  if (isOfflineUser(user)) {
    state.customExercises = state.customExercises.filter(exercise => exercise.id !== id);
    markLocalPending("customExercises");
    persistLocalMutation("customExercises", id);
    notify();
    return Promise.resolve();
  }
  return deleteDoc(userDoc(user.uid, "customExercises", id));
}

export function saveSettings(settings) {
  const user = requireUser();
  if (isOfflineUser(user)) {
    const { updatedAt, ...localSettings } = settingsPayload(settings);
    state.settings = normalizeSettings(localSettings);
    markLocalPending("settings");
    persistLocalMutation("settings");
    notify();
    return Promise.resolve();
  }
  return setDoc(userDoc(user.uid, "settings", "preferences"), settingsPayload(settings), { merge: true });
}

export function hasPendingWrites() {
  return Object.values(state.metadata).some(metadata => metadata.pending);
}

export function isUsingCacheOnly() {
  return [state.metadata.workouts, state.metadata.customExercises, state.metadata.settings]
    .every(metadata => metadata?.fromCache);
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
    .map(item => {
      const { createdAtMs, updatedAtMs, ...content } = stripDocumentMeta(item);
      return JSON.stringify(canonicalValue(content));
    })
    .sort()
    .join("|");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
  return value;
}

function settingsSignature(settings) {
  if (!settings) return "";
  const normalized = normalizeSettings(settings);
  return JSON.stringify(Object.keys(DEFAULT_SETTINGS).sort().map(key => [key, normalized[key]]));
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
  const [workouts, customExercises, settings] = await Promise.all([
    readCollection(user, "workouts", source),
    readCollection(user, "customExercises", source),
    readSettings(user, source)
  ]);
  return { workouts, templates: [], customExercises, settings };
}

async function readDeviceBundle(user) {
  // A pending device bundle is authoritative for this device, including removals.
  if (protectedDeviceBundle) return normalizeBundle(protectedDeviceBundle);
  const [cacheBundle, localBundle] = await Promise.all([
    readUserBundle(user, "cache"),
    Promise.resolve(protectedDeviceBundle ?? readLocalBundle(user.uid))
  ]);
  return {
    workouts: mergeByNewest(localBundle.workouts, cacheBundle.workouts),
    templates: [],
    customExercises: mergeByNewest(localBundle.customExercises, cacheBundle.customExercises),
    settings: mergeSettings(localBundle.settings, cacheBundle.settings)
  };
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
    settings: bundle.settings ? 1 : 0
  };
}

function bundleDiffers(local, cloud) {
  return collectionSignature(local.workouts) !== collectionSignature(cloud.workouts)
    || collectionSignature(local.customExercises) !== collectionSignature(cloud.customExercises)
    || settingsSignature(local.settings) !== settingsSignature(cloud.settings);
}

async function writeUserBundle(user, bundle) {
  assertCurrentUser(user);
  if (isOfflineUser(user)) {
    hydrateFromBundle(bundle);
    markLocalPending();
    mirrorStateToLocal();
    notify();
    return;
  }
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
    assertCurrentUser(user);
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) {
      batch.set(operation.ref, operation.data, { merge: true });
    }
    await batch.commit();
  }
  assertCurrentUser(user);
  protectedDeviceBundle = null;
  writeLocalBundle(user.uid, { ...bundle, pendingLocal: false });
}

export async function getSyncSummary() {
  const user = requireUser();
  const [local, cloud] = await Promise.all([
    readDeviceBundle(user),
    isOfflineUser(user) ? Promise.resolve({ workouts: [], templates: [], customExercises: [], settings: null }) : readUserBundle(user, "server")
  ]);
  const differs = bundleDiffers(local, cloud);
  assertCurrentUser(user);
  if (!differs && protectedDeviceBundle) {
    protectedDeviceBundle = null;
    writeLocalBundle(user.uid, cloud);
  }
  return {
    local: bundleCounts(local),
    cloud: bundleCounts(cloud),
    differs,
    hasLocal: local.workouts.length > 0 || local.customExercises.length > 0 || Boolean(local.settings)
  };
}

export async function resolveSyncChoice(mode) {
  const user = requireUser();
  if (isOfflineUser(user) && mode !== "device") throw new Error("Reconnect and sign in online before fetching cloud data.");
  if (mode === "cloud") {
    const cloud = await readUserBundle(user, "server");
    assertCurrentUser(user);
    protectedDeviceBundle = null;
    state.workouts = sortWorkouts(cloud.workouts);
    state.customExercises = sortCustomExercises(cloud.customExercises);
    state.settings = normalizeSettings(cloud.settings ?? {});
    state.metadata.workouts = { fromCache: false, pending: false };
    state.metadata.customExercises = { fromCache: false, pending: false };
    state.metadata.settings = { fromCache: false, pending: false };
    writeLocalBundle(user.uid, { ...bundleFromState(), pendingLocal: false });
    notify();
    return;
  }

  const local = await readDeviceBundle(user);
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
  if (isOfflineUser(user)) {
    state.workouts = [];
    state.templates = [];
    state.customExercises = [];
    state.settings = normalizeSettings();
    resetMetadata();
    removeJson(localDataKey(user.uid));
    notify();
    return;
  }
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
  removeJson(localDataKey(user.uid));
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
  if ((backup.workouts != null && !Array.isArray(backup.workouts)) || (backup.customExercises != null && !Array.isArray(backup.customExercises))) throw new Error("Backup workouts and custom exercises must be lists.");
  for (const workout of backup.workouts ?? []) {
    const date = typeof workout?.date === "string" ? workout.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || !Array.isArray(workout.exercises)) throw new Error("Backup contains an invalid workout date or exercise list.");
    if ([workout.bodyWeightKg, workout.durationMin].some(value => value != null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) throw new Error("Backup contains an invalid training measurement.");
    for (const entry of workout.exercises) {
      if (!entry || typeof entry.exerciseId !== "string" || (entry.sets != null && !Array.isArray(entry.sets))) throw new Error("Backup contains an invalid exercise entry.");
      const numericValues = [workout.bodyWeightKg, workout.durationMin, entry.restSeconds, entry.durationMin, entry.repSeconds];
      for (const set of entry.sets ?? []) {
        if (!set || typeof set !== "object") throw new Error("Backup contains an invalid set.");
        numericValues.push(set.weightKg, set.reps, set.seconds, set.rir);
      }
      for (const field of ["durationMin", "distanceKm", "elevationM", "inclinePercent", "steps", "packKg", "watts", "floors"]) numericValues.push(entry.activity?.[field]);
      if (numericValues.some(value => value != null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0))) throw new Error("Backup contains an invalid training measurement.");
    }
  }
  if ((backup.customExercises ?? []).some(exercise => !exercise || typeof exercise.name !== "string")) throw new Error("Backup contains an invalid custom exercise.");
  // Assign stable IDs before merging: Map(undefined) used to collapse imports.
  const workouts = (backup.workouts ?? []).map(workout => ({ ...workout, id: workout.id || crypto.randomUUID() }));
  const customExercises = (backup.customExercises ?? []).map(exercise => ({ ...exercise, id: exercise.id || `custom-${crypto.randomUUID()}`, source: "custom" }));
  if ([...workouts, ...customExercises].some(item => typeof item.id !== "string" || item.id.includes("/") || item.id === "." || item.id === "..")) throw new Error("Backup contains an invalid record ID.");
  if (isOfflineUser(user)) {
    hydrateFromBundle({
      workouts: mergeByNewest(workouts.map(workout => localWorkoutDocument(workout.id, workout)), state.workouts),
      customExercises: mergeByNewest(customExercises, state.customExercises),
      settings: backup.settings ? normalizeSettings({ ...DEFAULT_SETTINGS, ...backup.settings }) : state.settings
    });
    markLocalPending();
    mirrorStateToLocal();
    notify();
    return;
  }
  const operations = [];
  for (const workout of workouts) {
    const id = workout.id || crypto.randomUUID();
    operations.push({ ref: userDoc(user.uid, "workouts", id), data: { ...workoutPayload(workout), createdAtMs: Number(workout.createdAtMs) || Date.now() } });
  }
  for (const exercise of customExercises) {
    const id = exercise.id || `custom-${crypto.randomUUID()}`;
    operations.push({ ref: userDoc(user.uid, "customExercises", id), data: { ...exercise, id, updatedAt: serverTimestamp() } });
  }
  for (let index = 0; index < operations.length; index += 400) {
    assertCurrentUser(user);
    const batch = writeBatch(db);
    for (const operation of operations.slice(index, index + 400)) batch.set(operation.ref, operation.data, { merge: true });
    await batch.commit();
  }
  assertCurrentUser(user);
  if (backup.settings) await saveSettings({ ...DEFAULT_SETTINGS, ...backup.settings });
  mirrorStateToLocal();
}
