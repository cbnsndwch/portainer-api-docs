# AGENTS.md — AI Agent Context for portainer-ce-api-docs

This document describes the repository layout, available tooling, prompt system,
and the typical workflow for working in this project as an AI agent (Copilot,
opencode, Claude Code, Codex, etc.).

---

## What this repo is

A **Next.js / Fumadocs** documentation site that publishes the Portainer REST
API reference. The authoritative source is an OpenAPI 3.1.0 YAML file
(`content/oas/portainer-ce/<version>.yml`); MDX documentation pages are
**generated from it** and committed alongside the site source.

---

## Repository layout

```plain
content/
  oas/
    portainer-ce/
      <version>.yml          # OAS 3.1.0 spec (the source of truth)
      convert.config.json    # Tag descriptions, tag groups, server description
  docs/
    index.mdx / meta.json   # Top-level nav
    getting-started/         # Hand-written intro pages
    v<version>/              # Generated per-version reference
      index.mdx
      meta.json
      endpoints/<tag>/       # One MDX file per endpoint operation
      entities/<tag>/        # Overview MDX page per tag group

scripts/
  convert-to-oas31.ts        # Swagger 2.0 → OAS 3.1.0 converter
  convert-to-oas31.md        # Full documentation for the converter script
  generate-docs.ts           # OAS → MDX generator (writes content/docs/v*/)
  ralph/
    ralph.ts                 # Iterative AI agent loop runner
    prompts/
      default.md             # Prompt template for single-task mode
      tasks.md               # Prompt template for tasks-list mode
    package.json

src/                         # Next.js / Fumadocs application source
  app/
  components/
  lib/
```

---

## Key scripts (`pnpm <script>`)

| Script          | Command                                        | What it does                                          |
| --------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `dev`           | `next dev`                                     | Start the local dev server at <http://localhost:3000> |
| `build`         | `next build`                                   | Production build                                      |
| `convert-oas`   | `tsx scripts/convert-to-oas31.ts`              | Convert a Swagger 2.0 file to OAS 3.1.0               |
| `generate-docs` | `tsx scripts/generate-docs.ts`                 | Regenerate all MDX docs from OAS files                |
| `ralph`         | `tsx scripts/ralph/ralph.ts`                   | Run the Ralph iterative AI loop                       |
| `lint`          | `eslint`                                       | Lint the project                                      |
| `types`         | `fumadocs-mdx && next typegen && tsc --noEmit` | Full type check                                       |
| `format`        | `prettier --write .`                           | Format all files                                      |

> `generate-docs` is not in `package.json` `scripts` yet — invoke it directly:
> `pnpm tsx scripts/generate-docs.ts`

---

## Typical workflow for adding a new API version

1. **Place the Swagger 2.0 source** in `content/oas/portainer-ce/`.

2. **Convert to OAS 3.1.0:**

    ```sh
    pnpm convert-oas content/oas/portainer-ce/<swagger-file>.yml
    ```

    This writes `content/oas/portainer-ce/3.1.0.yml` (or the detected OAS
    version) next to the input. The converter auto-loads
    `content/oas/portainer-ce/convert.config.json` for tag descriptions, tag
    groups, and server descriptions.

3. **Rename the output** to the Portainer version string, e.g.:

    ```sh
    mv content/oas/portainer-ce/3.1.0.yml content/oas/portainer-ce/2.34.0.yml
    ```

    Then update the `info.version` field inside the file to match.

4. **Generate the MDX docs:**

    ```sh
    pnpm tsx scripts/generate-docs.ts
    ```

    This scans every `*.yml` in `content/oas/portainer-ce/`, deletes the
    previously generated `content/docs/v*/` trees, and regenerates them.
    The top-level `content/docs/meta.json` is also rewritten with the new
    version listed first.

5. **Verify locally:**

    ```sh
    pnpm dev
    ```

    Open <http://localhost:3000> and check the new version appears in the sidebar.

---

## `convert-to-oas31` — converter script

> Full documentation: [scripts/convert-to-oas31.md](scripts/convert-to-oas31.md)

**Pipeline (4 steps):**

1. Text substitutions — built-in + config (e.g. `environments(endpoints)` →
   `endpoints`)
2. `swagger2openapi` — Swagger 2.0 → OAS 3.0.0
3. Schema upgrade — OAS 3.0.0 → 3.1.0 (`nullable`, `exclusiveMinimum/Maximum`)
4. Post-conversion cleanup — security schemes, servers, tags, `x-tagGroups`

**Config file** (`convert.config.json` next to the input, or `--config <path>`):

