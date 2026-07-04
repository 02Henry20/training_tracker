# Ascend

Ascend is a mobile-first progressive web app for logging gym sessions and endurance activities with ranks, XP, history, statistics and muscle-balance feedback. It uses the same Firebase project as CalStat but stores its data under a separate Firestore path.

## Included Functionality

- Strength sessions with editable sets, load and repetitions
- Optional RIR fields controlled from Settings
- Running, walking, hiking, swimming, cycling, rowing, elliptical, stairs and jump-rope inputs
- Previous performance used as the next editable exercise default
- Estimated 1RM, training volume, PR detection and per-exercise ranks
- Player rank/XP system with E/E+ through Monarch stages
- Last-training recency and weekly consistency streak
- Progress view with history by month or compact year view
- Statistics by configurable period, weekly frequency and exercise progression charts
- Muscle-group coverage, weak/missing groups and recovery recency
- Custom private exercises
- Firestore synchronization, device/cloud sync resolver, offline unlock after a cached login and JSON backup/import
- Total reset with typed confirmation
- PWA manifest, service worker and Android maskable icons

## Project Structure

```text
training-track-app/
|-- index.html
|-- manifest.webmanifest
|-- service-worker.js
|-- firestore.rules
|-- icons/
|-- styles/
|   |-- base.css
|   |-- components.css
|   |-- layout.css
|   |-- responsive.css
|   `-- redesign.css
`-- js/
    |-- app.js
    |-- calculations.js
    |-- charts.js
    |-- exercises.js
    |-- firebase-config.js
    |-- firebase.js
    `-- store.js
```

The main exercise library is isolated in `js/exercises.js`. Each definition contains its input type, default prescription, load interpretation, muscle targets, approximate MET value and ranking standard.

## Firebase Setup

1. Enable Email/Password under Firebase Authentication.
2. Open Firestore Database -> Rules.
3. Replace the current rules with `firestore.rules` from this project, then publish.
4. Deploy the files to Cloudflare Pages, Firebase Hosting, GitHub Pages or another HTTPS static host.

The user data path is:

```text
/apps/training-track/users/{firebaseUid}/workouts/{workoutId}
/apps/training-track/users/{firebaseUid}/customExercises/{exerciseId}
/apps/training-track/users/{firebaseUid}/settings/preferences
```

Legacy `templates` documents may still exist from older builds; the current interface does not expose them, and total reset deletes those legacy records.

## Shared Exercise Updates

The app always loads its bundled definitions first. It then merges authenticated documents from:

```text
/apps/training-track/exerciseCatalog/{exerciseId}
```

A remote document can replace a bundled definition by using the same `id`, or add a new exercise with a new `id`. Client writes to this collection are intentionally blocked; publish updates through the Firebase console or a trusted Admin SDK script.

## Calculation Notes

- Loaded exercises use the Epley estimated-one-repetition-maximum formula and compare the result with current body weight.
- Bodyweight movements use best repetitions plus a small added-weight adjustment.
- Timed core movements use duration; endurance activities use average speed.
- Calories use the standard MET formula: `MET * 3.5 * body weight kg / 200 * minutes`.
- Strength calories combine estimated active repetition time and between-set rest time.
- Muscle coverage gives primary muscles one effective set and secondary muscles 0.45 effective sets.

All rankings and calorie values are approximate training references. Machine calibration, technique, rest duration, terrain, body composition and individual efficiency can materially change the result.

## Local Preview

The application uses JavaScript modules, so open it through a local server rather than `file://`.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/` when the command is run inside this folder.
