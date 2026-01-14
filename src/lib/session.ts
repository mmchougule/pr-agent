/**
 * Session Manager for PR-Agent CLI
 * Manages session state, persistence, and background job tracking
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = 'idle' | 'planning' | 'plan_ready' | 'shipping' | 'paused' | 'completed' | 'error';

export interface SessionTask {
  id: string;
  title: string;
  description: string;
  priority: number;
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  acceptanceCriteria?: string[];
  completedAt?: string;
  error?: string;
}

export interface SessionState {
  version: number;
  sessionId: string;
  status: SessionStatus;
  repo?: string;
  branch?: string;
  planName?: string;
  planPath?: string;
  currentTaskId?: string;
  tasks: SessionTask[];
  conversation: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  execution: {
    startedAt?: string;
    completedAt?: string;
    commits: string[];
    prUrl?: string;
    jobId?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundJob {
  jobId: string;
  sessionId: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// Paths
// ============================================================================

const PR_AGENT_DIR = '.pr-agent';
const SESSION_FILE = 'state.json';
const PLAN_FILE = 'plan.md';
const LOGS_DIR = 'logs';
const GLOBAL_STATE_FILE = join(homedir(), '.pr-agent', 'global-state.json');

/**
 * Get the .pr-agent directory path for a given working directory
 */
export function getPrAgentDir(cwd: string = process.cwd()): string {
  return join(cwd, PR_AGENT_DIR);
}

/**
 * Get the session state file path
 */
export function getSessionPath(cwd: string = process.cwd()): string {
  return join(getPrAgentDir(cwd), SESSION_FILE);
}

/**
 * Get the plan.md file path
 */
export function getPlanPath(cwd: string = process.cwd()): string {
  return join(getPrAgentDir(cwd), PLAN_FILE);
}

/**
 * Get the logs directory path
 */
export function getLogsDir(cwd: string = process.cwd()): string {
  return join(getPrAgentDir(cwd), LOGS_DIR);
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Create a new session state
 */
export function createSession(repo?: string, branch?: string): SessionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: generateSessionId(),
    status: 'idle',
    repo,
    branch,
    tasks: [],
    conversation: [],
    execution: {
      commits: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load session state from disk
 */
export function loadSession(cwd: string = process.cwd()): SessionState | null {
  const path = getSessionPath(cwd);

  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as SessionState;
  } catch (err) {
    console.error('Failed to load session:', err);
    return null;
  }
}

/**
 * Save session state to disk
 */
export function saveSession(session: SessionState, cwd: string = process.cwd()): void {
  const dir = getPrAgentDir(cwd);
  const path = getSessionPath(cwd);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Update timestamp
  session.updatedAt = new Date().toISOString();

  writeFileSync(path, JSON.stringify(session, null, 2));
}

/**
 * Delete session state
 */
export function deleteSession(cwd: string = process.cwd()): void {
  const path = getSessionPath(cwd);

  if (existsSync(path)) {
    rmSync(path);
  }
}

/**
 * Check if a session exists
 */
export function hasSession(cwd: string = process.cwd()): boolean {
  return existsSync(getSessionPath(cwd));
}

/**
 * Check if a plan exists
 */
export function hasPlan(cwd: string = process.cwd()): boolean {
  return existsSync(getPlanPath(cwd));
}

// ============================================================================
// Session Operations
// ============================================================================

/**
 * Add a message to the conversation
 */
export function addConversationMessage(
  session: SessionState,
  role: 'user' | 'assistant',
  content: string
): void {
  session.conversation.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Update session status
 */
export function updateSessionStatus(
  session: SessionState,
  status: SessionStatus
): void {
  session.status = status;
  session.updatedAt = new Date().toISOString();
}

/**
 * Update a task's status
 */
export function updateTaskStatus(
  session: SessionState,
  taskId: string,
  status: SessionTask['status'],
  error?: string
): void {
  const task = session.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
    if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date().toISOString();
    }
    if (error) {
      task.error = error;
    }
    session.updatedAt = new Date().toISOString();
  }
}

/**
 * Get the next task to execute (respects dependencies)
 */
export function getNextTask(session: SessionState): SessionTask | null {
  const pendingTasks = session.tasks.filter(t => t.status === 'pending');

  for (const task of pendingTasks) {
    // Check if all dependencies are completed
    const depsCompleted = task.dependencies.every(depId => {
      const dep = session.tasks.find(t => t.id === depId);
      return dep?.status === 'completed';
    });

    if (depsCompleted) {
      return task;
    }
  }

  return null;
}

/**
 * Get session progress stats
 */
export function getProgress(session: SessionState): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  running: number;
  percent: number;
} {
  const total = session.tasks.length;
  const completed = session.tasks.filter(t => t.status === 'completed').length;
  const failed = session.tasks.filter(t => t.status === 'failed').length;
  const running = session.tasks.filter(t => t.status === 'running').length;
  const pending = session.tasks.filter(t => t.status === 'pending').length;

  return {
    total,
    completed,
    failed,
    pending,
    running,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// ============================================================================
// Background Job Tracking
// ============================================================================

interface GlobalState {
  backgroundJobs: BackgroundJob[];
}

/**
 * Load global state (for background jobs across directories)
 */
function loadGlobalState(): GlobalState {
  const dir = dirname(GLOBAL_STATE_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (!existsSync(GLOBAL_STATE_FILE)) {
    return { backgroundJobs: [] };
  }

  try {
    const content = readFileSync(GLOBAL_STATE_FILE, 'utf-8');
    return JSON.parse(content) as GlobalState;
  } catch {
    return { backgroundJobs: [] };
  }
}

/**
 * Save global state
 */
function saveGlobalState(state: GlobalState): void {
  const dir = dirname(GLOBAL_STATE_FILE);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(GLOBAL_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Register a background job
 */
export function registerBackgroundJob(jobId: string, sessionId: string): void {
  const state = loadGlobalState();

  state.backgroundJobs.push({
    jobId,
    sessionId,
    status: 'running',
    startedAt: new Date().toISOString(),
  });

  saveGlobalState(state);
}

/**
 * Update a background job's status
 */
export function updateBackgroundJob(jobId: string, status: BackgroundJob['status']): void {
  const state = loadGlobalState();

  const job = state.backgroundJobs.find(j => j.jobId === jobId);
  if (job) {
    job.status = status;
    if (status === 'completed' || status === 'failed') {
      job.completedAt = new Date().toISOString();
    }
  }

  saveGlobalState(state);
}

/**
 * Get all background jobs
 */
export function getBackgroundJobs(): BackgroundJob[] {
  return loadGlobalState().backgroundJobs;
}

/**
 * Get running background jobs
 */
export function getRunningJobs(): BackgroundJob[] {
  return loadGlobalState().backgroundJobs.filter(j => j.status === 'running');
}

/**
 * Clean up old background jobs (older than 7 days)
 */
export function cleanupBackgroundJobs(): void {
  const state = loadGlobalState();
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days

  state.backgroundJobs = state.backgroundJobs.filter(job => {
    const jobTime = new Date(job.startedAt).getTime();
    return jobTime > cutoff;
  });

  saveGlobalState(state);
}
