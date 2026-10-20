# Code review — 20 October 2026

Reviewed the calculation and exercise modules, workout editor, authentication
transitions, local recovery, Firestore synchronization, backup handling, chart
code, offline service worker, and existing tests. The following confirmed bugs
were fixed. Priorities describe the original impact.

| Priority | Finding and trigger | Fix |
| --- | --- | --- |
| P1 | Workout and exercise IDs were interpolated directly into HTML attributes. A crafted backup could inject markup into history and detail views. | Escape IDs at each HTML sink; escape RIR values as well. |
| P1 | Drafts and pending dialogs survived sign-out/account changes. Async cloud reads and old snapshot callbacks could update another account's visible state. | Reset editor/timers/dialogs when the account changes; reject stale async results and ignore old listeners. |
| P1 | A partial or empty initial Firestore cache snapshot could overwrite the local recovery copy. Writes made under an authenticated but disconnected session did not retain the recovery flag. | Gate snapshot mirroring, preserve local history against empty cache snapshots, and retain pending recovery until acknowledgement. |
| P1 | Saving while an earlier device bundle was protected silently skipped persisting the new edit. | Persist new local mutations together with protected records. |
| P1 | Offline backup imports without IDs collapsed into one Map entry; editing such a workout could create another record. | Assign stable IDs before merging and normalize imported workout documents. |
| P2 | Rapid repeated Save actions could create duplicate workouts or replace a pending duration resolver. A finished save could clear a newer draft. | Guard submission, always release the guard, and verify draft/account identity after async steps. |
| P2 | Existing custom exercises were excluded from the runtime catalog, silently omitting their historical calories and training data. | Include saved custom definitions while retaining bundled ID protection. |
| P2 | Sync comparisons checked timestamps/date/name but ignored actual workout contents. Explicit sync could also retain the pending flag, or fail to persist an early cloud choice. | Compare canonical record contents, ignore acknowledgement-only timestamp changes, clear successful sync flags, and persist explicit cloud choices directly. |
| P2 | Invalid settings, including infinite statistics windows and zero targets, could reach calculations through backups or autosave. Top-level measurements on empty imported workouts bypassed validation. | Normalize numeric settings to bounded finite values; validate forms and import measurements/record IDs. |
| P2 | Bodyweight best-set selection used a different added-weight formula from rank evaluation. | Use the same weight-normalized score when selecting and evaluating the best set. |
| P2 | Calendar XP omitted PR bonuses and awarded base XP to empty/future workouts. Duplicate exercise entries could also manufacture PRs within one session. | Share the workout XP function and compare each session's best exercise result only with earlier sessions. |
| P2 | The displayed app version differed from the service worker cache version; the worker test assumed an outdated current version. | Align both versions at 0.4.2 and test that they remain aligned. |

## Verification

- `node tests/smoke.mjs`
- `node tests/regression.mjs`
- `node tests/store.mjs`
- `node tests/service-worker.mjs`
- `node tests/app.mjs`
- Syntax checks for all runtime JavaScript and `git diff --check`.

The app workflow tests execute actual application functions in a Node VM with
stubbed DOM/Firebase interfaces. Storage tests simulate cache/server responses,
account changes and delayed reads. These checks do not exercise a real Firebase
connection or establish visual correctness in a browser. The prior browser
preview attempt could not reach the local fixture server.
