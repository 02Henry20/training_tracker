import {
  auth,
  initializeAuthPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "./firebase.js";
import {
  DEFAULT_SETTINGS,
  connectOfflineUserData,
  connectUserData,
  deleteWorkout,
  disconnectUserData,
  exportState,
  getCachedUserProfile,
  getSyncSummary,
  hasPendingWrites,
  importState,
  isUsingCacheOnly,
  resetAllData,
  resolveSyncChoice,
  saveSettings,
  saveWorkout,
  setStoreErrorHandler,
  state,
  subscribeState
} from "./store.js";
import {
  BUNDLED_EXERCISES,
  LEVELS,
  MUSCLE_GROUPS,
  getExerciseById,
  mergeExerciseCatalog,
  searchableExerciseText
} from "./exercises.js";
import {
  addDays,
  analyseExerciseEntry,
  buildWorkoutAnalyses,
  calculateProgression,
  calendarIntensity,
  consistencyStreak,
  daysBetween,
  detectPersonalRecords,
  evaluateExerciseLevel,
  formatDate,
  localDateString,
  muscleBalance,
  parseDate,
  PLAYER_RANKS,
  startOfMonth,
  startOfWeek,
  statistics,
  suggestedFocus,
  xpForLevel,
  xpSummary
} from "./calculations.js";
import { drawDonut, drawLineChart, drawWeeklyBars, redrawOnResize } from "./charts.js";

const APP_VERSION = "0.2.5";
const VIEW_META = {
  dashboard: ["LIVE LOG", "Overview"],
  workout: ["SESSION BUILD", "Session"],
  stats: ["PROGRESS / HISTORY", "Progress"],
  muscles: ["LOAD BALANCE", "Balance"],
  settings: ["SYSTEM", "Setup"]
};

const elements = {
  authShell: document.querySelector("#auth-shell"),
  appShell: document.querySelector("#app-shell"),
  bootStatus: document.querySelector("#boot-status"),
  bootText: document.querySelector("#boot-text"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  authSubmit: document.querySelector("#auth-submit"),
  authTitle: document.querySelector("#auth-title"),
  authSubtitle: document.querySelector("#auth-subtitle"),
  authMessage: document.querySelector("#auth-message"),
  signOut: document.querySelector("#sign-out"),
  userChip: document.querySelector("#user-chip"),
  syncPill: document.querySelector("#sync-pill"),
  syncLabel: document.querySelector("#sync-label"),
  syncDetail: document.querySelector("#sync-detail"),
  viewKicker: document.querySelector("#view-kicker"),
  viewTitle: document.querySelector("#view-title"),
  modalBackdrop: document.querySelector("#modal-backdrop"),
  toastContainer: document.querySelector("#toast-container"),
  builderList: document.querySelector("#exercise-builder-list"),
  builderEmpty: document.querySelector("#builder-empty")
};

let activeView = "dashboard";
let activeModal = null;
let confirmationResolver = null;
let durationResolver = null;
let pickerFilter = "recommended";
let calendarMonth = startOfMonth(localDateString());
let selectedCalendarDate = localDateString();
let selectedHistoryMonth = localDateString().slice(0, 7);
let draftWorkout = createEmptyDraft();
let renderQueued = false;
let lastCatalogSignature = "";
let statsWindowInitialized = false;
let offlineAuthActive = false;
let selectedProgressExerciseId = "";
let selectedProgressMetric = "level";
let progressSearchQuery = "";
let bodyViewMode = "front";
let selectedMuscleKey = null;
let muscleSortAscending = true;

function catalog() {
  // Custom exercise creation is intentionally no longer exposed. Keep the public
  // catalog deterministic so recommendations and muscle standards remain stable.
  return mergeExerciseCatalog(state.remoteExercises, []);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentPlayerSummary() {
  return xpSummary(state.workouts, catalog(), state.settings);
}

function applyRankStage(summary = currentPlayerSummary()) {
  document.documentElement.dataset.rankStage = summary.rank.stageKey ?? "E";
}

function rankIcon(rank) {
  return rank.icon ?? rank.rank;
}

function rankTitle(rank) {
  return rank.rank === "Monarch" ? rank.label : rank.rank;
}

function firstWorkoutDate() {
  return state.workouts.map(workout => workout.date).filter(Boolean).sort()[0] ?? null;
}

function lastWorkoutDate() {
  return state.workouts.map(workout => workout.date).filter(Boolean).sort().at(-1) ?? null;
}

function periodKey(dateString, mode = state.settings.historyViewMode) {
  return mode === "year" ? String(parseDate(dateString).getFullYear()) : dateString.slice(0, 7);
}

function currentPeriodKey(mode = state.settings.historyViewMode) {
  return periodKey(localDateString(), mode);
}

function periodCanShift(delta) {
  const mode = state.settings.historyViewMode === "year" ? "year" : "month";
  const first = firstWorkoutDate();
  if (!first) return false;
  const cursor = parseDate(calendarMonth);
  if (mode === "year") cursor.setFullYear(cursor.getFullYear() + delta);
  else cursor.setMonth(cursor.getMonth() + delta);
  const target = localDateString(cursor);
  if (periodKey(target, mode) < periodKey(first, mode)) return false;
  if (periodKey(target, mode) > currentPeriodKey(mode)) return false;
  return true;
}

function lastTrainingInfo() {
  const last = lastWorkoutDate();
  if (!last) return { label: "No data", detail: "Log your first session", className: "recency-empty" };
  const days = Math.max(0, daysBetween(last, localDateString()));
  if (days === 0) return { label: "Today", detail: "last training", className: "recency-fresh" };
  if (days === 1) return { label: "1 day", detail: "since last training", className: "recency-ready" };
  if (days <= 3) return { label: `${days} days`, detail: "since last training", className: "recency-ready" };
  if (days <= 7) return { label: `${days} days`, detail: "since last training", className: "recency-warning" };
  return { label: `${days} days`, detail: "since last training", className: "recency-stale" };
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle("error", isError);
}

function firebaseErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists for this email.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password.",
    "auth/weak-password": "Use a password with at least six characters.",
    "auth/network-request-failed": "No connection. Sign-in requires internet unless your session is cached.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "permission-denied": "Firestore denied access. Deploy the included firestore.rules file."
  };
  return messages[error?.code] ?? error?.message ?? "Something went wrong.";
}

function showToast(title, copy = "", type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<b>${type === "error" ? "!" : "✓"}</b><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div>`;
  elements.toastContainer.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function queueWrite(promise, title, copy = "Saved locally and queued for Firebase synchronization.") {
  showToast(title, navigator.onLine ? copy : "Saved locally. It will synchronize when you are online.");
  promise.catch(error => showToast("Save failed", firebaseErrorMessage(error), "error"));
}

function createEmptyDraft() {
  return {
    id: null,
    date: localDateString(),
    title: "Training session",
    durationMin: "",
    startedAtMs: null,
    notes: "",
    exercises: []
  };
}

function applyAppearance(settings = state.settings) {
  document.documentElement.dataset.theme = settings.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.motion = settings.motion === "off" ? "off" : "on";
  applyRankStage();
}

function updateSyncStatus() {
  const pending = hasPendingWrites();
  const cacheOnly = isUsingCacheOnly();
  let label = "Synced";
  let detail = "Ready";
  elements.syncPill.className = "sync-pill";
  if (state.user?.offlineOnly) {
    elements.syncPill.classList.add("offline");
    label = "Offline";
    detail = pending ? "Pending" : "Cache";
  } else if (!navigator.onLine) {
    elements.syncPill.classList.add("offline");
    label = "Offline";
    detail = pending ? "Pending" : "Local";
  } else if (pending) {
    label = "Syncing";
    detail = "Pending";
  } else if (cacheOnly) {
    label = "Cloud";
    detail = "Checking";
  } else {
    elements.syncPill.classList.add("synced");
  }
  elements.syncLabel.textContent = label;
  elements.syncDetail.textContent = detail;
  elements.syncPill.title = `${label}: ${detail}`;
}

function showAppForUser(user) {
  elements.authShell.hidden = true;
  elements.appShell.hidden = false;
  elements.userChip.textContent = user.email ?? user.uid;
  document.querySelector("#settings-email").textContent = user.email ?? user.uid;
  navigateTo("dashboard");
}

function tryOfflineUnlock(email) {
  const profile = getCachedUserProfile(email);
  if (!profile) return false;
  offlineAuthActive = true;
  connectOfflineUserData(profile);
  showAppForUser({ ...profile, offlineOnly: true });
  showToast("Offline mode", "Loaded cached device data. New logs will stay on this device until you reconnect.");
  return true;
}

async function handleSignOut() {
  offlineAuthActive = false;
  if (state.user?.offlineOnly) {
    disconnectUserData();
    elements.authShell.hidden = false;
    elements.appShell.hidden = true;
    elements.authPassword.value = "";
    return;
  }
  await signOut(auth);
}

async function initializeAuthentication() {
  try {
    await initializeAuthPersistence();
    elements.bootStatus.classList.add("ready");
    elements.bootText.textContent = "Firebase ready · offline cache enabled";
  } catch (error) {
    elements.bootStatus.classList.add("error");
    elements.bootText.textContent = firebaseErrorMessage(error);
  }

  onAuthStateChanged(auth, user => {
    if (user) {
      offlineAuthActive = false;
      connectUserData(user);
      showAppForUser(user);
      window.setTimeout(() => { void maybeOfferSyncChoice(); }, 600);
    } else {
      if (offlineAuthActive) return;
      disconnectUserData();
      elements.authShell.hidden = false;
      elements.appShell.hidden = true;
      elements.authPassword.value = "";
    }
  });
}

async function submitAuth(event) {
  event.preventDefault();
  const submitLabel = elements.authSubmit.querySelector("span");
  const originalSubmitText = submitLabel?.textContent ?? "Enter Ascend";
  let slowNotice = null;
  for (const control of elements.authForm.querySelectorAll("button,input")) control.disabled = true;
  setMessage(elements.authMessage, "");
  if (submitLabel) submitLabel.textContent = "Entering...";
  slowNotice = window.setTimeout(() => {
    setMessage(elements.authMessage, "Still contacting Firebase. Check your connection if this does not finish soon.", true);
  }, 8000);
  try {
    const email = elements.authEmail.value.trim();
    const password = elements.authPassword.value;
    if (!navigator.onLine && tryOfflineUnlock(email)) return;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const email = elements.authEmail.value.trim();
    if ((error?.code === "auth/network-request-failed" || !navigator.onLine) && tryOfflineUnlock(email)) return;
    setMessage(elements.authMessage, firebaseErrorMessage(error), true);
  } finally {
    window.clearTimeout(slowNotice);
    if (submitLabel) submitLabel.textContent = originalSubmitText;
    for (const control of elements.authForm.querySelectorAll("button,input")) control.disabled = false;
  }
}

async function maybeOfferSyncChoice() {
  if (!navigator.onLine || !state.user) return;
  try {
    const summary = await getSyncSummary();
    if (!summary.hasLocal || !summary.differs) return;
    renderSyncSummary(summary);
    openModal("sync");
  } catch (error) {
    console.warn("Sync comparison unavailable", error);
  }
}

function renderSyncSummary(summary) {
  document.querySelector("#sync-local-summary").textContent = `${summary.local.workouts} workouts`;
  document.querySelector("#sync-cloud-summary").textContent = `${summary.cloud.workouts} workouts`;
}

async function handleSyncChoice(mode) {
  const buttons = document.querySelectorAll("[data-sync-choice]");
  buttons.forEach(button => { button.disabled = true; });
  try {
    await resolveSyncChoice(mode);
    closeModal();
    const title = mode === "cloud" ? "Cloud data fetched" : mode === "device" ? "Device data pushed" : "Data merged";
    showToast(title, "Sync state is being reconciled with Firebase.");
  } catch (error) {
    showToast("Sync choice failed", firebaseErrorMessage(error), "error");
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function navigateTo(view) {
  if (view === "calendar") view = "stats";
  if (!VIEW_META[view]) return;
  activeView = view;
  document.querySelectorAll("[data-view-section]").forEach(section => section.classList.toggle("active", section.dataset.viewSection === view));
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
  elements.viewKicker.textContent = VIEW_META[view][0];
  elements.viewTitle.textContent = VIEW_META[view][1];
  document.querySelector(".content-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "workout") renderBuilder();
  window.requestAnimationFrame(renderActiveCharts);
}

function openModal(type) {
  activeModal = type;
  elements.modalBackdrop.hidden = false;
  document.querySelectorAll("[data-modal]").forEach(modal => { modal.hidden = modal.dataset.modal !== type; });
  document.body.style.overflow = "hidden";
  if (type === "picker") {
    document.querySelector("#exercise-search").value = "";
    renderExercisePicker();
    window.setTimeout(() => document.querySelector("#exercise-search").focus(), 50);
  }
}

function closeModal() {
  if (confirmationResolver || durationResolver) return;
  activeModal = null;
  elements.modalBackdrop.hidden = true;
  document.querySelectorAll("[data-modal]").forEach(modal => { modal.hidden = true; });
  document.body.style.overflow = "";
}

function closeInfoPopovers() {
  document.querySelectorAll(".info-popover").forEach(popover => popover.remove());
}

function toggleInfoPopover(button) {
  const existing = button.parentElement.querySelector(".info-popover");
  closeInfoPopovers();
  if (existing) return;
  const popover = document.createElement("span");
  popover.className = "info-popover";
  popover.textContent = button.dataset.info;
  button.parentElement.append(popover);
}

function askConfirmation(title, copy, acceptLabel = "Delete") {
  return new Promise(resolve => {
    confirmationResolver = resolve;
    activeModal = "confirm";
    elements.modalBackdrop.hidden = false;
    document.querySelectorAll("[data-modal]").forEach(modal => { modal.hidden = modal.dataset.modal !== "confirm"; });
    document.querySelector("#confirm-title").textContent = title;
    document.querySelector("#confirm-copy").textContent = copy;
    document.querySelector("#confirm-accept").textContent = acceptLabel;
    document.body.style.overflow = "hidden";
  });
}

function resolveConfirmation(value) {
  if (!confirmationResolver) return;
  const resolve = confirmationResolver;
  confirmationResolver = null;
  closeModal();
  resolve(value);
}

function latestEntryForExercise(exerciseId) {
  for (const workout of state.workouts) {
    const entry = (workout.exercises ?? []).find(item => item.exerciseId === exerciseId);
    if (entry) return entry;
  }
  return null;
}

function createDraftEntry(exercise) {
  const previous = latestEntryForExercise(exercise.id);
  if (exercise.inputType === "activity") {
    return {
      exerciseId: exercise.id,
      restSeconds: null,
      notes: "",
      sets: [],
      activity: previous?.activity ? { ...deepClone(previous.activity) } : { ...deepClone(exercise.defaults) }
    };
  }

  let sets;
  if (previous?.sets?.length) {
    sets = previous.sets.map(set => ({ ...deepClone(set), completed: true }));
  } else {
    sets = Array.from({ length: exercise.defaults?.sets ?? 3 }, () => ({
      weightKg: 0,
      reps: exercise.inputType === "timedSets" ? 0 : exercise.defaults?.reps ?? 10,
      seconds: exercise.inputType === "timedSets" ? exercise.defaults?.seconds ?? 30 : 0,
      rir: "",
      completed: true
    }));
  }
  return {
    exerciseId: exercise.id,
    restSeconds: exercise.defaults?.restSeconds ?? DEFAULT_SETTINGS.defaultRestSeconds,
    notes: "",
    sets,
    activity: null
  };
}

function startNewWorkout(source = null, keepId = false) {
  if (!source) draftWorkout = createEmptyDraft();
  else {
    draftWorkout = {
      id: keepId ? source.id : null,
      date: keepId ? source.date : localDateString(),
      title: source.title ? `${source.title}` : "Training session",
      durationMin: keepId ? (source.durationMin ?? "") : "",
      startedAtMs: null,
      notes: keepId ? (source.notes ?? "") : "",
      exercises: deepClone(source.exercises ?? [])
    };
    draftWorkout.exercises = draftWorkout.exercises.map(entry => ({
      ...entry,
      sets: (entry.sets ?? []).map(set => ({ ...set, completed: true }))
    }));
  }
  syncDraftMetaToForm();
  renderBuilder();
  navigateTo("workout");
}

function syncDraftMetaToForm() {
  document.querySelector("#workout-date").value = draftWorkout.date || localDateString();
  document.querySelector("#builder-heading").textContent = draftWorkout.id ? "Edit workout" : "New workout";
  document.querySelector("#delete-workout").classList.toggle("hidden", !draftWorkout.id);
}

function markDraftStarted() {
  if (!draftWorkout.id && !draftWorkout.startedAtMs) draftWorkout.startedAtMs = Date.now();
}

function estimateDraftDurationMin() {
  if (draftWorkout.id && Number(draftWorkout.durationMin) > 0) return Math.round(Number(draftWorkout.durationMin));
  const elapsed = draftWorkout.startedAtMs ? Math.ceil((Date.now() - Number(draftWorkout.startedAtMs)) / 60_000) : 0;
  const structural = draftWorkout.exercises.reduce((sum, entry) => {
    const exercise = getExerciseById(entry.exerciseId, catalog());
    return sum + (analyseExerciseEntry(entry, exercise, state.settings)?.durationMinutes ?? 0);
  }, 0);
  const estimate = elapsed >= 2 ? elapsed : Math.ceil(structural || 1);
  return Math.min(1440, Math.max(1, estimate));
}

function askDurationEstimate(estimate) {
  return new Promise(resolve => {
    durationResolver = resolve;
    activeModal = "duration";
    elements.modalBackdrop.hidden = false;
    document.querySelectorAll("[data-modal]").forEach(modal => { modal.hidden = modal.dataset.modal !== "duration"; });
    const input = document.querySelector("#duration-estimate-input");
    input.value = String(estimate);
    document.body.style.overflow = "hidden";
    window.setTimeout(() => input.focus(), 50);
  });
}

function resolveDurationEstimate(value) {
  if (!durationResolver) return;
  const resolve = durationResolver;
  durationResolver = null;
  closeModal();
  resolve(value);
}

function exerciseSymbol(exercise) {
  if (exercise.category === "activity") return "⌁";
  const primary = exercise.muscles?.primary?.[0];
  return MUSCLE_GROUPS[primary]?.icon ?? "◇";
}

function levelValueLabel(exercise, result) {
  if (!result?.level || result.level.value == null) return "No rank data";
  const value = result.level.value;
  if (exercise.standard?.type === "bodyweightRatio") return `${value.toFixed(2)}× bodyweight`;
  if (exercise.standard?.type === "durationSeconds") return `${Math.round(value)} sec`;
  if (exercise.standard?.type === "speedKmh") return `${value.toFixed(1)} km/h`;
  return `${Math.round(value)} rep score`;
}

function setRowsHtml(exercise, entry, entryIndex) {
  const timed = exercise.inputType === "timedSets";
  const bodyweight = exercise.inputType === "bodyweightSets";
  const showRir = Boolean(state.settings.showRir);
  const loadLabel = bodyweight ? "Added kg" : exercise.loadMode === "perHand" ? "kg / hand" : exercise.loadMode === "perSide" ? "kg / side" : "Weight kg";
  const header = timed
    ? `<div class="set-head"><span>Set</span><span>Seconds</span>${showRir ? "<span>RIR</span>" : ""}</div>`
    : `<div class="set-head"><span>Set</span><span>${loadLabel}</span><span>Reps</span>${showRir ? "<span>RIR</span>" : ""}</div>`;
  const rows = (entry.sets ?? []).map((set, setIndex) => timed
    ? `<div class="set-row">
        <span class="set-number">${setIndex + 1}</span>
        <input data-entry="${entryIndex}" data-set="${setIndex}" data-set-field="seconds" type="number" min="0" max="3600" inputmode="numeric" value="${Number(set.seconds) || 0}" aria-label="Seconds">
        ${showRir ? `<input data-entry="${entryIndex}" data-set="${setIndex}" data-set-field="rir" type="number" min="0" max="10" step="1" value="${set.rir ?? ""}" placeholder="-" aria-label="Repetitions in reserve">` : ""}
      </div>`
    : `<div class="set-row">
        <span class="set-number">${setIndex + 1}</span>
        <input data-entry="${entryIndex}" data-set="${setIndex}" data-set-field="weightKg" type="number" min="0" max="1000" step="0.5" inputmode="decimal" value="${Number(set.weightKg) || 0}" aria-label="Weight">
        <input data-entry="${entryIndex}" data-set="${setIndex}" data-set-field="reps" type="number" min="0" max="500" inputmode="numeric" value="${Number(set.reps) || 0}" aria-label="Repetitions">
        ${showRir ? `<input data-entry="${entryIndex}" data-set="${setIndex}" data-set-field="rir" type="number" min="0" max="10" step="1" value="${set.rir ?? ""}" placeholder="-" aria-label="Repetitions in reserve">` : ""}
      </div>`).join("");
  return `<div class="set-table ${timed ? "timed-table" : ""} ${showRir ? "" : "no-rir"}">${header}${rows}</div>`;
}

const ACTIVITY_FIELD_META = {
  durationMin: ["Duration", "min", "number", "1"],
  distanceKm: ["Distance", "km", "number", "0.01"],
  elevationM: ["Elevation gain", "m", "number", "1"],
  steps: ["Steps", "", "number", "1"],
  packKg: ["Pack weight", "kg", "number", "0.5"],
  watts: ["Average power", "W", "number", "1"],
  floors: ["Floors", "", "number", "1"]
};

function activityFieldsHtml(exercise, entry, entryIndex) {
  return `<div class="activity-fields">${(exercise.fields ?? ["durationMin"]).map(field => {
    if (field === "stroke") {
      return `<label class="field"><span>Stroke</span><select data-entry="${entryIndex}" data-activity-field="stroke"><option value="freestyle" ${entry.activity?.stroke === "freestyle" ? "selected" : ""}>Freestyle</option><option value="breaststroke" ${entry.activity?.stroke === "breaststroke" ? "selected" : ""}>Breaststroke</option><option value="backstroke" ${entry.activity?.stroke === "backstroke" ? "selected" : ""}>Backstroke</option><option value="butterfly" ${entry.activity?.stroke === "butterfly" ? "selected" : ""}>Butterfly</option></select></label>`;
    }
    if (field === "intensity") {
      return `<label class="field"><span>Intensity</span><select data-entry="${entryIndex}" data-activity-field="intensity"><option value="light" ${entry.activity?.intensity === "light" ? "selected" : ""}>Light</option><option value="moderate" ${entry.activity?.intensity === "moderate" ? "selected" : ""}>Moderate</option><option value="vigorous" ${entry.activity?.intensity === "vigorous" ? "selected" : ""}>Vigorous</option></select></label>`;
    }
    const [label, unit, type, step] = ACTIVITY_FIELD_META[field] ?? [field, "", "number", "1"];
    return `<label class="field"><span>${label}${unit ? ` (${unit})` : ""}</span><input data-entry="${entryIndex}" data-activity-field="${field}" type="${type}" min="0" step="${step}" inputmode="decimal" value="${entry.activity?.[field] ?? ""}"></label>`;
  }).join("")}</div>`;
}

function renderBuilder() {
  syncDraftMetaToForm();
  const allExercises = catalog();
  elements.builderEmpty.hidden = draftWorkout.exercises.length > 0;
  elements.builderList.replaceChildren();

  draftWorkout.exercises.forEach((entry, entryIndex) => {
    const exercise = getExerciseById(entry.exerciseId, allExercises);
    if (!exercise) return;
    const result = analyseExerciseEntry(entry, exercise, state.settings);
    const block = document.createElement("article");
    block.className = "exercise-block panel";
    block.dataset.entryBlock = String(entryIndex);
    block.innerHTML = `
      <div class="exercise-block-head">
        <span>${exerciseSymbol(exercise)}</span>
        <div><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.equipment)} · ${escapeHtml(exercise.muscles.primary.map(key => MUSCLE_GROUPS[key]?.name ?? key).join(", "))}</small></div>
        <div class="exercise-actions"><button data-action="remove-exercise" data-entry="${entryIndex}" type="button" aria-label="Remove">×</button></div>
      </div>
      ${exercise.inputType === "activity" ? activityFieldsHtml(exercise, entry, entryIndex) : setRowsHtml(exercise, entry, entryIndex)}
      <div class="exercise-footer">
        ${exercise.inputType === "activity" ? "<span></span>" : `<div class="set-controls"><button class="set-control" data-action="add-set" data-entry="${entryIndex}" type="button" aria-label="Add set" title="Add set">+</button><button class="set-control" data-action="remove-set" data-entry="${entryIndex}" type="button" aria-label="Remove set" title="Remove set" ${entry.sets.length <= 1 ? "disabled" : ""}>-</button></div>`}
        <span class="exercise-preview" data-preview="${entryIndex}">${Math.round(result.calories)} kcal · Rank ${result.level.rank} ${result.level.label} · ${escapeHtml(levelValueLabel(exercise, result))}</span>
      </div>`;
    elements.builderList.append(block);
  });
}

function updateEntryPreview(entryIndex) {
  const entry = draftWorkout.exercises[entryIndex];
  const exercise = getExerciseById(entry?.exerciseId, catalog());
  const target = document.querySelector(`[data-preview="${entryIndex}"]`);
  if (!entry || !exercise || !target) return;
  const result = analyseExerciseEntry(entry, exercise, state.settings);
  target.textContent = `${Math.round(result.calories)} kcal · Rank ${result.level.rank} ${result.level.label} · ${levelValueLabel(exercise, result)}`;
}

function addExerciseToDraft(exerciseId) {
  const exercise = getExerciseById(exerciseId, catalog());
  if (!exercise) return;
  draftWorkout.exercises.push(createDraftEntry(exercise));
  markDraftStarted();
  closeModal();
  renderBuilder();
  document.querySelector(`[data-entry-block="${draftWorkout.exercises.length - 1}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function submitWorkout(event) {
  event.preventDefault();
  draftWorkout.date = document.querySelector("#workout-date").value;
  draftWorkout.title = draftWorkout.title || "Training session";
  draftWorkout.notes = draftWorkout.notes || "";
  const message = document.querySelector("#workout-message");
  if (!draftWorkout.date || !draftWorkout.exercises.length) {
    setMessage(message, "Choose a date and add at least one exercise.", true);
    return;
  }

  const saved = deepClone(draftWorkout);
  delete saved.startedAtMs;
  if (!draftWorkout.id) {
    const estimate = estimateDraftDurationMin();
    if (state.settings.showDurationPrompt !== false) {
      const adjusted = await askDurationEstimate(estimate);
      if (adjusted == null) return;
      saved.durationMin = adjusted;
    } else {
      saved.durationMin = estimate;
    }
  }

  try {
    await saveWorkout(saved);
    showToast("Workout saved", "Progress, calories, ranks and muscle coverage were recalculated.");
    draftWorkout = createEmptyDraft();
    renderBuilder();
    navigateTo("dashboard");
  } catch (error) {
    setMessage(message, firebaseErrorMessage(error), true);
  }
}

