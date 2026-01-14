/**
 * Ship Engine for PR-Agent CLI
 * Handles autonomous task execution loop
 */

import { existsSync, mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import EventSource from 'eventsource';
import { getApiBaseUrl, getConfigValue } from './config.js';
import { getClientFingerprint } from './api-client.js';
import type { SessionState, SessionTask } from './session.js';
import {
  loadSession,
  saveSession,
  updateSessionStatus,
  updateTaskStatus,
  getNextTask,
  getProgress,
  getLogsDir,
  getPlanPath,
  registerBackgroundJob,
  updateBackgroundJob,
} from './session.js';
import { updateTaskInPlan, loadPlan, generatePlanMd } from './plan-parser.js';

// ============================================================================
// Types
// ============================================================================

export interface ShipOptions {
  /** Working directory */
  cwd: string;
  /** Repository (owner/repo) */
  repo: string;
  /** Step mode - pause after each task */
  stepMode?: boolean;
  /** Auto mode - run all tasks without pausing */
  autoMode?: boolean;
  /** Background mode - run in background */
  backgroundMode?: boolean;
}

export interface ShipCallbacks {
  onTaskStart?: (task: SessionTask) => void;
  onTaskComplete?: (task: SessionTask) => void;
  onTaskFailed?: (task: SessionTask, error: string) => void;
  onProgress?: (completed: number, total: number) => void;
  onStatus?: (message: string, phase?: string) => void;
  onAgent?: (event: AgentEvent) => void;
  onComplete?: (prUrl?: string) => void;
  onError?: (error: string) => void;
  /** Called when step mode wants user confirmation */
  onStepPause?: (nextTask: SessionTask | null) => Promise<boolean>;
}

export interface AgentEvent {
  eventType: 'tool_call' | 'thinking' | 'message' | 'tool_result';
  tool?: string;
  display?: string;
  content?: string;
}

export interface ShipResult {
  success: boolean;
  prUrl?: string;
  completedTasks: number;
  totalTasks: number;
  error?: string;
}

// ============================================================================
// Task Execution
// ============================================================================

/**
 * Execute a single task via the backend
 */
export async function executeTask(
  task: SessionTask,
  options: ShipOptions,
  callbacks: ShipCallbacks
): Promise<{ success: boolean; error?: string; jobId?: string }> {
  const { cwd, repo } = options;

  callbacks.onTaskStart?.(task);

  const baseUrl = getApiBaseUrl();
  const githubToken = getConfigValue('githubToken');

  // Build task prompt with context
  const taskPrompt = buildTaskPrompt(task);

  // Call execute endpoint
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/pr-agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        task: taskPrompt,
        githubToken,
        clientFingerprint: getClientFingerprint(),
        // Include task metadata
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
        },
      }),
    });
  } catch (err: any) {
    return { success: false, error: `Cannot connect to API: ${err.message}` };
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string };
    return { success: false, error: error.error || `HTTP ${response.status}` };
  }

  const { jobId, streamUrl } = await response.json() as { jobId: string; streamUrl: string };

  // Register background job
  const session = loadSession(cwd);
  if (session) {
    registerBackgroundJob(jobId, session.sessionId);
    session.execution.jobId = jobId;
    saveSession(session, cwd);
  }

  // Stream task execution
  return new Promise((resolve) => {
    const fullUrl = `${baseUrl}${streamUrl}`;
    const es = new EventSource(fullUrl);

    // Setup logging
    const logPath = join(getLogsDir(cwd), `${task.id}.md`);
    ensureLogFile(logPath, task);

    es.onmessage = (event) => {
      try {
        if (event.data === ':heartbeat') return;
        const data = JSON.parse(event.data);

        // Log event
        appendToLog(logPath, data);

        if (data.type === 'status') {
          callbacks.onStatus?.(data.message || '', data.phase);
        }

        if (data.type === 'agent') {
          callbacks.onAgent?.({
            eventType: data.eventType,
            tool: data.tool,
            display: data.display,
            content: data.output || data.content,
          });
        }

        if (data.type === 'result') {
          es.close();
          updateBackgroundJob(jobId, data.result?.success ? 'completed' : 'failed');

          if (data.result?.success) {
            // Update session with PR info
            const session = loadSession(cwd);
            if (session && data.result.prUrl) {
              session.execution.prUrl = data.result.prUrl;
              session.execution.commits.push(data.result.commitSha || '');
              saveSession(session, cwd);
            }

            callbacks.onTaskComplete?.(task);
            resolve({ success: true, jobId });
          } else {
            callbacks.onTaskFailed?.(task, data.result?.error || 'Task failed');
            resolve({ success: false, error: data.result?.error, jobId });
          }
        }

        if (data.type === 'error') {
          es.close();
          updateBackgroundJob(jobId, 'failed');
          callbacks.onTaskFailed?.(task, data.error);
          resolve({ success: false, error: data.error, jobId });
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      updateBackgroundJob(jobId, 'failed');
      resolve({ success: false, error: 'Connection lost', jobId });
    };
  });
}

/**
 * Build a task prompt with context
 */
function buildTaskPrompt(task: SessionTask): string {
  const lines: string[] = [];

  lines.push(`## Task: ${task.id} - ${task.title}`);
  lines.push('');
  lines.push(task.description);
  lines.push('');

  if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
    lines.push('### Acceptance Criteria');
    for (const criterion of task.acceptanceCriteria) {
      lines.push(`- [ ] ${criterion}`);
    }
    lines.push('');
  }

  lines.push('### Instructions');
  lines.push('1. Complete the task described above');
  lines.push('2. Ensure all acceptance criteria are met');
  lines.push('3. Commit your changes with a clear message');
  lines.push(`4. When done, output: <task-complete>${task.id}</task-complete>`);

  return lines.join('\n');
}