```jsonc
{
    "serverDescription": "...",
    "tagDescriptions": { "auth": "..." },
    "tagGroups": [{ "name": "Auth", "tags": ["auth"] }],
    "textReplacements": [{ "find": "old", "replace": "new" }]
}
```

The Portainer CE config lives at
`content/oas/portainer-ce/convert.config.json`.

---

## `generate-docs` — MDX generation script

- Reads all `*.yml` files from `content/oas/portainer-ce/`.
- For each version, generates:
    - `content/docs/v<version>/index.mdx` — version landing page
    - `content/docs/v<version>/meta.json` — Fumadocs nav metadata
    - `content/docs/v<version>/endpoints/<tag>/<method>-<path>.mdx` — one file
      per operation
    - `content/docs/v<version>/entities/<tag>/overview.mdx` — tag overview page
- Tag order in the sidebar follows `x-tagGroups` in the OAS file, then
  alphabetically for ungrouped tags.
- **Always re-run this after editing the OAS file or the converter config.**

---

## Ralph — iterative AI agent loop

Ralph (`scripts/ralph/ralph.ts`) is a CLI tool that drives an external AI coding
agent (opencode, claude-code, or codex) in an iterative loop until a task is
complete.

### Usage

```sh
# Single task
pnpm ralph "Your task description"

# With a structured task list (reads/updates .ralph/ralph-tasks.md)
pnpm ralph --tasks "Work through the task list"

# Useful options
pnpm ralph "task" --agent opencode       # default agent
pnpm ralph "task" --agent claude-code
pnpm ralph "task" --max-iterations 10
pnpm ralph "task" --no-commit            # don't auto-commit after each iteration

# Management commands
pnpm ralph --status                      # show current loop state & history
pnpm ralph --add-context "hint"          # inject mid-loop context
pnpm ralph --list-tasks                  # show .ralph/ralph-tasks.md
pnpm ralph --add-task "description"      # append a task to the list
```

### How it works

1. Builds a prompt from `scripts/ralph/prompts/default.md` (or `tasks.md` in
   tasks mode) by interpolating run-time variables (iteration number, task text,
   context, task list contents, etc.).
2. Spawns the selected agent with that prompt.
3. Checks the agent's output for a completion signal:
    - Default mode: `<promise>COMPLETE</promise>`
    - Tasks mode: `<promise>READY_FOR_NEXT_TASK</promise>` per task, then
      `<promise>COMPLETE</promise>` when all tasks are done.
4. If `--no-commit` is not set, auto-commits changes after each iteration
   (using a `.github/prompts/do-commits.prompt.md` semantic commit prompt if
   present, otherwise a fallback `git commit`).
5. Persists state in `.ralph/` so a loop can be paused (Ctrl+C) and resumed.

### Prompt templates

| File                               | Used when                    |
| ---------------------------------- | ---------------------------- |
| `scripts/ralph/prompts/default.md` | Standard single-task loop    |
| `scripts/ralph/prompts/tasks.md`   | `--tasks` / `-t` flag is set |

Variables available in templates (Handlebars-style):

| Variable                                  | Description                                   |
| ----------------------------------------- | --------------------------------------------- |
| `{{iteration}}`                           | Current iteration number                      |
| `{{minIterations}}` / `{{maxIterations}}` | Iteration bounds                              |
| `{{task}}`                                | The task description passed on the CLI        |
| `{{completionPromise}}`                   | The string the agent must emit to signal done |
| `{{taskPromise}}`                         | Per-task completion signal (tasks mode)       |
| `{{context}}`                             | Mid-loop context injected via `--add-context` |
| `{{tasksFile}}`                           | Path to the tasks markdown file               |
| `{{tasksContent}}`                        | Full contents of the tasks file               |
| `{{currentTask}}`                         | Currently in-progress task text               |
| `{{nextTask}}`                            | Next pending task text                        |
| `{{allComplete}}`                         | Boolean — all tasks marked `[x]`              |

---

## Content structure conventions

- **`content/oas/`** — raw OAS source files. Never edit generated MDX manually;
  regenerate from the OAS instead.
- **`content/docs/getting-started/`** — hand-written pages; safe to edit.
- **`content/docs/v*/`** — fully generated; do not edit by hand. Changes will be
  overwritten by the next `generate-docs` run.
- **`meta.json` files** control Fumadocs sidebar ordering and labels.

---

## Environment / stack notes

- **Package manager:** `pnpm` (workspace defined in `pnpm-workspace.yaml`)
- **Runtime:** Node.js; TypeScript run directly via `tsx`
- **Framework:** Next.js 16 + Fumadocs UI/MDX 16 + Tailwind CSS 4
- **No test suite** is currently configured; verify changes with `pnpm types`
  and `pnpm dev`.
