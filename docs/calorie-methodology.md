# Exercise and calorie review — September 2026

Ascend estimates **gross energy expenditure**, including resting energy during a
logged bout. It does not report net/active calories and should not be added to a
daily calorie target that already includes the same exercise.

`kcal = MET × 3.5 × body weight (kg) ÷ 200 × minutes`

This oxygen-equivalent convention differs by about 5% from the simplified
`MET × kg × hours` convention. Neither is an individual measurement. New workouts
store body weight at logging time; older workouts without it use current settings.
Body weight scales *every* activity, including calisthenics. Added kilograms are
not multiplied into metabolic body weight: load × reps alone cannot predict
energy cost without movement range, efficiency, tempo and rest.

Historical displays are recalculated with the revised model, so calorie and XP
totals may change. Raw saved exercise inputs are preserved; historical body weight
is not invented for records that never stored it.

## Published sources checked online

2024 Adult Compendium of Physical Activities (ages 19–59), Herrmann et al.,
Journal of Sport and Health Science 13(1), 6–12.

- [Definitions and citation](https://pacompendium.com/)
- [Resistance, conditioning, rowing, yoga, Pilates](https://pacompendium.com/conditioning-exercise/)
- [Swimming strokes and water activities](https://pacompendium.com/water-activities/)
- [Cycling and stationary power](https://pacompendium.com/bicycling/)
- [Running speeds](https://pacompendium.com/running/)
- [Walking and hiking](https://pacompendium.com/walking/)
- [Sports](https://pacompendium.com/sports/)
- [Winter activities](https://pacompendium.com/winter-activities/)

## Resistance and bodyweight exercises

Individual named lifts generally have no defensible, separate measured MET.
All catalog lifts use a **category proxy**, not invented lift-specific precision:

| Category | MET | Reference |
| --- | ---: | --- |
| General resistance, 8–15 reps | 3.5 | 02054 |
| Squat / hinge movements | 5.0 | 02052 (squats, deadlifts); analogous lifts estimated |
| Moderate calisthenics | 3.8 | 02022 |
| Vigorous calisthenics | 7.5 | 02020; assigned to vigorous movements |
| Light core / static holds | 2.8 | 02024; other holds estimated |

These describe a training bout, including normal rests. Applying them only to
seconds moving and then applying a low MET during every rest would discount rest
twice. The revised model applies the category MET to entered exercise time
(including rests), or estimates that time from reps/seconds and rest between
nonempty sets. In inferred time, rest exceeding three minutes per gap is assigned
1.5 MET (an app estimate). Unallocated session time uses 1.8 MET (an app estimate).
Extra session time is included only when longer than the sum of exercise times.
If session time is shorter, recorded exercise times take priority.

Default tempo (3–3.2 seconds/rep) is an estimate and can be changed. Measured
exercise duration is preferable. Unilateral reps/hold seconds are entered **per
side**, and elapsed work counts both sides. Two dumbbells held at once count both
loads; per-side cable load is not doubled twice. Volume is a separate training
metric; estimated bodyweight fractions in volume do not alter metabolic weight.
Assisted dips/pull-ups subtract assistance from volume and have no unsupported
strength rank. More assistance must not produce a better rank.

Existing rank curves are gamification references, not clinical or competition
standards. Added strength variants without a credible curve show “No rank data”.
Repetition/hold thresholds are progression targets, not population percentiles.

## Activities

- Swimming has searchable freestyle, breaststroke, backstroke, butterfly and
  sidestroke entries, plus general and open-water swimming. Fixed stroke entries
  cannot silently revert to freestyle when serialized. Breaststroke: 5.3 MET
  recreational / 10.3 vigorous (18265/18260); backstroke 4.8 / 9.5
  (18255/18250); butterfly 13.8 (18270); sidestroke 7.0 (18320).
- Freestyle recreational 5.8, vigorous 9.8 (18240/18230). When moderate effort
  includes distance, crawl speed references are 8.0 at 50 yd/min, 10.5 at 75,
  and 14.5 above 90 (18290/18280/18294). Band boundaries are app estimates;
  intensity takes priority for explicitly light/vigorous effort.
- Rowing machine uses watts: <100 = 5.0, 100–149 = 7.5, 150–199 = 11.0,
  ≥200 = 14.0 (02071–02074). Without power, intensity uses 5.0/7.3/11.0 as
  approximate effort categories. Seated **cable row is resistance**, separate
  from the ergometer and outdoor rowing.
- Stationary cycling uses Compendium power ranges (01210–01248). Gaps between
  published bands use nearest neighboring ranges; displayed intensity is a
  fallback when power is absent. Outdoor cycling uses speed categories.
- Running and walking use published speed bands; interpolation boundaries are
  estimates. Missing distance uses a general pace. Steps can estimate walking
  distance from height. Outdoor elevation bonuses and hiking pack bonuses remain
  bounded heuristics, not published formulas. Elevation alone cannot imply grade.
- Treadmill incline adds the vertical oxygen-cost term of the standard ACSM
  walking/running equations (1.8 / 0.9 × m/min × grade ÷ 3.5). This is a hybrid
  estimate on top of Compendium flat-speed MET, not a directly measured value;
  grade has no effect without speed. Handrail support is not modeled.
- Sport intensity selections now select explicit MET profiles. Where no exact
  light/moderate/vigorous trio exists, related reference activities serve as
  proxies: e.g. recreational/competitive play, climbing difficulty, and easier
  paddling. Mountain-bike light, HIIT light and some equipment effort fallbacks
  are analogous estimates. All profiles are inspectable in `js/exercises.js`.
- Use active time for skiing, climbing, intervals and pool sessions; omit lifts,
  belaying, long rests and pauses. Duration-only activities deliberately do not
  show nonfunctional intensity or distance controls.

## Compatibility and validation

Bundled IDs remain stable. Catalog revision 2 prevents older cloud documents from
silently replacing reviewed bundled input/calorie definitions. Intentional cloud
overrides of existing IDs must declare `catalogRevision: 2` (or greater). New cloud
IDs and private custom IDs continue to work. Private IDs cannot shadow bundled IDs.
Unknown muscle keys are filtered and legacy `shoulders` maps to `sideDelts`.

Old releases wrote `completed: false` on newly added sets without a completion
control. Such entries continue to count exactly as before. New entries declare
`trackCompletion: true`, with visible set toggles; skipped sets contribute nothing.

Run `node tests/smoke.mjs`, `node tests/regression.mjs`, and
`node tests/store.mjs`. `node tests/preview.mjs` serves a localhost-only synthetic
UI fixture with Firebase stubbed. It must not be used as a production server.
The fixture never loads real account data or sends writes to Firebase.

The review also corrected partial-week chart omissions, inconsistent session/player
XP, exact XP threshold rounding, zero-rest persistence, edit/import timestamps,
and an offline recovery issue: incoming cloud snapshots could overwrite pending
device edits before the sync comparison. Pending offline bundles now remain
protected until that choice is resolved. Real Firebase network behavior still
requires integration verification with a test account; the regression suite uses
a stubbed backend.