// ============================================================================
// Ship Engine
// ============================================================================

/**
 * Run the ship engine - execute tasks from the plan
 */
export async function runShipEngine(
  options: ShipOptions,
  callbacks: ShipCallbacks
): Promise<ShipResult> {
  const { cwd, stepMode, autoMode } = options;

  let session = loadSession(cwd);
  if (!session) {
    return { success: false, completedTasks: 0, totalTasks: 0, error: 'No session found' };
  }

  const totalTasks = session.tasks.length;
  let completedTasks = session.tasks.filter(t => t.status === 'completed').length;

  // Main execution loop
  while (true) {
    // Check if session is paused
    session = loadSession(cwd);
    if (!session) break;

    if (session.status === 'paused') {
      callbacks.onStatus?.('Paused. Use /resume to continue.');
      break;
    }

    // Get next task
    const nextTask = getNextTask(session);

    if (!nextTask) {
      // All tasks done or blocked
      const progress = getProgress(session);
      if (progress.completed === progress.total) {
        updateSessionStatus(session, 'completed');
        saveSession(session, cwd);
        callbacks.onComplete?.(session.execution.prUrl);
        return {
          success: true,
          prUrl: session.execution.prUrl,
          completedTasks: progress.completed,
          totalTasks: progress.total,
        };
      } else {
        // Some tasks failed or blocked
        callbacks.onStatus?.('Some tasks are blocked or failed.');
        return {
          success: false,
          completedTasks: progress.completed,
          totalTasks: progress.total,
          error: 'Some tasks could not be completed',
        };
      }
    }

    // Update progress
    callbacks.onProgress?.(completedTasks, totalTasks);

    // Mark task as running
    updateTaskStatus(session, nextTask.id, 'running');
    updateTaskInPlan(getPlanPath(cwd), nextTask.id, 'running');
    session.currentTaskId = nextTask.id;
    saveSession(session, cwd);

    // Execute task
    const result = await executeTask(nextTask, options, callbacks);

    // Update task status
    session = loadSession(cwd);
    if (!session) break;

    if (result.success) {
      updateTaskStatus(session, nextTask.id, 'completed');
      updateTaskInPlan(getPlanPath(cwd), nextTask.id, 'completed');
      completedTasks++;
    } else {
      updateTaskStatus(session, nextTask.id, 'failed', result.error);
      updateTaskInPlan(getPlanPath(cwd), nextTask.id, 'failed');

      callbacks.onError?.(result.error || 'Task failed');

      // In non-auto mode, stop on failure
      if (!autoMode) {
        return {
          success: false,
          completedTasks,
          totalTasks,
          error: result.error,
        };
      }
    }

    saveSession(session, cwd);

    // Step mode - pause for confirmation
    if (stepMode && !autoMode && callbacks.onStepPause) {
      const continueExec = await callbacks.onStepPause(getNextTask(session));
      if (!continueExec) {
        updateSessionStatus(session, 'paused');
        saveSession(session, cwd);
        return {
          success: true,
          completedTasks,
          totalTasks,
        };
      }
    }
  }

  return {
    success: false,
    completedTasks,
    totalTasks,
    error: 'Execution interrupted',
  };
}

// ============================================================================
// Single Execution Mode (Full Plan)
// ============================================================================

/**
 * Build full plan prompt for Claude Code
 * Sends entire plan.md content so Claude Code executes all tasks in sequence
 */
