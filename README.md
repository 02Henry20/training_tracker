# Training Track

Training Track is a mobile-first progressive web app for logging gym sessions and endurance activities. Version 0.2 uses a distinct industrial performance-logbook interface with a horizontal desktop command bar, compact mobile dock and sign-in-only entry screen. It uses the same Firebase project as CalStat but stores its data under a separate Firestore path.

## Included functionality

- Strength sessions with editable sets, load, repetitions, RIR and rest timer
- Running, walking, hiking, swimming, cycling, rowing, elliptical, stairs and jump-rope inputs
- Previous performance used as the next editable exercise default
- Estimated 1RM, training volume, PR detection and per-exercise ranks
- Rank/XP system, daily streak and weekly consistency streak
- Calendar heat levels based on estimated workout calories
- Statistics by configurable period, weekly frequency and exercise progression charts
- Muscle-group coverage, weak/missing groups and recovery recency
- Repeat-last-workout, reusable routines and custom private exercises
- Firestore synchronization, persistent offline cache and JSON backup/import
- PWA manifest, service worker and Android maskable icons

## Project structure

```text
training-track-app/
├── index.html
├── manifest.webmanifest
├── service-worker.js
├── firestore.rules
├── icons/
├── styles/
│   ├── base.css
│   ├── components.css
│   ├── layout.css
│   ├── responsive.css
│   └── redesign.css
└── js/
    ├── app.js
    ├── calculations.js
    ├── charts.js
    ├── exercises.js
    ├── firebase-config.js
    ├── firebase.js
    └── store.js
```

The main exercise library is deliberately isolated in `js/exercises.js`. Each definition contains its input type, default prescription, load interpretation, muscle targets, approximate MET value and ranking standard.

## Firebase setup

1. Enable **Email/Password** under Firebase Authentication.
2. Open **Firestore Database → Rules**.
3. Replace the current rules with `firestore.rules` from this project, then publish.
4. Deploy the files to Cloudflare Pages, Firebase Hosting, GitHub Pages or another HTTPS static host.

The user data path is:

```text
/apps/training-track/users/{firebaseUid}/workouts/{workoutId}
/apps/training-track/users/{firebaseUid}/templates/{templateId}
/apps/training-track/users/{firebaseUid}/customExercises/{exerciseId}
/apps/training-track/users/{firebaseUid}/settings/preferences
```

## Shared exercise updates

The app always loads its bundled definitions first. It then merges authenticated documents from:

```text
/apps/training-track/exerciseCatalog/{exerciseId}
```

A remote document can replace a bundled definition by using the same `id`, or add a new exercise with a new `id`. Client writes to this collection are intentionally blocked; publish updates through the Firebase console or a trusted Admin SDK script.

A minimal remote strength document looks like:

```json
{
  "id": "machine-row-new",
  "name": "New Machine Row",
  "active": true,
  "category": "strength",
  "inputType": "sets",
  "equipment": "Machine",
  "pattern": "Horizontal pull",
  "loadMode": "total",
  "muscles": {
    "primary": ["upperBack", "lats"],
    "secondary": ["biceps", "rearDelts"]
  },
  "defaults": { "sets": 3, "reps": 10, "restSeconds": 90 },
  "calorie": { "activeMet": 3.5, "restMet": 2, "repSeconds": 3.2 },
  "standard": null
}
```

## Calculation notes

- Loaded exercises use the Epley estimated-one-repetition-maximum formula and compare the result with current body weight.
- Bodyweight movements use best repetitions plus a small added-weight adjustment.
- Timed core movements use duration; endurance activities use average speed.
- Calories use the standard MET formula: `MET × 3.5 × body weight kg ÷ 200 × minutes`.
- Strength calories combine estimated active repetition time and between-set rest time.
- Muscle coverage gives primary muscles one effective set and secondary muscles 0.45 effective sets.

All rankings and calorie values are approximate training references. Machine calibration, technique, rest duration, terrain, body composition and individual efficiency can materially change the result.

## Local preview

The application uses JavaScript modules, so open it through a local server rather than `file://`.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/training-track-app/` when serving from the parent directory, or `http://localhost:8080/` when the command is run inside this folder.