async function removeDraftExercise(index) {
  const exercise = getExerciseById(draftWorkout.exercises[index]?.exerciseId, catalog());
  const accepted = await askConfirmation("Remove exercise?", `${exercise?.name ?? "This exercise"} will be removed from the unsaved session.`, "Remove");
  if (!accepted) return;
  draftWorkout.exercises.splice(index, 1);
  renderBuilder();
}

function pickerRecommendedScore(exercise, usedIds, balanceByMuscle) {
  if (exercise.category !== "strength") return -Infinity;
  const usedBonus = usedIds.has(exercise.id) ? 60 : 0;
  const muscleNeed = [...(exercise.muscles.primary ?? []), ...(exercise.muscles.secondary ?? [])]
    .map(key => balanceByMuscle.get(key))
    .filter(Boolean)
    .reduce((score, item) => {
      if (item.status === "missing") return score + 38;
      if (item.status === "low") return score + 24;
      if (item.status === "balanced") return score + 5;
      return score - 14;
    }, 0);
  return usedBonus + muscleNeed;
}

function renderExercisePicker() {
  const query = document.querySelector("#exercise-search").value.trim().toLowerCase();
  const used = new Set(state.workouts.flatMap(workout => (workout.exercises ?? []).map(entry => entry.exerciseId)));
  const prData = detectPersonalRecords(state.workouts, catalog(), state.settings);
  const balanceByMuscle = new Map(muscleBalance(state.workouts, catalog(), state.settings, state.settings.bodyWindowDays || 14).map(item => [item.key, item]));
  let list = catalog().filter(exercise => {
    if (query && !searchableExerciseText(exercise).includes(query)) return false;
    if (pickerFilter === "recommended" && exercise.category !== "strength") return false;
    if (pickerFilter === "strength" && exercise.category !== "strength") return false;
    if (pickerFilter === "activity" && exercise.category !== "activity") return false;
    if (pickerFilter === "favorites" && !used.has(exercise.id)) return false;
    return true;
  });
  if (pickerFilter === "recommended") {
    list = list
      .map(exercise => ({ exercise, score: pickerRecommendedScore(exercise, used, balanceByMuscle) }))
      .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
      .map(item => item.exercise)
      .slice(0, 24);
  }
  const container = document.querySelector("#exercise-picker-list");
  container.replaceChildren();
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">No matching exercise.</div>`;
    return;
  }
  for (const exercise of list) {
    const best = prData.best.get(exercise.id)?.result;
    const level = best?.level ?? LEVELS[0];
    const button = document.createElement("button");
    button.className = "picker-item";
    button.type = "button";
    button.dataset.addExercise = exercise.id;
    button.innerHTML = `<span class="picker-symbol">${exerciseSymbol(exercise)}</span><div><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(exercise.equipment)} · ${escapeHtml(exercise.muscles.primary.map(key => MUSCLE_GROUPS[key]?.name ?? key).join(", "))}</small></div><span class="rank-badge rank-${level.rank}">${level.rank}</span>`;
    container.append(button);
  }
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString();
}

