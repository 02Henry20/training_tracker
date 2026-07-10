# Ascend

Ascend is a mobile-first progressive web app for tracking strength training, endurance work, recovery, ranks, XP, and long-term progress. It is built for people who want a focused training log that feels more like a personal progression system than a spreadsheet.

The app runs as a static site, works offline after first load, and syncs private user data through Firebase.

## What It Does

Ascend helps you record training sessions, understand progress, and keep a clear view of what your body has been doing recently.

- Log strength sessions with exercises, sets, reps, weight, rest time, and optional RIR.
- Track endurance and activity work including running, walking, hiking, swimming, cycling, rowing, elliptical, stairs, and jump rope.
- See estimated 1RM, volume, calories, personal records, and per-exercise rank feedback.
- Earn XP and progress through player-style rank stages from early levels to Monarch.
- Review training history by month, day, and compact year views.
- Analyze weekly consistency, recency, exercise progression, and muscle balance.
- Spot weak, missing, or undertrained muscle groups across recent training.
- Create private custom exercises alongside the bundled exercise library.
- Import and export JSON backups.
- Use the app as a PWA with offline support and installable mobile icons.

## Highlights

### Focused Workout Logging

Ascend is designed around quick session entry. It remembers previous performance, supports editable sets, and keeps exercise defaults practical so the next workout starts with useful numbers instead of a blank form.

### Progression System

Workouts produce XP based on real training output. Strength, endurance, consistency, PRs, and muscle coverage all feed into a ranked progression loop that gives the log a sense of momentum.

### Training Intelligence

The app calculates:

- Estimated one-rep max using the Epley formula
- Total volume load
- Approximate calories from MET-based calculations
- Exercise rank levels
- Weekly frequency
- Muscle coverage and recovery recency
- Progression chart data by exercise and metric

These numbers are training references, not medical or laboratory measurements, but they are useful for spotting trends and staying honest.

### Private Cloud Sync

Ascend uses Firebase Authentication and Firestore. User data is stored under an app-specific path, separate from other projects, and the client includes a sync resolver for local-vs-cloud data checks.

### Offline-Ready PWA

The service worker caches the app shell, styles, modules, manifest, and required icons. After a successful cached load, Ascend can reopen and display local data without a network connection.

## Tech Stack

- Static HTML, CSS, and JavaScript modules
- Firebase Authentication
- Cloud Firestore
- Progressive Web App manifest
- Service worker app-shell caching
- Node smoke test for core exercise and calculation logic

No build step is required.

## Project Structure

```text
Training_Tracker/
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
|-- js/
|   |-- app.js
|   |-- calculations.js
|   |-- charts.js
|   |-- exercises.js
|   |-- firebase-config.js
|   |-- firebase.js
|   `-- store.js
`-- tests/
    `-- smoke.mjs
```

## Firebase Setup

1. Create or open a Firebase project.
2. Enable Email/Password in Firebase Authentication.
3. Create a Cloud Firestore database.
4. Replace the Firestore rules with the contents of `firestore.rules`.
5. Confirm the config values in `js/firebase-config.js`.
6. Deploy the folder to any HTTPS static host.

User data is stored under:

```text
/apps/training-track/users/{firebaseUid}/workouts/{workoutId}
/apps/training-track/users/{firebaseUid}/customExercises/{exerciseId}
/apps/training-track/users/{firebaseUid}/settings/preferences
```

Shared exercise catalog updates can be published at:

```text
/apps/training-track/exerciseCatalog/{exerciseId}
```

A remote exercise document can replace a bundled exercise with the same `id`, or add a new exercise with a new `id`.

## Run Locally

Because Ascend uses JavaScript modules, serve the folder through a local web server instead of opening `index.html` directly.

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/
```

## Test

Run the smoke test with Node:

```bash
node tests/smoke.mjs
```

The test checks bundled exercise integrity, rank data, workout analysis, XP calculation, statistics, muscle balance, and fuzzy exercise search.

## Deploy

Ascend can be deployed as a plain static site. Good fits include:

- Firebase Hosting
- Cloudflare Pages
- GitHub Pages
- Netlify
- Vercel static hosting

Make sure the deployment is served over HTTPS so Firebase Auth, service workers, and PWA installation all work correctly.

## Notes

Training calculations are approximate. Machine calibration, body composition, technique, terrain, rest time, and individual efficiency can all change real-world results. Ascend is meant to help track patterns, not replace coaching, medical advice, or formal testing.
