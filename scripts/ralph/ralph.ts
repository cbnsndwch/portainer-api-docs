#!/usr/bin/env npx tsx
/**
 * Ralph Wiggum Loop for hello_miami
 *
 * A simplified, Node.js-based implementation of the Ralph Wiggum technique.
 * Runs an AI agent in a self-correcting loop until task completion.
 *
 * Usage:
 *   npx tsx scripts/ralph/ralph.ts "Your task description" [options]
 *   pnpm ralph "Your task description" [options]
 */

import { spawn, ChildProcess } from 'node:child_process';
import {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    unlinkSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERSION = '1.0.0';

// ============================================================================
// Configuration
// ============================================================================

interface AgentConfig {
    name: string;
    command: string;
    usesPromptFile?: boolean; // If true, write prompt to file and pass via -f
    buildArgs: (prompt: string, options: AgentOptions) => string[];
}

interface AgentOptions {
    model?: string;
    allowAll?: boolean;
}

const AGENTS: Record<string, AgentConfig> = {
    opencode: {
        name: 'OpenCode',
        command: 'opencode',
        usesPromptFile: true,
        buildArgs: (prompt, options) => {
            // prompt here is actually the path to the prompt file
            // OpenCode syntax: opencode run [message..] -f <file>
            const args = [
                'run',
                'Execute the task described in the attached prompt file',
                '-f',
                prompt
            ];
            if (options.model) args.push('-m', options.model);
            return args;
        }
    },
    'claude-code': {
        name: 'Claude Code',
        command: 'claude',
        buildArgs: (prompt, options) => {
            const args = ['-p', prompt];
            if (options.model) args.push('--model', options.model);
            if (options.allowAll) args.push('--dangerously-skip-permissions');
            return args;
        }
    },
    codex: {
        name: 'OpenAI Codex',
        command: 'codex',
        buildArgs: (prompt, options) => {
            const args = ['exec'];
            if (options.model) args.push('--model', options.model);
            if (options.allowAll) args.push('--full-auto');
            args.push(prompt);
            return args;
        }
    }
};

// ============================================================================
// State & History Types
// ============================================================================

interface RalphState {
    active: boolean;
    iteration: number;
    minIterations: number;
    maxIterations: number;
    completionPromise: string;
    tasksMode: boolean;
    taskPromise: string;
    task: string;
    startedAt: string;
    model: string;
    agent: string;
}

interface IterationHistory {
    iteration: number;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    exitCode: number;
    completionDetected: boolean;
    errors: string[];
}

interface RalphHistory {
    iterations: IterationHistory[];
    totalDurationMs: number;
    struggleIndicators: {
        repeatedErrors: Record<string, number>;
        noProgressIterations: number;
        shortIterations: number;
    };
}

interface Task {
    text: string;
    status: 'todo' | 'in-progress' | 'complete';
    subtasks: Task[];
}

// ============================================================================
// Paths
// ============================================================================

const ROOT_DIR = join(__dirname, '..', '..');
const STATE_DIR = join(ROOT_DIR, '.ralph');
const STATE_PATH = join(STATE_DIR, 'ralph-loop.state.json');
const CONTEXT_PATH = join(STATE_DIR, 'ralph-context.md');
const HISTORY_PATH = join(STATE_DIR, 'ralph-history.json');
const TASKS_PATH = join(STATE_DIR, 'ralph-tasks.md');
const PROMPTS_DIR = join(__dirname, 'prompts');

// ============================================================================
// Utility Functions
// ============================================================================

function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatDurationShort(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(input: string): string {
    return input.replace(/\x1B\[[0-9;]*m/g, '');
}

// ============================================================================
// User Prompt
// ============================================================================

async function promptUser(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

type ActiveLoopChoice = 'new' | 'continue' | 'cancel';

async function promptActiveLoopChoice(
    existingState: RalphState
): Promise<ActiveLoopChoice> {
    const elapsed = Date.now() - new Date(existingState.startedAt).getTime();
    const agentName = AGENTS[existingState.agent]?.name ?? existingState.agent;

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                 Active Ralph Loop Detected                       ║
╚══════════════════════════════════════════════════════════════════╝

🔄 An active loop already exists:
   Iteration:   ${existingState.iteration}
   Started:     ${existingState.startedAt}
   Elapsed:     ${formatDuration(elapsed)}
   Agent:       ${agentName}
   Task:        ${existingState.task.substring(0, 50)}${existingState.task.length > 50 ? '...' : ''}

What would you like to do?
  [n] Start a NEW loop (discards current loop state)
  [c] CONTINUE the current loop
  [q] Cancel and exit
`);

    const answer = await promptUser('Your choice (n/c/q): ');

    switch (answer) {
        case 'n':
        case 'new':
            return 'new';
        case 'c':
        case 'continue':
            return 'continue';
        case 'q':
        case 'quit':
        case 'cancel':
        case '':
            return 'cancel';
        default:
            console.log(`Invalid choice: "${answer}". Cancelling.`);
            return 'cancel';
    }
}

// ============================================================================
// State Management
// ============================================================================

function loadState(): RalphState | null {
    if (!existsSync(STATE_PATH)) return null;
    try {
        return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    } catch {
        return null;
    }
}

function saveState(state: RalphState): void {
    ensureDir(STATE_DIR);
    writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function clearState(): void {
    if (existsSync(STATE_PATH)) {
        try {
            unlinkSync(STATE_PATH);
        } catch {}
    }
}

// ============================================================================
// History Management
// ============================================================================

function loadHistory(): RalphHistory {
    if (!existsSync(HISTORY_PATH)) {
        return {
            iterations: [],
            totalDurationMs: 0,
            struggleIndicators: {
                repeatedErrors: {},
                noProgressIterations: 0,
                shortIterations: 0
            }
        };
    }
    try {
        return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
    } catch {
        return {
            iterations: [],
            totalDurationMs: 0,
            struggleIndicators: {
                repeatedErrors: {},
                noProgressIterations: 0,
                shortIterations: 0
            }
        };
    }
}

function saveHistory(history: RalphHistory): void {
    ensureDir(STATE_DIR);
    writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

function clearHistory(): void {
    if (existsSync(HISTORY_PATH)) {
        try {
            unlinkSync(HISTORY_PATH);
        } catch {}
    }
}

// ============================================================================
// Context Management
// ============================================================================

function loadContext(): string | null {
    if (!existsSync(CONTEXT_PATH)) return null;
    try {
        const content = readFileSync(CONTEXT_PATH, 'utf-8').trim();
        return content || null;
    } catch {
        return null;
    }
}

function saveContext(text: string): void {
    ensureDir(STATE_DIR);
    const timestamp = new Date().toISOString();
    const entry = `\n## Context added at ${timestamp}\n${text}\n`;
    if (existsSync(CONTEXT_PATH)) {
        const existing = readFileSync(CONTEXT_PATH, 'utf-8');
        writeFileSync(CONTEXT_PATH, existing + entry);
    } else {
        writeFileSync(CONTEXT_PATH, `# Ralph Loop Context\n${entry}`);
    }
}

function clearContext(): void {
    if (existsSync(CONTEXT_PATH)) {
        try {
            unlinkSync(CONTEXT_PATH);
        } catch {}
    }
}

// ============================================================================
// Task Management
// ============================================================================

function parseTasks(content: string): Task[] {
    const tasks: Task[] = [];
    const lines = content.split('\n');
    let currentTask: Task | null = null;

    for (const line of lines) {
        const topLevelMatch = line.match(/^- \[([ x\/])\]\s*(.+)/);
        if (topLevelMatch) {
            if (currentTask) tasks.push(currentTask);
            const [, statusChar, text] = topLevelMatch;
            let status: Task['status'] = 'todo';
            if (statusChar === 'x') status = 'complete';
            else if (statusChar === '/') status = 'in-progress';
            currentTask = { text, status, subtasks: [] };
            continue;
        }

        const subtaskMatch = line.match(/^\s+- \[([ x\/])\]\s*(.+)/);
        if (subtaskMatch && currentTask) {
            const [, statusChar, text] = subtaskMatch;
            let status: Task['status'] = 'todo';
            if (statusChar === 'x') status = 'complete';
            else if (statusChar === '/') status = 'in-progress';
            currentTask.subtasks.push({ text, status, subtasks: [] });
        }
    }

    if (currentTask) tasks.push(currentTask);
    return tasks;
}

function loadTasks(): Task[] {
    if (!existsSync(TASKS_PATH)) return [];
    try {
        return parseTasks(readFileSync(TASKS_PATH, 'utf-8'));
    } catch {
        return [];
    }
}

function getTasksContent(): string {
    if (!existsSync(TASKS_PATH)) return '';
    return readFileSync(TASKS_PATH, 'utf-8');
}

function findCurrentTask(tasks: Task[]): Task | null {
    return tasks.find(t => t.status === 'in-progress') || null;
}

function findNextTask(tasks: Task[]): Task | null {
    return tasks.find(t => t.status === 'todo') || null;
}

function allTasksComplete(tasks: Task[]): boolean {
    return tasks.length > 0 && tasks.every(t => t.status === 'complete');
}

function addTask(description: string): void {
    ensureDir(STATE_DIR);
    let content = '';
    if (existsSync(TASKS_PATH)) {
        content = readFileSync(TASKS_PATH, 'utf-8');
    } else {
        content = '# Ralph Tasks\n\n';
    }
    writeFileSync(TASKS_PATH, content.trimEnd() + `\n- [ ] ${description}\n`);
}

// ============================================================================
// Prompt Template System
// ============================================================================

interface PromptContext {
    iteration: number;
    minIterations: number;
    maxIterations: number;
    task: string;
    completionPromise: string;
    taskPromise: string;
    context: string | null;
    tasksMode: boolean;
    tasksFile: string;
    tasksContent: string;
    currentTask: string | null;
    nextTask: string | null;
    allComplete: boolean;
}

function loadPromptTemplate(name: string): string {
    const path = join(PROMPTS_DIR, `${name}.md`);
    if (!existsSync(path)) {
        throw new Error(`Prompt template not found: ${path}`);
    }
    return readFileSync(path, 'utf-8');
}

function renderTemplate(template: string, ctx: PromptContext): string {
    let result = template;

    // Handle {{#if condition}}...{{else}}...{{/if}} blocks
    result = result.replace(
        /\{\{#if (\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
        (_, key, ifContent, elseContent = '') => {
            const value = (ctx as any as Record<string, unknown>)[key];
            return value ? ifContent : elseContent;
        }
    );

    // Handle simple {{variable}} replacements
    result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const value = (ctx as any as Record<string, unknown>)[key];
        return value !== null && value !== undefined ? String(value) : '';
    });

    return result.trim();
}

function buildPrompt(state: RalphState): string {
    const tasks = loadTasks();
    const currentTask = findCurrentTask(tasks);
    const nextTask = findNextTask(tasks);

    const ctx: PromptContext = {
        iteration: state.iteration,
        minIterations: state.minIterations,
        maxIterations: state.maxIterations,
        task: state.task,
        completionPromise: state.completionPromise,
        taskPromise: state.taskPromise,
        context: loadContext(),
        tasksMode: state.tasksMode,
        tasksFile: '.ralph/ralph-tasks.md',
        tasksContent: getTasksContent(),
        currentTask: currentTask?.text || null,
        nextTask: nextTask?.text || null,
        allComplete: allTasksComplete(tasks)
    };

    const templateName = state.tasksMode ? 'tasks' : 'default';
    const template = loadPromptTemplate(templateName);
    return renderTemplate(template, ctx);
}

// ============================================================================
// Agent Execution
// ============================================================================

function checkCompletion(output: string, promise: string): boolean {
    const pattern = new RegExp(
        `<promise>\\s*${escapeRegex(promise)}\\s*</promise>`,
        'i'
    );
    return pattern.test(output);
}

function extractErrors(output: string): string[] {
    const errors: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const lower = line.toLowerCase();
        if (
            lower.includes('error:') ||
            lower.includes('failed:') ||
            lower.includes('exception:') ||
            lower.includes('typeerror') ||
            lower.includes('syntaxerror') ||
            lower.includes('referenceerror') ||
            (lower.includes('test') && lower.includes('fail'))
        ) {
            const cleaned = line.trim().substring(0, 200);
            if (cleaned && !errors.includes(cleaned)) {
                errors.push(cleaned);
            }
        }
    }
    return errors.slice(0, 10);
}

const PROMPT_FILE_PATH = join(STATE_DIR, 'current-prompt.md');

async function runAgent(
    agent: AgentConfig,
    prompt: string,
    options: AgentOptions
): Promise<{ output: string; exitCode: number }> {
    return new Promise(resolve => {
        let promptArg = prompt;

        // For agents that use prompt files, write the prompt to a file
        if (agent.usesPromptFile) {
            ensureDir(STATE_DIR);
            writeFileSync(PROMPT_FILE_PATH, prompt, 'utf-8');
            promptArg = PROMPT_FILE_PATH;
        }

        const args = agent.buildArgs(promptArg, options);
        const child = spawn(agent.command, args, {
            stdio: ['inherit', 'pipe', 'pipe'],
            cwd: ROOT_DIR,
            shell: process.platform === 'win32'
        });

        let output = '';

        child.stdout?.on('data', data => {
            const text = data.toString();
            output += text;
            process.stdout.write(text);
        });

        child.stderr?.on('data', data => {
            const text = data.toString();
            output += text;
            process.stderr.write(text);
        });

        const sigintHandler = (): void => {
            child.kill('SIGINT');
        };
        process.on('SIGINT', sigintHandler);

        child.on('close', code => {
            process.off('SIGINT', sigintHandler);
            resolve({ output, exitCode: code ?? 0 });
        });

        child.on('error', err => {
            process.off('SIGINT', sigintHandler);
            console.error(`Failed to spawn ${agent.command}:`, err.message);
            resolve({ output, exitCode: 1 });
        });
    });
}

// ============================================================================
// Git Operations
// ============================================================================

async function gitCommit(message: string): Promise<void> {
    return new Promise(resolve => {
        const child = spawn('git', ['add', '-A'], {
            cwd: ROOT_DIR,
            stdio: 'pipe'
        });
        child.on('close', () => {
            const commit = spawn('git', ['commit', '-m', message], {
                cwd: ROOT_DIR,
                stdio: 'pipe'
            });
            commit.on('close', () => resolve());
        });
    });
}

async function hasGitChanges(): Promise<boolean> {
    return new Promise(resolve => {
        const child = spawn('git', ['status', '--porcelain'], {
            cwd: ROOT_DIR,
            stdio: 'pipe'
        });
        let output = '';
        child.stdout?.on('data', data => {
            output += data.toString();
        });
        child.on('close', () => {
            resolve(output.trim().length > 0);
        });
    });
}

// ============================================================================
// CLI Commands
// ============================================================================

function printHelp(): void {
    console.log(`
Ralph Loop - Iterative AI Development for hello_miami

Usage:
  pnpm ralph "<task>" [options]
  npx tsx scripts/ralph/ralph.ts "<task>" [options]

Arguments:
  task                Task description for the AI to work on

Options:
  --agent AGENT       AI agent: opencode (default), claude-code, codex
  --min-iterations N  Minimum iterations before completion (default: 1)
  --max-iterations N  Maximum iterations before stopping (default: unlimited)
  --completion-promise TEXT  Phrase that signals completion (default: COMPLETE)
  --tasks, -t         Enable Tasks Mode for structured task tracking
  --task-promise TEXT Phrase for task completion (default: READY_FOR_NEXT_TASK)
  --model MODEL       Model to use (agent-specific)
  --no-commit         Don't auto-commit after each iteration
  --allow-all         Auto-approve all tool permissions (default: on)
  --no-allow-all      Require interactive permission prompts
  --version, -v       Show version
  --help, -h          Show this help

Commands:
  --status            Show current Ralph loop status and history
  --add-context TEXT  Add context for the next iteration
  --clear-context     Clear any pending context
  --list-tasks        Display the current task list
  --add-task "desc"   Add a new task to the list

Active Loop Behavior:
  If a loop is already active, you will be prompted to:
  - Start a NEW loop (discards current state)
  - CONTINUE the current loop
  - Cancel and exit

Examples:
  pnpm ralph "Add dark mode support to the dashboard"
  pnpm ralph "Fix the auth bug" --max-iterations 10
  pnpm ralph --tasks "Implement new features from PRD"
  pnpm ralph --status
  pnpm ralph --add-context "Focus on the map component first"
`);
}

function printStatus(): void {
    const state = loadState();
    const history = loadHistory();
    const context = loadContext();

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Ralph Loop Status                             ║
╚══════════════════════════════════════════════════════════════════╝
`);

    if (state?.active) {
        const elapsed = Date.now() - new Date(state.startedAt).getTime();
        const agentName = AGENTS[state.agent]?.name ?? state.agent;
        const iterInfo =
            state.maxIterations > 0
                ? ` / ${state.maxIterations}`
                : ' (unlimited)';
        console.log(`🔄 ACTIVE LOOP`);
        console.log(`   Iteration:    ${state.iteration}${iterInfo}`);
        console.log(`   Started:      ${state.startedAt}`);
        console.log(`   Elapsed:      ${formatDuration(elapsed)}`);
        console.log(`   Promise:      ${state.completionPromise}`);
        console.log(`   Agent:        ${agentName}`);
        if (state.model) console.log(`   Model:        ${state.model}`);
        if (state.tasksMode) {
            console.log(`   Tasks Mode:   ENABLED`);
            console.log(`   Task Promise: ${state.taskPromise}`);
        }
        console.log(
            `   Task:         ${state.task.substring(0, 60)}${state.task.length > 60 ? '...' : ''}`
        );
    } else {
        console.log(`⏹️  No active loop`);
    }

    if (context) {
        console.log(`\n📝 PENDING CONTEXT:`);
        console.log(`   ${context.split('\n').slice(0, 5).join('\n   ')}`);
    }

    // Show tasks
    const tasks = loadTasks();
    if (tasks.length > 0) {
        console.log(`\n📋 TASKS:`);
        tasks.forEach((task, i) => {
            const icon =
                task.status === 'complete'
                    ? '✅'
                    : task.status === 'in-progress'
                      ? '🔄'
                      : '⏸️';
            console.log(`   ${i + 1}. ${icon} ${task.text}`);
            task.subtasks.forEach(sub => {
                const subIcon =
                    sub.status === 'complete'
                        ? '✅'
                        : sub.status === 'in-progress'
                          ? '🔄'
                          : '⏸️';
                console.log(`      ${subIcon} ${sub.text}`);
            });
        });
        const complete = tasks.filter(t => t.status === 'complete').length;
        const inProgress = tasks.filter(t => t.status === 'in-progress').length;
        console.log(
            `\n   Progress: ${complete}/${tasks.length} complete, ${inProgress} in progress`
        );
    }

    if (history.iterations.length > 0) {
        console.log(`\n📊 HISTORY (${history.iterations.length} iterations)`);
        console.log(
            `   Total time: ${formatDuration(history.totalDurationMs)}`
        );

        const recent = history.iterations.slice(-5);
        console.log(`\n   Recent iterations:`);
        for (const iter of recent) {
            const status = iter.completionDetected
                ? '✅'
                : iter.exitCode !== 0
                  ? '❌'
                  : '🔄';
            console.log(
                `   ${status} #${iter.iteration}: ${formatDuration(iter.durationMs)}`
            );
        }

        const struggle = history.struggleIndicators;
        if (
            struggle.noProgressIterations >= 3 ||
            struggle.shortIterations >= 3
        ) {
            console.log(`\n⚠️  STRUGGLE INDICATORS:`);
            if (struggle.noProgressIterations >= 3) {
                console.log(
                    `   - No progress in ${struggle.noProgressIterations} iterations`
                );
            }
            if (struggle.shortIterations >= 3) {
                console.log(
                    `   - ${struggle.shortIterations} very short iterations (< 30s)`
                );
            }
            console.log(
                `\n   💡 Try: pnpm ralph --add-context "your hint here"`
            );
        }
    }

    console.log('');
}

