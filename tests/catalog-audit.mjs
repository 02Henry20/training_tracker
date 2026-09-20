// Regenerate the human-readable input/MET inventory after catalog edits.
import { writeFile } from 'node:fs/promises';
import { BUNDLED_EXERCISES } from '../js/exercises.js';
const rows=[...BUNDLED_EXERCISES].sort((a,b)=>a.name.localeCompare(b.name)).map(e=>{
  const inputs=e.inputType==='activity' ? e.fields.join(', ') : `${e.inputType==='timedSets'?'seconds':e.loadMode==='assistance'?'assistance kg + reps':e.loadMode==='added'?'added kg + reps':'weight kg + reps'}; rest; optional time/tempo${e.unilateral?'; per side':''}`;
  const model=e.inputType!=='activity' ? `${e.calorie.sessionMet} (category proxy)` : e.calorie.intensityMets ? Object.entries(e.calorie.intensityMets).map(([k,v])=>`${k}: ${v}`).join('; ') : `${e.calorie.baseMet} default; ${e.activityType} model`;
  return `| ${e.name} | ${e.id} | ${inputs} | ${model} |`;
});
await writeFile(new URL('../docs/exercise-audit.md',import.meta.url),`# Exercise inventory\n\n${rows.length} bundled entries. Generated with \`node tests/catalog-audit.mjs\`.\n\nSee [calorie methodology](calorie-methodology.md) for published sources, overrides, assumptions and estimation limits. A default MET is not necessarily the MET used when pace, stroke, power or intensity is supplied. Strength METs are proxies for categories, not measured values for each named movement.\n\n| Exercise | Stable ID | Inputs | MET / model |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`);
console.log(`Wrote audit for ${rows.length} exercises.`);
