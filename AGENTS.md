<!-- AI-TOOLING-MANAGED:START -->
## AI Coding Tooling

### Startup
At the beginning of work in this repository:
- ensure Graphify repository data exists (graphify-out/graph.json)
- if missing, initialize with graphify extract . --code-only (AST-only; no deep LLM analysis)
- if stale after code changes, run graphify update .
- activate the current project in Serena if necessary
- do not repeat expensive initialization when already configured

### Repository exploration
Preferred order (lowest-token reliable source first):
1. Graphify for architecture, call relationships, dependency paths, and locating relevant code
2. Serena for symbol-level navigation, definitions, references, semantic understanding, refactoring, and precise edits
3. Native grep/search/read only when Graphify or Serena are insufficient, or when direct text inspection is clearly cheaper

Before broad recursive repository exploration, query Graphify.
Do not read large files when Serena can retrieve the required symbol/section.
Do not rediscover architecture already present in the Graphify graph.

### Graphify maintenance
After meaningful code changes: graphify update . (incremental). Do not run deep analysis unless needed.

### Shell/tool output
Use RTK-compressed command output whenever supported (rtk prefix / Cursor RTK hook).
Fall back to raw/full output when debugging requires information RTK removed.
Correctness always has priority over token reduction.

### Serena project memory
Store durable repo knowledge in Serena memory (architecture, module responsibilities, design decisions, pitfalls, build/test knowledge, conventions).
Do NOT store temporary task state, shell dumps, transient errors, transcripts, or obvious code-recoverable facts.
Prefer updating an existing memory over creating many tiny ones.

### AGENTS.md maintenance
Keep AGENTS.md small. It is NOT a project diary.
Update it only for durable project-wide instructions (build/test commands, conventions, architecture rules, tooling, permanent constraints).
Never modify user-written content outside this managed block unless clearly obsolete and directly related to the task.

### Task completion
After a substantial task: validate/tests as relevant; graphify update . if structure changed; store reusable knowledge in Serena memory; update AGENTS.md only for durable always-relevant instruction changes.
<!-- AI-TOOLING-MANAGED:END -->