function printTasks(): void {
    const tasks = loadTasks();
    if (tasks.length === 0) {
        console.log(
            'No tasks found. Use --add-task to create your first task.'
        );
        return;
    }

    console.log('Current tasks:');
    tasks.forEach((task, i) => {
        const icon =
            task.status === 'complete'
                ? '✅'
                : task.status === 'in-progress'
                  ? '🔄'
                  : '⏸️';
        console.log(`${i + 1}. ${icon} ${task.text}`);
        task.subtasks.forEach(sub => {
            const subIcon =
                sub.status === 'complete'
                    ? '✅'
                    : sub.status === 'in-progress'
                      ? '🔄'
                      : '⏸️';
            console.log(`   ${subIcon} ${sub.text}`);
        });
    });
}

// ============================================================================
// Main Loop
// ============================================================================

interface CliOptions {
    task: string;
    agent: string;
    model: string;
    minIterations: number;
    maxIterations: number;
    completionPromise: string;
    tasksMode: boolean;
    taskPromise: string;
    autoCommit: boolean;
    allowAll: boolean;
}

async function handleAutoCommit(
    state: RalphState,
    options: CliOptions
): Promise<void> {
    const commitPromptPath = join(
        ROOT_DIR,
        '.github',
        'prompts',
        'do-commits.prompt.md'
    );

    if (existsSync(commitPromptPath)) {
        console.log('🤖 Generating semantic commits...');
        const instructions = readFileSync(commitPromptPath, 'utf-8');
        const task = `${instructions}\n\nReview the current 'git status' and 'git diff'. Commit the changes based on the convention above. If there are multiple logical changes, make multiple commits.`;

        const agentConfig = AGENTS[state.agent];

        try {
            const { exitCode } = await runAgent(agentConfig, task, {
                model: state.model,
                allowAll: options.allowAll
            });
            if (exitCode !== 0) {
                console.warn(
                    `⚠️ Semantic commit agent exited with code ${exitCode}`
                );
            }
        } catch (err) {
            console.error('Failed to run semantic commit agent:', err);
        }
    } else {
        console.log('ℹ️ No semantic commit prompt found, using fallback.');
    }

    // Safety check: if changes remain (agent failed or didn't commit everything), force commit
    if (await hasGitChanges()) {
        const remaining = existsSync(commitPromptPath) ? 'remaining ' : '';
        console.log(`⚠️ Changes ${remaining}detected. Forcing cleanup commit.`);
        await gitCommit(`Ralph iteration ${state.iteration}: work in progress`);
        console.log(`📝 Auto-committed ${remaining}changes`);
    } else {
        console.log(`✅ Changes committed successfully.`);
    }
}