function renderSessionList(container, workouts, limit = 5) {
  container.replaceChildren();
  if (!workouts.length) {
    container.innerHTML = `<div class="empty-state">No workouts yet.</div>`;
    return;
  }
  for (const workout of workouts.slice(0, limit)) {
    const row = document.createElement("div");
    row.className = "session-row";
    row.innerHTML = `<button data-open-workout="${workout.id}" type="button"><strong>${escapeHtml(workout.title)}</strong><small>${formatDate(workout.date)} · ${workout.exerciseResults.length} exercises · ${formatNumber(workout.durationMin)} min</small></button><div class="session-score">${formatNumber(workout.calories)} kcal</div>`;
    container.append(row);
  }
}

function recentRecordList(prData) {
  const records = [];
  const workoutMap = new Map(state.workouts.map(workout => [workout.id, workout]));
  for (const [workoutId, items] of prData.recordsByWorkout.entries()) {
    for (const item of items) records.push({ ...item, date: workoutMap.get(workoutId)?.date ?? "" });
  }
  return records.sort((a, b) => b.date.localeCompare(a.date));
}

function renderDashboard() {
  const allExercises = catalog();
  const analyses = buildWorkoutAnalyses(state.workouts, allExercises, state.settings).reverse();
  const xp = currentPlayerSummary();
  const prs = detectPersonalRecords(state.workouts, allExercises, state.settings);
  const weekStart = startOfWeek(localDateString());
  const weekWorkouts = analyses.filter(workout => workout.date >= weekStart);
  const weekSessions = new Set(weekWorkouts.map(workout => workout.date)).size;
  const sessionTarget = Math.max(1, Number(state.settings.weeklySessionTarget) || 3);

  document.querySelector("#rank-letter").textContent = rankIcon(xp.rank);
  document.querySelector("#rank-name").textContent = xp.rank.label;
  document.querySelector("#brand-stage").textContent = `RANK ${rankTitle(xp.rank)}`;
  document.querySelector("#system-level").textContent = `Level ${xp.level}`;
  document.querySelector("#total-xp").textContent = `${xp.xp.toLocaleString()} XP`;
  document.querySelector("#xp-fill").style.width = `${xp.progress * 100}%`;
  document.querySelector("#xp-next").textContent = `${Math.max(0, xp.nextXp - xp.xp).toLocaleString()} XP to the next level.`;
  applyRankStage(xp);
  document.querySelector("#week-streak").textContent = consistencyStreak(state.workouts, sessionTarget).toString();
  document.querySelector("#week-session-label").textContent = `${weekSessions} / ${sessionTarget}`;
  document.querySelector("#week-calories").textContent = formatNumber(weekWorkouts.reduce((sum, workout) => sum + workout.calories, 0));
  document.querySelector("#week-minutes").textContent = formatNumber(weekWorkouts.reduce((sum, workout) => sum + workout.durationMin, 0));
  document.querySelector("#week-sets").textContent = formatNumber(weekWorkouts.reduce((sum, workout) => sum + workout.sets, 0));

  const focus = suggestedFocus(state.workouts, allExercises, state.settings);
  document.querySelector("#focus-title").textContent = focus.title;
  document.querySelector("#focus-copy").textContent = focus.text;
  const focusMuscles = document.querySelector("#focus-muscles");
  focusMuscles.innerHTML = focus.muscles.length
    ? focus.muscles.map(item => `<span class="chip">${item.icon} ${escapeHtml(item.name)}</span>`).join("")
    : `<span class="chip">◆ Coverage on target</span>`;

  renderSessionList(document.querySelector("#recent-workouts"), analyses, 5);
  const recordContainer = document.querySelector("#recent-records");
  const records = recentRecordList(prs);
  recordContainer.replaceChildren();
  if (!records.length) recordContainer.innerHTML = `<div class="empty-state">A PR appears after an exercise improves beyond its first baseline.</div>`;
  for (const record of records.slice(0, 6)) {
    const row = document.createElement("div");
    row.className = "record-row";
    const change = record.previous ? (record.value / record.previous - 1) * 100 : 0;
    row.innerHTML = `<div><strong>${escapeHtml(record.exercise.name)}</strong><small>${formatDate(record.date)} · ${record.result.level.rank} ${record.result.level.label}</small></div><div class="session-score">+${change.toFixed(1)}%</div>`;
    recordContainer.append(row);
  }
}