function buildFullPlanPrompt(cwd: string): string {
  const planPath = getPlanPath(cwd);
  const plan = loadPlan(planPath);

  if (!plan) {
    throw new Error('No plan found');
  }

  const planContent = generatePlanMd(plan);

  return `# Execution Plan

You have been given a multi-task plan to execute. Complete ALL tasks in order, respecting dependencies.

${planContent}

## Instructions

1. **Execute tasks in order** - Start with tasks that have no dependencies, then proceed to dependent tasks
2. **Commit after each task** - Make a git commit with a clear message after completing each task
3. **Report progress** - After completing each task, output: \`<task-complete>TASK-ID</task-complete>\`
4. **Handle failures gracefully** - If a task fails, report it and continue to the next independent task if possible
5. **Create ONE PR at the end** - After all tasks are complete, create a single pull request with all changes

## Task Completion Format

After completing each task, output exactly:
\`\`\`
<task-complete>US-001</task-complete>
\`\`\`

This helps track progress. Replace US-001 with the actual task ID.

## Important

- DO NOT create multiple PRs - all changes go into ONE PR
- Commit frequently (after each task) with descriptive messages
- If you encounter issues, document them and continue where possible
- The plan.md file shows task dependencies - respect the order

Begin executing the plan now.`;
}

/**
 * Run ship engine with single execution (full plan sent to Claude Code)
 * This is the recommended approach - one sandbox, one PR for all tasks
 */