async function runLoop(options: CliOptions): Promise<void> {
    const existingState = loadState();
    let state: RalphState;

    if (existingState?.active) {
        const choice = await promptActiveLoopChoice(existingState);

        switch (choice) {
            case 'cancel':
                console.log('Cancelled.');
                process.exit(0);
                break;
            case 'continue':
                console.log('\n▶️  Continuing existing loop...\n');
                state = existingState;
                break;
            case 'new':
                console.log(
                    '\n🔄 Starting new loop (discarding previous state)...\n'
                );
                clearState();
                clearHistory();
                clearContext();
                state = {
                    active: true,
                    iteration: 1,
                    minIterations: options.minIterations,
                    maxIterations: options.maxIterations,
                    completionPromise: options.completionPromise,
                    tasksMode: options.tasksMode,
                    taskPromise: options.taskPromise,
                    task: options.task,
                    startedAt: new Date().toISOString(),
                    model: options.model,
                    agent: options.agent
                };
                break;
        }
    } else {
        state = {
            active: true,
            iteration: 1,
            minIterations: options.minIterations,
            maxIterations: options.maxIterations,
            completionPromise: options.completionPromise,
            tasksMode: options.tasksMode,
            taskPromise: options.taskPromise,
            task: options.task,
            startedAt: new Date().toISOString(),
            model: options.model,
            agent: options.agent
        };
    }

    const agentConfig = AGENTS[state.agent];
    if (!agentConfig) {
        console.error(`Unknown agent: ${state.agent}`);
        console.error(`Available agents: ${Object.keys(AGENTS).join(', ')}`);
        process.exit(1);
    }

    saveState(state);

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Ralph Loop                                    ║
║         Iterative AI Development with ${agentConfig.name.padEnd(20, ' ')}       ║
╚══════════════════════════════════════════════════════════════════╝
`);

    // Initialize tasks file if needed
    if (state.tasksMode && !existsSync(TASKS_PATH)) {
        ensureDir(STATE_DIR);
        writeFileSync(
            TASKS_PATH,
            '# Ralph Tasks\n\nAdd tasks below:\n- [ ] First task\n'
        );
        console.log(`📋 Created tasks file: ${TASKS_PATH}`);
    }

    // Initialize history
    const history = loadHistory();

    const taskPreview =
        state.task.substring(0, 80) + (state.task.length > 80 ? '...' : '');
    console.log(`Task: ${taskPreview}`);
    console.log(`Completion promise: ${state.completionPromise}`);
    if (state.tasksMode) {
        console.log(`Tasks mode: ENABLED`);
        console.log(`Task promise: ${state.taskPromise}`);
    }
    console.log(`Min iterations: ${state.minIterations}`);
    console.log(
        `Max iterations: ${state.maxIterations > 0 ? state.maxIterations : 'unlimited'}`
    );
    console.log(`Agent: ${agentConfig.name}`);
    if (state.model) console.log(`Model: ${state.model}`);
    if (options.allowAll) console.log('Permissions: auto-approve all tools');
    if (state.iteration > 1) {
        console.log(`Resuming at iteration: ${state.iteration}`);
    }
    console.log('');
    console.log('Starting loop... (Ctrl+C to stop)');
    console.log('═'.repeat(68));

    // Graceful shutdown
    let stopping = false;
    process.on('SIGINT', () => {
        if (stopping) {
            console.log('\nForce stopping...');
            process.exit(1);
        }
        stopping = true;
        console.log('\n⏸️  Pausing Ralph loop...');
        console.log('   State preserved. Run again to resume.');
        // clearState(); // Don't clear state on SIGINT to allow resuming
        process.exit(0);
    });

    // Main loop
    while (true) {
        if (stopping) break;

        if (state.maxIterations > 0 && state.iteration > state.maxIterations) {
            console.log(
                `\n╔══════════════════════════════════════════════════════════════════╗`
            );
            console.log(
                `║  Max iterations (${state.maxIterations}) reached. Loop stopped.`
            );
            console.log(
                `║  Total time: ${formatDuration(history.totalDurationMs)}`
            );
            console.log(
                `╚══════════════════════════════════════════════════════════════════╝`
            );
            clearState();
            break;
        }

        const iterInfo =
            state.maxIterations > 0 ? ` / ${state.maxIterations}` : '';
        const minInfo =
            state.iteration < state.minIterations
                ? ` (min: ${state.minIterations})`
                : '';
        console.log(`\n🔄 Iteration ${state.iteration}${iterInfo}${minInfo}`);
        console.log('─'.repeat(68));

        const contextAtStart = loadContext();
        const iterationStart = Date.now();

        try {
            const fullPrompt = buildPrompt(state);

            const { output, exitCode } = await runAgent(
                agentConfig,
                fullPrompt,
                {
                    model: state.model,
                    allowAll: options.allowAll
                }
            );

            const completionDetected = checkCompletion(
                output,
                state.completionPromise
            );
            const taskCompletionDetected = state.tasksMode
                ? checkCompletion(output, state.taskPromise)
                : false;

            const iterationDuration = Date.now() - iterationStart;

            console.log('\nIteration Summary');
            console.log(
                '────────────────────────────────────────────────────────────────────'
            );
            console.log(`Iteration: ${state.iteration}`);
            console.log(`Elapsed:   ${formatDurationShort(iterationDuration)}`);
            console.log(`Exit code: ${exitCode}`);
            console.log(
                `Completion promise: ${completionDetected ? 'detected' : 'not detected'}`
            );

            // Track history
            const errors = extractErrors(output);
            const iterationRecord: IterationHistory = {
                iteration: state.iteration,
                startedAt: new Date(iterationStart).toISOString(),
                endedAt: new Date().toISOString(),
                durationMs: iterationDuration,
                exitCode,
                completionDetected,
                errors
            };

            history.iterations.push(iterationRecord);
            history.totalDurationMs += iterationDuration;

            // Update struggle indicators
            if (iterationDuration < 30000) {
                history.struggleIndicators.shortIterations++;
            } else {
                history.struggleIndicators.shortIterations = 0;
            }

            if (errors.length === 0) {
                history.struggleIndicators.repeatedErrors = {};
            } else {
                for (const error of errors) {
                    const key = error.substring(0, 100);
                    history.struggleIndicators.repeatedErrors[key] =
                        (history.struggleIndicators.repeatedErrors[key] || 0) +
                        1;
                }
            }

            saveHistory(history);

            // Struggle warning
            const struggle = history.struggleIndicators;
            if (
                state.iteration > 2 &&
                (struggle.noProgressIterations >= 3 ||
                    struggle.shortIterations >= 3)
            ) {
                console.log(`\n⚠️  Potential struggle detected:`);
                if (struggle.shortIterations >= 3) {
                    console.log(
                        `   - ${struggle.shortIterations} very short iterations`
                    );
                }
                console.log(
                    `   💡 Tip: Use 'pnpm ralph --add-context "hint"' in another terminal`
                );
            }

            if (exitCode !== 0) {
                console.warn(
                    `\n⚠️  ${agentConfig.name} exited with code ${exitCode}. Continuing...`
                );
            }

            // Task completion
            if (taskCompletionDetected && !completionDetected) {
                console.log(
                    `\n🔄 Task completion detected. Moving to next task...`
                );
            }

            // Full completion
            if (completionDetected) {
                if (state.iteration < state.minIterations) {
                    console.log(
                        `\n⏳ Completion detected, but minimum iterations (${state.minIterations}) not reached.`
                    );
                    console.log(
                        `   Continuing to iteration ${state.iteration + 1}...`
                    );
                } else {
                    console.log(
                        `\n╔══════════════════════════════════════════════════════════════════╗`
                    );
                    console.log(`║  ✅ Completion promise detected!`);
                    console.log(
                        `║  Task completed in ${state.iteration} iteration(s)`
                    );
                    console.log(
                        `║  Total time: ${formatDuration(history.totalDurationMs)}`
                    );
                    console.log(
                        `╚══════════════════════════════════════════════════════════════════╝`
                    );
                    clearState();
                    clearHistory();
                    clearContext();
                    break;
                }
            }

            // Clear consumed context
            if (contextAtStart) {
                console.log(`📝 Context was consumed this iteration`);
                clearContext();
            }

            // Auto-commit
            if (options.autoCommit && (await hasGitChanges())) {
                await handleAutoCommit(state, options);
            }

            // Next iteration
            state.iteration++;
            saveState(state);

            // Small delay
            await new Promise(r => setTimeout(r, 1000));
        } catch (error) {
            console.error(`\n❌ Error in iteration ${state.iteration}:`, error);
            console.log('Continuing to next iteration...');

            const iterationDuration = Date.now() - iterationStart;
            history.iterations.push({
                iteration: state.iteration,
                startedAt: new Date(iterationStart).toISOString(),
                endedAt: new Date().toISOString(),
                durationMs: iterationDuration,
                exitCode: -1,
                completionDetected: false,
                errors: [String(error).substring(0, 200)]
            });
            history.totalDurationMs += iterationDuration;
            saveHistory(history);

            state.iteration++;
            saveState(state);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
    const args = process.argv.slice(2);

    // Handle --help
    if (args.includes('--help') || args.includes('-h')) {
        printHelp();
        process.exit(0);
    }

    // Handle --version
    if (args.includes('--version') || args.includes('-v')) {
        console.log(`ralph ${VERSION}`);
        process.exit(0);
    }

    // Handle --status
    if (args.includes('--status')) {
        printStatus();
        process.exit(0);
    }

    // Handle --list-tasks
    if (args.includes('--list-tasks')) {
        printTasks();
        process.exit(0);
    }

    // Handle --add-context
    const addContextIdx = args.indexOf('--add-context');
    if (addContextIdx !== -1) {
        const text = args[addContextIdx + 1];
        if (!text) {
            console.error('Error: --add-context requires a text argument');
            process.exit(1);
        }
        saveContext(text);
        console.log(`✅ Context added for next iteration`);
        const state = loadState();
        if (state?.active) {
            console.log(
                `   Will be picked up in iteration ${state.iteration + 1}`
            );
        }
        process.exit(0);
    }

    // Handle --clear-context
    if (args.includes('--clear-context')) {
        clearContext();
        console.log(`✅ Context cleared`);
        process.exit(0);
    }

    // Handle --add-task
    const addTaskIdx = args.indexOf('--add-task');
    if (addTaskIdx !== -1) {
        const description = args[addTaskIdx + 1];
        if (!description) {
            console.error('Error: --add-task requires a description');
            process.exit(1);
        }
        addTask(description);
        console.log(`✅ Task added: "${description}"`);
        process.exit(0);
    }

    // Parse main options
    const options: CliOptions = {
        task: '',
        agent: 'opencode',
        model: '',
        minIterations: 1,
        maxIterations: 0,
        completionPromise: 'COMPLETE',
        tasksMode: false,
        taskPromise: 'READY_FOR_NEXT_TASK',
        autoCommit: true,
        allowAll: true
    };

    const taskParts: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--agent') {
            options.agent = args[++i] || '';
        } else if (arg === '--model') {
            options.model = args[++i] || '';
        } else if (arg === '--min-iterations') {
            options.minIterations = parseInt(args[++i], 10) || 1;
        } else if (arg === '--max-iterations') {
            options.maxIterations = parseInt(args[++i], 10) || 0;
        } else if (arg === '--completion-promise') {
            options.completionPromise = args[++i] || 'COMPLETE';
        } else if (arg === '--tasks' || arg === '-t') {
            options.tasksMode = true;
        } else if (arg === '--task-promise') {
            options.taskPromise = args[++i] || 'READY_FOR_NEXT_TASK';
        } else if (arg === '--no-commit') {
            options.autoCommit = false;
        } else if (arg === '--allow-all') {
            options.allowAll = true;
        } else if (arg === '--no-allow-all') {
            options.allowAll = false;
        } else if (!arg.startsWith('-')) {
            taskParts.push(arg);
        }
    }

    options.task = taskParts.join(' ');

    if (!options.task) {
        console.error('Error: No task provided');
        console.error('Usage: pnpm ralph "Your task description" [options]');
        console.error("Run 'pnpm ralph --help' for more information");
        process.exit(1);
    }

    if (
        options.maxIterations > 0 &&
        options.minIterations > options.maxIterations
    ) {
        console.error(
            `Error: --min-iterations (${options.minIterations}) cannot exceed --max-iterations (${options.maxIterations})`
        );
        process.exit(1);
    }

    await runLoop(options);
}

main().catch(error => {
    console.error('Fatal error:', error);
    clearState();
    process.exit(1);
});