function renderCalendar() {
  if (!state.workouts.some(workout => workout.date)) {
    renderHistoryEmpty();
    return;
  }
  const mode = state.settings.historyViewMode === "year" ? "year" : "month";
  document.querySelector(".calendar-card")?.classList.toggle("history-year-mode", mode === "year");
  document.querySelector(".calendar-weekdays").hidden = mode === "year";
  document.querySelector(".calendar-legend").hidden = false;
  updateHistoryNav();
  if (mode === "year") {
    renderHistoryYear();
    return;
  }
  renderHistoryMonth();
}

function updateHistoryNav() {
  document.querySelector("#calendar-prev").hidden = !periodCanShift(-1);
  document.querySelector("#calendar-next").hidden = !periodCanShift(1);
}

function renderHistoryEmpty() {
  document.querySelector(".calendar-card")?.classList.remove("history-year-mode");
  document.querySelector("#calendar-prev").hidden = true;
  document.querySelector("#calendar-next").hidden = true;
  document.querySelector("#calendar-month").textContent = "No history yet";
  document.querySelector(".calendar-weekdays").hidden = true;
  document.querySelector(".calendar-legend").hidden = true;
  const grid = document.querySelector("#calendar-grid");
  grid.className = "history-empty";
  grid.innerHTML = `<div class="empty-state">No training history yet. Save your first workout to unlock the calendar.</div>`;
  document.querySelector("#calendar-day-title").textContent = "No sessions";
  document.querySelector("#calendar-day-total").textContent = "0";
  document.querySelector("#calendar-day-list").innerHTML = `<div class="empty-state">Logged sessions will appear here.</div>`;
}