export async function runShipEngineSingleExecution(
  options: ShipOptions,
  callbacks: ShipCallbacks
): Promise<ShipResult> {
  const { cwd, repo } = options;

  const session = loadSession(cwd);
  if (!session) {
    return { success: false, completedTasks: 0, totalTasks: 0, error: 'No session found' };
  }

  const plan = loadPlan(getPlanPath(cwd));
  if (!plan) {
    return { success: false, completedTasks: 0, totalTasks: 0, error: 'No plan found' };
  }

  const totalTasks = plan.tasks.length;
  const pendingTasks = plan.tasks.filter(t => t.status === 'pending');

  if (pendingTasks.length === 0) {
    callbacks.onComplete?.(session.execution.prUrl);
    return { success: true, completedTasks: totalTasks, totalTasks, prUrl: session.execution.prUrl };
  }

  // Mark all pending tasks as running (they'll be executed together)
  callbacks.onStatus?.(`Executing ${pendingTasks.length} tasks in single session...`, 'agent');
  callbacks.onProgress?.(0, totalTasks);

  // Build full plan prompt
  let fullPrompt: string;
  try {
    fullPrompt = buildFullPlanPrompt(cwd);
  } catch (err: any) {
    return { success: false, completedTasks: 0, totalTasks, error: err.message };
  }

  // Update session status
  updateSessionStatus(session, 'shipping');
  session.execution.startedAt = new Date().toISOString();
  saveSession(session, cwd);

  const baseUrl = getApiBaseUrl();
  const githubToken = getConfigValue('githubToken');

  // Call execute endpoint with full plan
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/pr-agent/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo,
        task: fullPrompt,
        githubToken,
        clientFingerprint: getClientFingerprint(),
        metadata: {
          planName: plan.metadata.name,
          taskCount: pendingTasks.length,
          taskIds: pendingTasks.map(t => t.id),
        },
      }),
    });
  } catch (err: any) {
    return { success: false, completedTasks: 0, totalTasks, error: `Cannot connect to API: ${err.message}` };
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string };
    return { success: false, completedTasks: 0, totalTasks, error: error.error || `HTTP ${response.status}` };
  }

  const { jobId, streamUrl } = await response.json() as { jobId: string; streamUrl: string };

  // Register background job
  registerBackgroundJob(jobId, session.sessionId);
  session.execution.jobId = jobId;
  saveSession(session, cwd);

  // Setup logging
  const logPath = join(getLogsDir(cwd), `execution-${jobId}.md`);
  ensureExecutionLogFile(logPath, plan.metadata.name, pendingTasks.length);

  // Track completed tasks from stream
  let completedTasks = plan.tasks.filter(t => t.status === 'completed').length;
  const completedTaskIds = new Set<string>();

  // Stream execution
  return new Promise((resolve) => {
    const fullUrl = `${baseUrl}${streamUrl}`;
    const es = new EventSource(fullUrl);

    es.onmessage = (event) => {
      try {
        if (event.data === ':heartbeat') return;
        const data = JSON.parse(event.data);

        // Log event
        appendToLog(logPath, data);

        if (data.type === 'status') {
          callbacks.onStatus?.(data.message || '', data.phase);
        }

        if (data.type === 'agent') {
          const output = data.output || data.content || '';
          const display = data.display || '';

          // Check for task completion - multiple detection methods:
          // 1. Explicit marker: <task-complete>US-001</task-complete>
          // 2. Git commit with task ID: "git commit" + task ID in message
          // 3. TodoWrite marking task complete

          // Method 1: Explicit marker
          const taskCompleteMatch = output.match(/<task-complete>([A-Z]+-\d+)<\/task-complete>/);
          if (taskCompleteMatch) {
            markTaskComplete(taskCompleteMatch[1]);
          }

          // Method 2: Git commit with task ID in the commit message or display
          if (data.tool === 'Bash' && (display.includes('git commit') || output.includes('git commit'))) {
            // Look for task IDs in the commit message
            for (const task of pendingTasks) {
              if (!completedTaskIds.has(task.id)) {
                if (display.includes(task.id) || output.includes(task.id)) {
                  markTaskComplete(task.id);
                }
              }
            }
          }

          // Method 3: TodoWrite showing task completed
          if (data.tool === 'TodoWrite' && output.includes('completed')) {
            // Try to find task ID mentioned
            for (const task of pendingTasks) {
              if (!completedTaskIds.has(task.id) && output.includes(task.id)) {
                markTaskComplete(task.id);
              }
            }
          }

          // Helper to mark task complete
          function markTaskComplete(taskId: string) {
            if (completedTaskIds.has(taskId)) return;

            completedTaskIds.add(taskId);
            completedTasks++;

            // Update task status in plan.md
            updateTaskInPlan(getPlanPath(cwd), taskId, 'completed');

            // Find and notify about completed task
            const task = pendingTasks.find(t => t.id === taskId);
            if (task) {
              callbacks.onTaskComplete?.(task);
            }

            callbacks.onProgress?.(completedTasks, totalTasks);
          }

          callbacks.onAgent?.({
            eventType: data.eventType,
            tool: data.tool,
            display: data.display,
            content: output,
          });
        }

        if (data.type === 'result') {
          es.close();
          updateBackgroundJob(jobId, data.result?.success ? 'completed' : 'failed');

          // Update session with PR info
          const finalSession = loadSession(cwd);
          if (finalSession) {
            if (data.result?.prUrl) {
              finalSession.execution.prUrl = data.result.prUrl;
            }
            if (data.result?.commitSha) {
              finalSession.execution.commits.push(data.result.commitSha);
            }
            finalSession.execution.completedAt = new Date().toISOString();
            updateSessionStatus(finalSession, data.result?.success ? 'completed' : 'error');
            saveSession(finalSession, cwd);
          }

          // Mark any remaining pending tasks as completed if PR was successful
          if (data.result?.success) {
            for (const task of pendingTasks) {
              if (!completedTaskIds.has(task.id)) {
                updateTaskInPlan(getPlanPath(cwd), task.id, 'completed');
                completedTasks++;
              }
            }
          }

          callbacks.onComplete?.(data.result?.prUrl);
          resolve({
            success: data.result?.success || false,
            prUrl: data.result?.prUrl,
            completedTasks,
            totalTasks,
            error: data.result?.error,
          });
        }

        if (data.type === 'error') {
          es.close();
          updateBackgroundJob(jobId, 'failed');
          callbacks.onError?.(data.error);
          resolve({
            success: false,
            completedTasks,
            totalTasks,
            error: data.error,
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      updateBackgroundJob(jobId, 'failed');
      resolve({
        success: false,
        completedTasks,
        totalTasks,
        error: 'Connection lost',
      });
    };
  });
}

/**
 * Ensure execution log file exists with header
 */
function ensureExecutionLogFile(path: string, planName: string, taskCount: number): void {
  const dir = join(path, '..');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const header = [
    `# Execution Log: ${planName}`,
    '',
    `**Tasks:** ${taskCount}`,
    `**Started:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ].join('\n');

  writeFileSync(path, header);
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Ensure log file exists with header
 */
function ensureLogFile(path: string, task: SessionTask): void {
  const dir = join(path, '..');

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const header = [
    `# Task Log: ${task.id}`,
    '',
    `**Title:** ${task.title}`,
    `**Started:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ].join('\n');

  writeFileSync(path, header);
}

/**
 * Append event to log file
 */
function appendToLog(path: string, event: any): void {
  const timestamp = new Date().toISOString();
  let line = '';

  if (event.type === 'status') {
    line = `[${timestamp}] **Status:** ${event.message || ''} (${event.phase || ''})`;
  } else if (event.type === 'agent') {
    if (event.eventType === 'tool_call') {
      line = `[${timestamp}] **Tool:** ${event.tool || 'unknown'}`;
      if (event.display) {
        line += `\n  ${event.display}`;
      }
    } else if (event.eventType === 'message') {
      line = `[${timestamp}] **Message:** ${event.content || ''}`;
    }
  } else if (event.type === 'result') {
    line = `[${timestamp}] **Result:** ${event.result?.success ? 'Success' : 'Failed'}`;
    if (event.result?.prUrl) {
      line += `\n  PR: ${event.result.prUrl}`;
    }
  } else if (event.type === 'error') {
    line = `[${timestamp}] **Error:** ${event.error || 'Unknown error'}`;
  }

  if (line) {
    appendFileSync(path, line + '\n\n');
  }
}
