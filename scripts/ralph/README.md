# Ralph Loop

A simplified, Node.js-based implementation of the [Ralph Wiggum technique](https://ghuntley.com/ralph/) for iterative AI development.

Runs an AI coding agent (Claude Code or Codex) in a self-correcting loop until your task is complete.

## Quick Start

```bash
# From project root
pnpm ralph "Add dark mode support to the dashboard"

# With options
pnpm ralph "Fix the auth bug" --max-iterations 10
```

## How It Works

1. Sends your task to the AI agent
2. Agent works on the task, sees its previous work in files
3. Checks output for completion promise (`<promise>COMPLETE</promise>`)
4. If not complete, repeats with the same prompt
5. Continues until completion detected or max iterations reached

The AI sees the same prompt each time, but the codebase has changed from previous iterations. This creates a powerful feedback loop where the agent iteratively improves its work.

## Commands

### Run a Task

```bash
pnpm ralph "Your task description" [options]
```

**Options:**

| Option                      | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| `--agent AGENT`             | AI agent: `claude-code` (default), `codex`                  |
| `--model MODEL`             | Model to use (agent-specific)                               |
| `--min-iterations N`        | Minimum iterations before completion (default: 1)           |
| `--max-iterations N`        | Maximum iterations before stopping (default: unlimited)     |
| `--completion-promise TEXT` | Phrase that signals completion (default: `COMPLETE`)        |
| `--tasks`, `-t`             | Enable Tasks Mode for structured task tracking              |
| `--task-promise TEXT`       | Phrase for task completion (default: `READY_FOR_NEXT_TASK`) |
| `--no-commit`               | Don't auto-commit after each iteration                      |
| `--allow-all`               | Auto-approve all tool permissions (default: on)             |
| `--no-allow-all`            | Require interactive permission prompts                      |

### Check Status

```bash
pnpm ralph --status
```

Shows current loop state, task list, iteration history, and struggle indicators.

### Add Context Mid-Loop

```bash
pnpm ralph --add-context "Focus on the map component first"
```

Injects guidance for the next iteration without stopping the loop.

### Task Management

```bash
# List tasks
pnpm ralph --list-tasks

# Add a task
pnpm ralph --add-task "Implement user profile page"

# Clear pending context
pnpm ralph --clear-context
```

## Tasks Mode

For complex multi-step work, use Tasks Mode:

```bash
pnpm ralph --tasks "Implement the new feature from PRD"
```

The agent will:

1. Work through tasks in `.ralph/ralph-tasks.md` one at a time
2. Mark tasks as `[/]` in-progress and `[x]` complete
3. Signal task completion with `<promise>READY_FOR_NEXT_TASK</promise>`
4. Signal full completion with `<promise>COMPLETE</promise>` when all done

Edit `.ralph/ralph-tasks.md` to define your task list:

```markdown
# Ralph Tasks

- [ ] Set up the data models
- [ ] Create the API endpoints
- [ ] Build the UI components
- [ ] Add tests
```

## Prompt Templates

Prompts are stored as Markdown templates in `scripts/ralph/prompts/`:

- `default.md` - Standard single-task prompt
- `tasks.md` - Tasks Mode prompt

Templates use a simple Handlebars-like syntax:

- `{{variable}}` - Variable substitution
- `{{#if condition}}...{{/if}}` - Conditional blocks
- `{{#if condition}}...{{else}}...{{/if}}` - If-else blocks

Available variables:

- `iteration`, `minIterations`, `maxIterations`
- `task`, `completionPromise`, `taskPromise`
- `context` - User-added mid-loop context
- `tasksContent`, `currentTask`, `nextTask`, `allComplete`

## Files

All state is stored in `.ralph/` at the project root:

| File                    | Description                   |
| ----------------------- | ----------------------------- |
| `ralph-loop.state.json` | Current loop state            |
| `ralph-history.json`    | Iteration history and metrics |
| `ralph-context.md`      | Pending user context          |
| `ralph-tasks.md`        | Task list for Tasks Mode      |

## Examples

```bash
# Simple task
pnpm ralph "Add a loading spinner to the dashboard"

# Complex task with limits
pnpm ralph "Refactor the auth system" --max-iterations 15

# Use Codex instead of Claude
pnpm ralph "Build the API" --agent codex

# Tasks mode for multi-step work
pnpm ralph --tasks "Implement State of Hack Night 2025 report"

# Check on running loop from another terminal
pnpm ralph --status

# Help the agent when stuck
pnpm ralph --add-context "The map data is in app/data/zip-counts.json"
```

## Stopping

- **Graceful stop:** Press `Ctrl+C` once
- **Force stop:** Press `Ctrl+C` twice
- **Manual cleanup:** Delete `.ralph/ralph-loop.state.json`