function renderHistoryMonth() {
  const monthDate = parseDate(calendarMonth);
  const firstDate = firstWorkoutDate();
  const today = localDateString();
  if (selectedCalendarDate < firstDate || selectedCalendarDate > today) selectedCalendarDate = firstDate;
  document.querySelector("#calendar-month").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthDate);
  const intensity = calendarIntensity(state.workouts, catalog(), state.settings, calendarMonth);
  const first = parseDate(startOfMonth(calendarMonth));
  const dayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(calendarMonth, -dayOffset);
  const grid = document.querySelector("#calendar-grid");
  grid.replaceChildren();
  for (let index = 0; index < 42; index += 1) {
    const date = addDays(gridStart, index);
    const info = intensity.get(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (date.slice(0, 7) !== calendarMonth.slice(0, 7)) button.classList.add("outside");
    if (date < firstDate) button.classList.add("before-first");
    if (date > today) button.classList.add("future-day");
    if (date === localDateString()) button.classList.add("today");
    if (date === selectedCalendarDate) button.classList.add("selected");
    if (info) button.classList.add("has-training", `tier-${info.tier}`);
    if (date < firstDate || date > today) button.disabled = true;
    else button.dataset.calendarDate = date;
    button.innerHTML = `<strong>${Number(date.slice(-2))}</strong><small>${info ? `${Math.round(info.calories)} kcal` : ""}</small>`;
    grid.append(button);
  }
  renderCalendarDay();
}

function renderHistoryYear() {
  const year = parseDate(calendarMonth).getFullYear();
  const first = firstWorkoutDate();
  const firstMonth = first.slice(0, 7);
  const currentMonth = localDateString().slice(0, 7);
  if (!selectedHistoryMonth.startsWith(String(year)) || selectedHistoryMonth < firstMonth || selectedHistoryMonth > currentMonth) {
    selectedHistoryMonth = String(year) === first.slice(0, 4) ? firstMonth : `${year}-01`;
  }
  document.querySelector("#calendar-month").textContent = String(year);
  const analyses = buildWorkoutAnalyses(state.workouts, catalog(), state.settings).filter(workout => workout.date.startsWith(`${year}-`));
  const byMonth = new Map();
  for (let month = 0; month < 12; month += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    byMonth.set(key, { key, workouts: [], calories: 0, minutes: 0 });
  }
  for (const workout of analyses) {
    const key = workout.date.slice(0, 7);
    const bucket = byMonth.get(key);
    if (!bucket) continue;
    bucket.workouts.push(workout);
    bucket.calories += workout.calories;
    bucket.minutes += workout.durationMin;
  }
  const maxCalories = Math.max(1, ...[...byMonth.values()].map(month => month.calories));
  const grid = document.querySelector("#calendar-grid");
  grid.className = "calendar-grid history-year-grid";
  grid.replaceChildren();
  const monthFormatter = new Intl.DateTimeFormat(undefined, { month: "short" });
  for (const item of byMonth.values()) {
    const date = parseDate(`${item.key}-01`);
    const tier = item.calories === 0 ? 0 : item.calories / maxCalories > .75 ? 4 : item.calories / maxCalories > .45 ? 3 : item.calories / maxCalories > .2 ? 2 : 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-month-tile";
    if (item.key < firstMonth) button.classList.add("before-first");
    if (item.key > currentMonth) button.classList.add("future-day");
    if (tier) button.classList.add(`tier-${tier}`);
    if (item.key === selectedHistoryMonth) button.classList.add("selected");
    if (item.key < firstMonth || item.key > currentMonth) button.disabled = true;
    else button.dataset.historyMonth = item.key;
    button.innerHTML = `<strong>${monthFormatter.format(date)}</strong><small>${item.workouts.length} session${item.workouts.length === 1 ? "" : "s"}</small><span>${item.calories ? `${formatNumber(item.calories)} kcal` : "Rest"}</span>`;
    grid.append(button);
  }
  renderHistoryMonthDetail();
}

function renderCalendarDay() {
  document.querySelector("#calendar-grid").className = "calendar-grid";
  const analyses = buildWorkoutAnalyses(state.workouts, catalog(), state.settings)
    .filter(workout => workout.date === selectedCalendarDate)
    .reverse();
  document.querySelector("#calendar-day-title").textContent = formatDate(selectedCalendarDate, { weekday: "long" });
  const calories = analyses.reduce((sum, workout) => sum + workout.calories, 0);
  document.querySelector("#calendar-day-total").textContent = analyses.length ? `${Math.round(calories)} kcal` : "Rest day";
  renderSessionList(document.querySelector("#calendar-day-list"), analyses, 20);
}

function renderHistoryMonthDetail() {
  const analyses = buildWorkoutAnalyses(state.workouts, catalog(), state.settings)
    .filter(workout => workout.date.slice(0, 7) === selectedHistoryMonth)
    .reverse();
  const date = parseDate(`${selectedHistoryMonth}-01`);
  document.querySelector("#calendar-day-title").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
  const calories = analyses.reduce((sum, workout) => sum + workout.calories, 0);
  document.querySelector("#calendar-day-total").textContent = analyses.length ? `${analyses.length} sessions · ${Math.round(calories)} kcal` : "No sessions";
  renderSessionList(document.querySelector("#calendar-day-list"), analyses, 80);
}

function usedExerciseIds() {
  return [...new Set(state.workouts.flatMap(workout => (workout.exercises ?? []).map(entry => entry.exerciseId)))];
}

function bestResultsByExercise() {
  const result = new Map();
  for (const workout of buildWorkoutAnalyses(state.workouts, catalog(), state.settings)) {
    for (const item of workout.exerciseResults) {
      const score = item.level.index + item.level.progress;
      if (!result.has(item.exerciseId) || score > result.get(item.exerciseId).score) result.set(item.exerciseId, { score, item, date: workout.date });
    }
  }
  return result;
}

const PROGRESSION_METRICS = {
  level: { label: "Rank score", unit: "", rankMode: true, short: "Rank" },
  e1rm: { label: "Estimated 1RM", unit: " kg", short: "1RM" },
  volume: { label: "Volume", unit: " kg", short: "Volume" },
  reps: { label: "Total reps", unit: "", short: "Reps" },
  seconds: { label: "Best hold", unit: " sec", short: "Hold" },
  duration: { label: "Active minutes", unit: " min", short: "Minutes" },
  speed: { label: "Speed", unit: " km/h", short: "Speed" }
};

function progressionMetricOptions(exercise) {
  const options = [];
  if (exercise?.standard) options.push("level");
  if (exercise?.inputType === "sets") options.push("e1rm", "volume", "reps");
  if (exercise?.inputType === "bodyweightSets") options.push("reps");
  if (exercise?.inputType === "timedSets") options.push("seconds");
  if (exercise?.inputType === "activity") {
    options.push("duration");
    if (exercise.standard?.type === "speedKmh") options.push("speed");
  }
  return [...new Set(options.length ? options : ["level"])]
    .filter(key => PROGRESSION_METRICS[key]);
}

function loggedExercisesForProgress() {
  return usedExerciseIds()
    .map(id => getExerciseById(id, catalog()))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderProgressPicker() {
  const exercises = loggedExercisesForProgress();
  const list = document.querySelector("#progress-exercise-list");
  const metricButtons = document.querySelector("#progress-metric-buttons");
  const help = document.querySelector("#progress-help");
  if (!list || !metricButtons) return;

  if (!exercises.length) {
    selectedProgressExerciseId = "";
    selectedProgressMetric = "level";
    list.innerHTML = `<div class="empty-state">Log an exercise at least twice to build a trend.</div>`;
    metricButtons.innerHTML = "";
    if (help) help.textContent = "No progression data yet.";
    return;
  }

  if (!selectedProgressExerciseId || !exercises.some(exercise => exercise.id === selectedProgressExerciseId)) {
    selectedProgressExerciseId = exercises[0].id;
  }
  const selectedExercise = getExerciseById(selectedProgressExerciseId, catalog()) ?? exercises[0];
  const validMetrics = progressionMetricOptions(selectedExercise);
  if (!validMetrics.includes(selectedProgressMetric)) selectedProgressMetric = validMetrics[0];

  const query = progressSearchQuery.trim().toLowerCase();
  const filtered = exercises.filter(exercise => !query || searchableExerciseText(exercise).includes(query));
  list.innerHTML = filtered.length
    ? filtered.map(exercise => {
        const active = exercise.id === selectedProgressExerciseId;
        const primary = exercise.muscles.primary.map(key => MUSCLE_GROUPS[key]?.name ?? key).join(", ");
        return `<button class="progress-exercise-chip ${active ? "active" : ""}" data-progress-exercise="${exercise.id}" type="button"><strong>${escapeHtml(exercise.name)}</strong><small>${escapeHtml(primary)}</small></button>`;
      }).join("")
    : `<div class="empty-state">No logged exercise matches the search.</div>`;

  metricButtons.innerHTML = validMetrics.map(key => {
    const meta = PROGRESSION_METRICS[key];
    return `<button class="${selectedProgressMetric === key ? "active" : ""}" data-progress-metric="${key}" type="button">${escapeHtml(meta.short)}</button>`;
  }).join("");
  if (help) help.textContent = `${selectedExercise.name}: ${PROGRESSION_METRICS[selectedProgressMetric].label}`;
}

function renderStats() {
  const statsWindowSelect = document.querySelector("#stats-window");
  if (!statsWindowInitialized) {
    const configured = String(state.settings.statsWindowDays || 28);
    if (![...statsWindowSelect.options].some(option => option.value === configured)) {
      statsWindowSelect.add(new Option(`${configured} days`, configured));
    }
    statsWindowSelect.value = configured;
    statsWindowInitialized = true;
  }
  const days = Number(statsWindowSelect.value || state.settings.statsWindowDays || 28);
  const stats = statistics(state.workouts, catalog(), state.settings, days);
  document.querySelector("#stat-frequency").textContent = stats.sessionsPerWeek.toFixed(1);
  document.querySelector("#stat-session-total").textContent = `${stats.sessions} active day${stats.sessions === 1 ? "" : "s"}`;
  document.querySelector("#stat-calories").textContent = formatNumber(stats.totalCalories);

  renderProgressPicker();

  const best = bestResultsByExercise();
  const grid = document.querySelector("#exercise-rank-grid");
  grid.replaceChildren();
  if (!best.size) {
    grid.innerHTML = `<div class="empty-state">No standard cards yet. Log a strength, bodyweight, timed, or speed-based exercise to fill this section.</div>`;
    return;
  }
  for (const { item, date } of [...best.values()].sort((a, b) => b.score - a.score)) {
    const card = document.createElement("div");
    card.className = "exercise-rank-card";
    const label = item.level.value == null ? "No standard value" : levelValueLabel(item.exercise, item);
    card.innerHTML = `<span class="rank-badge rank-${item.level.rank}">${item.level.rank}</span><div><strong>${escapeHtml(item.exercise.name)}</strong><small>${item.level.label} · ${escapeHtml(label)} · ${formatDate(date, { year: false })}</small><div class="mini-rail"><span style="width:${Math.max(4, item.level.progress * 100)}%"></span></div></div>`;
    grid.append(card);
  }
}

function renderActiveCharts() {
  if (elements.appShell.hidden) return;
  if (activeView === "dashboard") {
    const weekStart = startOfWeek(localDateString());
    const weekSessions = new Set(state.workouts.filter(workout => workout.date >= weekStart).map(workout => workout.date)).size;
    drawDonut(document.querySelector("#weekly-target-chart"), weekSessions, state.settings.weeklySessionTarget, "sessions");
  }
  if (activeView === "stats") {
    const days = Number(document.querySelector("#stats-window").value || state.settings.statsWindowDays || 28);
    const stats = statistics(state.workouts, catalog(), state.settings, days);
    drawWeeklyBars(document.querySelector("#weekly-chart"), stats.weekly, document.querySelector("#weekly-metric").value);
    const metric = selectedProgressMetric;
    const points = selectedProgressExerciseId
      ? calculateProgression(state.workouts, catalog(), state.settings, selectedProgressExerciseId, metric)
      : [];
    const meta = PROGRESSION_METRICS[metric] ?? PROGRESSION_METRICS.level;
    drawLineChart(document.querySelector("#progress-chart"), points, { unit: meta.unit, label: meta.label, rankMode: Boolean(meta.rankMode) });
  }
}

function zoneMuscleKeys(zone) {
  const source = bodyViewMode === "back" ? (zone.dataset.backMuscles || zone.dataset.zoneMuscles) : zone.dataset.zoneMuscles;
  return source.split(",").map(item => item.trim()).filter(Boolean);
}

function updateBodyMap(balance) {
  const byKey = new Map(balance.map(item => [item.key, item]));
  const statusScore = { missing: 0, low: 1, balanced: 2, high: 3 };
  document.querySelector(".muscle-map")?.setAttribute("data-body-view", bodyViewMode);
  document.querySelector("#body-view-toggle").textContent = bodyViewMode === "front" ? "Back view" : "Front view";
  document.querySelector("#muscle-map-label").textContent = selectedMuscleKey
    ? (MUSCLE_GROUPS[selectedMuscleKey]?.name ?? "Training map")
    : `${bodyViewMode.toUpperCase()} TRAINING MAP`;
  document.querySelectorAll("[data-zone-muscles]").forEach(zone => {
    const keys = zoneMuscleKeys(zone);
    const strongest = keys
      .map(key => byKey.get(key))
      .filter(Boolean)
      .sort((a, b) => (statusScore[b.status] ?? 0) - (statusScore[a.status] ?? 0))[0];
    zone.dataset.status = strongest?.status ?? "missing";
    zone.classList.toggle("selected", Boolean(selectedMuscleKey && keys.includes(selectedMuscleKey)));
    zone.title = strongest ? `${strongest.name}: ${strongest.status}` : "No recent data";
  });
}

function exercisesForMuscle(muscleKey) {
  return catalog()
    .filter(exercise => exercise.muscles?.primary?.includes(muscleKey) || exercise.muscles?.secondary?.includes(muscleKey))
    .sort((a, b) => {
      const aPrimary = a.muscles.primary.includes(muscleKey) ? 0 : 1;
      const bPrimary = b.muscles.primary.includes(muscleKey) ? 0 : 1;
      return aPrimary - bPrimary || a.name.localeCompare(b.name);
    });
}

function renderSelectedMusclePanel(balanceByKey) {
  const panel = document.querySelector("#selected-muscle-panel");
  if (!panel) return;
  if (!selectedMuscleKey) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  const muscle = balanceByKey.get(selectedMuscleKey) ?? { key: selectedMuscleKey, ...MUSCLE_GROUPS[selectedMuscleKey], score: 0, target: 0, status: "missing" };
  const exercises = exercisesForMuscle(selectedMuscleKey).slice(0, 16);
  panel.hidden = false;
  panel.innerHTML = `<div class="selected-muscle-head"><strong>${escapeHtml(muscle.name)}</strong><span class="tag">${escapeHtml(muscle.status ?? "missing")}</span></div><small>${muscle.score ?? 0} / ${muscle.target ?? 0} effective sets in the selected window</small><div class="selected-muscle-exercises">${exercises.map(exercise => `<button data-add-exercise="${exercise.id}" type="button"><span>${exerciseSymbol(exercise)}</span><div><strong>${escapeHtml(exercise.name)}</strong><small>${exercise.muscles.primary.includes(selectedMuscleKey) ? "Primary" : "Secondary"} · ${escapeHtml(exercise.equipment)}</small></div></button>`).join("") || `<div class="empty-state">No catalog exercise targets this muscle.</div>`}</div>`;
}

function renderMuscles() {
  const days = Number(state.settings.bodyWindowDays || 14);
  let balance = muscleBalance(state.workouts, catalog(), state.settings, days).filter(item => item.key !== "cardio");
  balance = balance.sort((a, b) => muscleSortAscending ? a.score - b.score : b.score - a.score);
  const balanceByKey = new Map(balance.map(item => [item.key, item]));
  const grid = document.querySelector("#muscle-grid");
  grid.replaceChildren();
  updateBodyMap(balance);
  renderSelectedMusclePanel(balanceByKey);
  document.querySelector("#muscle-sort-toggle").textContent = muscleSortAscending ? "Least used first" : "Most used first";
  const counts = { missing: 0, low: 0, balanced: 0, high: 0 };
  for (const item of balance) {
    counts[item.status] += 1;
    const card = document.createElement("article");
    card.className = `muscle-card panel status-${item.status}`;
    const statusLabel = item.status === "high" ? "High volume" : item.status[0].toUpperCase() + item.status.slice(1);
    const recoveryLabel = item.lastTrained ? `${item.daysSince}d since trained` : "No recent data";
    const muscleRank = item.level.hasData ? `Rank ${item.level.rank}` : "Unranked";
    card.innerHTML = `<div class="muscle-card-head"><div><i>${item.icon}</i><h4>${escapeHtml(item.name)}</h4></div><span class="tag">${muscleRank} · ${statusLabel}</span></div><div class="coverage-rail"><span style="width:${Math.min(100, item.ratio * 100)}%"></span></div><footer><span>${item.score} / ${item.target} effective sets</span><span>${recoveryLabel}</span></footer>`;
    grid.append(card);
  }
  document.querySelector("#muscle-status-totals").innerHTML = `<div><strong>${counts.balanced}</strong><span>Balanced</span></div><div><strong>${counts.low}</strong><span>Low</span></div><div><strong>${counts.missing}</strong><span>Missing</span></div><div><strong>${counts.high}</strong><span>High volume</span></div>`;
}

function rankEstimateText(targetXp, summary) {
  if (summary.xp >= targetXp) return "Reached";
  const first = firstWorkoutDate();
  if (!first || summary.xp <= 0) return "No estimate yet";
  const observedDays = Math.max(1, daysBetween(first, localDateString()) + 1);
  const averageDailyXp = summary.xp / observedDays;
  if (averageDailyXp <= 0) return "No estimate yet";
  const days = Math.ceil((targetXp - summary.xp) / averageDailyXp);
  if (days <= 1) return "About 1 day";
  if (days < 60) return `About ${days} days`;
  return `About ${Math.ceil(days / 30)} months`;
}

function renderRankGuide() {
  const summary = currentPlayerSummary();
  const content = document.querySelector("#rank-guide-content");
  content.innerHTML = `
    <div class="rank-guide-list">
      ${PLAYER_RANKS.map(rank => {
        const targetXp = xpForLevel(rank.minLevel);
        const reached = summary.xp >= targetXp;
        const active = rank.stageKey === summary.rank.stageKey;
        return `<article class="rank-guide-row ${reached ? "reached" : ""} ${active ? "active" : ""}">
          <span class="rank-badge rank-${escapeHtml(rank.stageKey)}">${escapeHtml(rankIcon(rank))}</span>
          <div><strong>${escapeHtml(rank.label)}</strong><small>Level ${rank.minLevel} / ${targetXp.toLocaleString()} XP</small><p>${escapeHtml(rank.description)}</p></div>
          <em>${escapeHtml(active ? "Current" : rankEstimateText(targetXp, summary))}</em>
        </article>`;
      }).join("")}
    </div>`;
}

function renderSettings() {
  const form = document.querySelector("#settings-form");
  if (!form.contains(document.activeElement)) {
    document.querySelector("#setting-weight").value = state.settings.bodyWeightKg;
    document.querySelector("#setting-height").value = state.settings.heightCm;
    document.querySelector("#setting-birth-year").value = state.settings.birthYear;
    document.querySelector("#setting-sex").value = state.settings.referenceSex;
    document.querySelector("#setting-session-target").value = state.settings.weeklySessionTarget;
    document.querySelector("#setting-muscle-target").value = state.settings.weeklyMuscleTargetSets;
    document.querySelector("#setting-stats-window").value = state.settings.statsWindowDays;
    document.querySelector("#setting-body-window").value = state.settings.bodyWindowDays;
    document.querySelector("#setting-history-mode").value = state.settings.historyViewMode;
    document.querySelector("#setting-show-rir").checked = Boolean(state.settings.showRir);
    document.querySelector("#setting-duration-prompt").checked = state.settings.showDurationPrompt !== false;
    document.querySelector("#setting-theme").value = state.settings.theme;
    document.querySelector("#setting-motion").value = state.settings.motion;
  }
  const age = Math.max(0, new Date().getFullYear() - Number(state.settings.birthYear || DEFAULT_SETTINGS.birthYear));
  document.querySelector("#setting-age-preview").textContent = `Calculated age: ${age}`;
  document.querySelector("#settings-workouts").textContent = state.workouts.length.toString();
  document.querySelector("#app-version").textContent = `Ascend ${APP_VERSION}`;
  document.querySelector("#catalog-status").textContent = state.catalogAvailable ? `${BUNDLED_EXERCISES.length + state.remoteExercises.length} bundled/remote` : "Bundled only";
}

function openWorkoutDetail(id) {
  const workout = buildWorkoutAnalyses(state.workouts, catalog(), state.settings).find(item => item.id === id);
  if (!workout) return;
  document.querySelector("#detail-title").textContent = workout.title;
  document.querySelector("#detail-content").innerHTML = `
    <div class="detail-summary"><div><span>Date</span><strong>${formatDate(workout.date)}</strong></div><div><span>Duration</span><strong>${formatNumber(workout.durationMin)} min</strong></div><div><span>Calories</span><strong>${formatNumber(workout.calories)}</strong></div><div><span>Volume</span><strong>${formatNumber(workout.volumeKg)} kg</strong></div></div>
    ${workout.notes ? `<p class="muted">${escapeHtml(workout.notes)}</p>` : ""}
    ${workout.exerciseResults.map(result => `<div class="detail-exercise"><div class="detail-exercise-head"><strong>${escapeHtml(result.exercise.name)}</strong><span class="rank-badge rank-${result.level.rank}">${result.level.rank}</span></div><p>${result.exercise.inputType === "activity" ? `${result.speedKmh ? result.speedKmh.toFixed(1) + " km/h · " : ""}${Math.round(result.activeMinutes)} min` : `${result.totalReps} reps · ${formatNumber(result.volumeKg)} kg volume${result.bestE1RM ? ` · ${result.bestE1RM.toFixed(1)} kg e1RM` : ""}`} · ${Math.round(result.calories)} kcal</p></div>`).join("")}
    <div class="two-col" style="margin-top:16px"><button class="secondary-button" data-edit-workout="${workout.id}" type="button">Edit workout</button><button class="ghost-button" data-repeat-workout="${workout.id}" type="button">Repeat session</button></div>`;
  openModal("detail");
}

function submitSettings(event) {
  event.preventDefault();
  const settings = {
    bodyWeightKg: Number(document.querySelector("#setting-weight").value),
    heightCm: Number(document.querySelector("#setting-height").value),
    birthYear: Number(document.querySelector("#setting-birth-year").value),
    referenceSex: document.querySelector("#setting-sex").value,
    weeklySessionTarget: Number(document.querySelector("#setting-session-target").value),
    weeklyMuscleTargetSets: Number(document.querySelector("#setting-muscle-target").value),
    statsWindowDays: Number(document.querySelector("#setting-stats-window").value),
    bodyWindowDays: Number(document.querySelector("#setting-body-window").value),
    historyViewMode: document.querySelector("#setting-history-mode").value,
    showRir: document.querySelector("#setting-show-rir").checked,
    showDurationPrompt: document.querySelector("#setting-duration-prompt").checked,
    defaultRestSeconds: DEFAULT_SETTINGS.defaultRestSeconds,
    autoStartRestTimer: false,
    theme: document.querySelector("#setting-theme").value,
    motion: document.querySelector("#setting-motion").value
  };
  const message = document.querySelector("#settings-message");
  if (settings.bodyWeightKg < 20 || settings.bodyWeightKg > 400 || settings.heightCm < 120 || settings.heightCm > 230) {
    setMessage(message, "Enter a valid body weight and height.", true);
    return;
  }
  const year = new Date().getFullYear();
  if (settings.birthYear < 1900 || settings.birthYear > year) {
    setMessage(message, "Enter a valid birth year.", true);
    return;
  }
  queueWrite(saveSettings(settings), "Settings saved");
  setMessage(message, "Settings saved locally and queued for synchronization.");
  renderCalendar();
  renderBuilder();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(exportState(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ascend-backup-${localDateString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Backup exported", "The JSON file contains workouts and settings.");
}

async function importBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const accepted = await askConfirmation("Import backup?", "Matching records may be overwritten. Existing unmatched workouts remain.", "Import");
    if (!accepted) return;
    await importState(backup);
    showToast("Backup imported", "Imported data is synchronizing with Firebase.");
  } catch (error) {
    showToast("Import failed", error.message, "error");
  } finally {
    document.querySelector("#import-data").value = "";
  }
}

function renderAll() {
  applyAppearance();
  updateSyncStatus();
  renderDashboard();
  renderCalendar();
  renderStats();
  renderMuscles();
  renderSettings();
  const signature = `${state.remoteExercises.length}:${state.customExercises.length}:${state.workouts.length}`;
  if (activeModal === "picker" && signature !== lastCatalogSignature) renderExercisePicker();
  lastCatalogSignature = signature;
  if (activeView === "workout") renderBuilder();
  renderActiveCharts();
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    renderAll();
  });
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let pendingWorker = null;
  let reloading = false;
  const banner = document.querySelector("#update-banner");
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
      const showUpdate = worker => { pendingWorker = worker; banner.hidden = false; };
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
        });
      });
      registration.update().catch(console.error);
    } catch (error) {
      console.error("Service worker registration failed", error);
    }
  });
  document.querySelector("#update-button").addEventListener("click", () => pendingWorker?.postMessage({ type: "SKIP_WAITING" }));
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function shiftHistoryPeriod(delta) {
  if (!periodCanShift(delta)) return;
  const date = parseDate(calendarMonth);
  if (state.settings.historyViewMode === "year") date.setFullYear(date.getFullYear() + delta);
  else date.setMonth(date.getMonth() + delta);
  calendarMonth = startOfMonth(localDateString(date));
  renderCalendar();
}

function bindEvents() {
  elements.authForm.addEventListener("submit", submitAuth);
  elements.signOut.addEventListener("click", () => { void handleSignOut(); });

  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => navigateTo(button.dataset.view)));
  document.querySelectorAll("[data-go-view]").forEach(button => button.addEventListener("click", () => navigateTo(button.dataset.goView)));
  document.querySelector("#header-start-workout").addEventListener("click", () => startNewWorkout());

  document.querySelectorAll("[data-open-picker]").forEach(button => button.addEventListener("click", () => openModal("picker")));
  document.querySelectorAll("[data-close-modal]").forEach(button => button.addEventListener("click", closeModal));
  elements.modalBackdrop.addEventListener("click", event => { if (event.target === elements.modalBackdrop && !confirmationResolver && !durationResolver) closeModal(); });
  document.querySelector("#confirm-cancel").addEventListener("click", () => resolveConfirmation(false));
  document.querySelector("#confirm-accept").addEventListener("click", () => resolveConfirmation(true));
  document.querySelector("#duration-cancel").addEventListener("click", () => resolveDurationEstimate(null));
  document.querySelector("#duration-save").addEventListener("click", () => {
    const value = Math.min(1440, Math.max(1, Number(document.querySelector("#duration-estimate-input").value) || estimateDraftDurationMin()));
    resolveDurationEstimate(value);
  });

  document.querySelector("#exercise-search").addEventListener("input", renderExercisePicker);
  document.querySelector("#picker-filters").addEventListener("click", event => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    pickerFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
    renderExercisePicker();
  });
  document.querySelector("#exercise-picker-list").addEventListener("click", event => {
    const button = event.target.closest("[data-add-exercise]");
    if (button) addExerciseToDraft(button.dataset.addExercise);
  });

  document.querySelector("#workout-form").addEventListener("submit", submitWorkout);
  document.querySelector("#workout-date").addEventListener("input", event => {
    draftWorkout.date = event.target.value;
  });
  document.querySelector("#clear-draft").addEventListener("click", async () => {
    const accepted = await askConfirmation("Clear session?", "All unsaved exercises and values will be removed.", "Clear");
    if (accepted) { draftWorkout = createEmptyDraft(); renderBuilder(); }
  });
  document.querySelector("#delete-workout").addEventListener("click", async () => {
    if (!draftWorkout.id) return;
    const accepted = await askConfirmation("Delete workout?", "This session will be removed from the local cache and Firebase.", "Delete");
    if (!accepted) return;
    await deleteWorkout(draftWorkout.id);
    draftWorkout = createEmptyDraft();
    renderBuilder();
    navigateTo("dashboard");
    showToast("Workout deleted");
  });

  elements.builderList.addEventListener("input", event => {
    const input = event.target;
    const entryIndex = Number(input.dataset.entry);
    if (!Number.isInteger(entryIndex)) return;
    markDraftStarted();
    if (input.dataset.setField != null) {
      const setIndex = Number(input.dataset.set);
      const field = input.dataset.setField;
      draftWorkout.exercises[entryIndex].sets[setIndex][field] = input.value;
    }
    if (input.dataset.activityField != null) {
      draftWorkout.exercises[entryIndex].activity ??= {};
      draftWorkout.exercises[entryIndex].activity[input.dataset.activityField] = input.value;
    }
    updateEntryPreview(entryIndex);
  });
  elements.builderList.addEventListener("change", event => {
    const input = event.target;
    const entryIndex = Number(input.dataset.entry);
    if (Number.isInteger(entryIndex) && input.dataset.activityField != null) {
      markDraftStarted();
      draftWorkout.exercises[entryIndex].activity[input.dataset.activityField] = input.value;
      updateEntryPreview(entryIndex);
    }
  });
  elements.builderList.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const index = Number(button.dataset.entry);
    const action = button.dataset.action;
    if (action === "remove-exercise") { removeDraftExercise(index); return; }
    if (action === "add-set") {
      const entry = draftWorkout.exercises[index];
      const previous = entry.sets.at(-1) ?? { weightKg: 0, reps: 10, seconds: 30, rir: "" };
      entry.sets.push({ ...deepClone(previous), completed: false });
      markDraftStarted();
      renderBuilder();
    }
    if (action === "remove-set") {
      const entry = draftWorkout.exercises[index];
      if (entry.sets.length > 1) entry.sets.pop();
      markDraftStarted();
      renderBuilder();
    }
  });

  document.querySelector("#calendar-prev").addEventListener("click", () => shiftHistoryPeriod(-1));
  document.querySelector("#calendar-next").addEventListener("click", () => shiftHistoryPeriod(1));
  document.querySelector("#calendar-grid").addEventListener("click", event => {
    const day = event.target.closest("[data-calendar-date]");
    const month = event.target.closest("[data-history-month]");
    if (day) selectedCalendarDate = day.dataset.calendarDate;
    if (month) selectedHistoryMonth = month.dataset.historyMonth;
    if (day || month) renderCalendar();
  });

  document.addEventListener("click", event => {
    const info = event.target.closest("[data-info]");
    if (info) {
      toggleInfoPopover(info);
      return;
    }
    if (!event.target.closest(".info-popover")) closeInfoPopovers();

    const zone = event.target.closest("[data-zone-muscles]");
    if (zone) {
      selectedMuscleKey = zoneMuscleKeys(zone)[0] ?? null;
      renderMuscles();
      return;
    }
    if (selectedMuscleKey && !event.target.closest("#selected-muscle-panel") && !event.target.closest(".body-controls")) {
      selectedMuscleKey = null;
      renderMuscles();
    }

    const addFromMuscle = event.target.closest("#selected-muscle-panel [data-add-exercise]");
    if (addFromMuscle) {
      startNewWorkout();
      addExerciseToDraft(addFromMuscle.dataset.addExercise);
      return;
    }

    const open = event.target.closest("[data-open-workout]");
    if (open) openWorkoutDetail(open.dataset.openWorkout);
    const edit = event.target.closest("[data-edit-workout]");
    if (edit) {
      const workout = state.workouts.find(item => item.id === edit.dataset.editWorkout);
      closeModal();
      if (workout) startNewWorkout(workout, true);
    }
    const repeat = event.target.closest("[data-repeat-workout]");
    if (repeat) {
      const workout = state.workouts.find(item => item.id === repeat.dataset.repeatWorkout);
      closeModal();
      if (workout) startNewWorkout(workout, false);
    }
  });

  ["stats-window", "weekly-metric"].forEach(id => document.querySelector(`#${id}`).addEventListener("change", () => { renderStats(); renderActiveCharts(); }));
  document.querySelector("#progress-search").addEventListener("input", event => {
    progressSearchQuery = event.target.value;
    renderStats();
  });
  document.querySelector("#progress-exercise-list").addEventListener("click", event => {
    const button = event.target.closest("[data-progress-exercise]");
    if (!button) return;
    selectedProgressExerciseId = button.dataset.progressExercise;
    renderStats();
    renderActiveCharts();
  });
  document.querySelector("#progress-metric-buttons").addEventListener("click", event => {
    const button = event.target.closest("[data-progress-metric]");
    if (!button) return;
    selectedProgressMetric = button.dataset.progressMetric;
    renderStats();
    renderActiveCharts();
  });
  document.querySelector("#body-view-toggle").addEventListener("click", () => {
    bodyViewMode = bodyViewMode === "front" ? "back" : "front";
    selectedMuscleKey = null;
    renderMuscles();
  });
  document.querySelector("#muscle-sort-toggle").addEventListener("click", () => {
    muscleSortAscending = !muscleSortAscending;
    renderMuscles();
  });
  document.querySelector("#settings-form").addEventListener("submit", submitSettings);
  document.querySelector("#setting-birth-year").addEventListener("input", event => {
    const age = Math.max(0, new Date().getFullYear() - Number(event.target.value || DEFAULT_SETTINGS.birthYear));
    document.querySelector("#setting-age-preview").textContent = `Calculated age: ${age}`;
  });
  ["setting-theme", "setting-motion"].forEach(id => document.querySelector(`#${id}`).addEventListener("change", () => {
    applyAppearance({ ...state.settings, theme: document.querySelector("#setting-theme").value, motion: document.querySelector("#setting-motion").value });
    renderActiveCharts();
  }));
  document.querySelector("#open-rank-guide").addEventListener("click", () => {
    renderRankGuide();
    openModal("ranks");
  });

  document.querySelector("#open-sync-choice").addEventListener("click", async () => {
    try {
      renderSyncSummary(await getSyncSummary());
      openModal("sync");
    } catch (error) {
      showToast("Sync check failed", firebaseErrorMessage(error), "error");
    }
  });
  document.querySelectorAll("[data-sync-choice]").forEach(button => button.addEventListener("click", () => handleSyncChoice(button.dataset.syncChoice)));
  document.querySelector("#export-data").addEventListener("click", exportBackup);
  document.querySelector("#import-data").addEventListener("change", event => importBackup(event.target.files?.[0]));
  const resetInput = document.querySelector("#reset-confirm");
  const resetButton = document.querySelector("#reset-all-data");
  resetInput.addEventListener("input", () => {
    resetButton.disabled = resetInput.value.trim().toUpperCase() !== "RESET";
  });
  resetButton.addEventListener("click", async () => {
    if (resetInput.value.trim().toUpperCase() !== "RESET") return;
    const accepted = await askConfirmation("Reset all data?", "Every workout, legacy saved structure and saved preference will be deleted from this account.", "Reset");
    if (!accepted) return;
    try {
      await resetAllData();
      resetInput.value = "";
      resetButton.disabled = true;
      showToast("Data reset", "Ascend is back to a clean account state.");
    } catch (error) {
      showToast("Reset failed", firebaseErrorMessage(error), "error");
    }
  });
  window.addEventListener("online", updateSyncStatus);
  window.addEventListener("offline", updateSyncStatus);
}

setStoreErrorHandler(error => showToast("Synchronization error", firebaseErrorMessage(error), "error"));
subscribeState(scheduleRender);
bindEvents();
redrawOnResize(renderActiveCharts);
setupServiceWorker();
initializeAuthentication();
