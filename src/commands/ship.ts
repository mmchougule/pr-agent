/**
 * Ship command - Execute the current plan
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  loadSession,
  saveSession,
  hasPlan,
  getPlanPath,
  updateSessionStatus,
  getNextTask,
  updateTaskStatus,
  getProgress,
} from '../lib/session.js';
import { loadPlan, updateTaskInPlan, planTasksToSessionTasks } from '../lib/plan-parser.js';

registerCommand({
  name: 'ship',
  aliases: ['s', 'run', 'execute'],
  description: 'Execute the current plan',
  usage: '/ship [--step|--auto|--background]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    // Check for plan
    if (!hasPlan(ctx.cwd)) {
      return {
        success: false,
        error: 'No plan exists. Use /plan <description> to create one first.',
      };
    }

    // Parse options
    const stepMode = args.includes('--step') || args.includes('-s');
    const autoMode = args.includes('--auto') || args.includes('-a');
    const backgroundMode = args.includes('--background') || args.includes('-b');

    if (autoMode && stepMode) {
      return {
        success: false,
        error: 'Cannot use --auto and --step together.',
      };
    }

    // Load plan and session
    const plan = loadPlan(getPlanPath(ctx.cwd));
    if (!plan) {
      return { success: false, error: 'Failed to load plan.' };
    }

    let session = loadSession(ctx.cwd);
    if (!session) {
      return { success: false, error: 'No session found. Run /plan first.' };
    }

    // Sync tasks from plan to session
    session.tasks = planTasksToSessionTasks(plan.tasks);

    // Get progress
    const progress = getProgress(session);

    if (progress.completed === progress.total) {
      ctx.print('\n✓ All tasks already completed!');
      if (session.execution.prUrl) {
        ctx.print(`PR: ${session.execution.prUrl}`);
      }
      return { success: true };
    }

    // Get next task
    const nextTask = getNextTask(session);
    if (!nextTask) {
      ctx.print('\nNo tasks ready to execute.');
      ctx.print('Check task dependencies or use /plan show to see status.');
      return { success: true };
    }

    ctx.print(`\nStarting execution: ${plan.metadata.name}`);
    ctx.print(`Progress: ${progress.completed}/${progress.total} tasks completed`);
    ctx.print('');

    // In background mode, dispatch and return
    if (backgroundMode) {
      ctx.print('Starting background execution...');
      ctx.print('Use /status to check progress, /watch to see live output.');

      // Mark session as shipping
      updateSessionStatus(session, 'shipping');
      session.currentTaskId = nextTask.id;
      saveSession(session, ctx.cwd);

      // Return with switch to trigger background execution
      return {
        success: true,
        message: 'Background execution started.',
        switchMode: 'run',
        modeData: {
          repo: plan.metadata.repo,
          task: nextTask.description,
          taskId: nextTask.id,
          background: true,
        },
      };
    }

    // Interactive execution - switch to run mode
    ctx.print(`Next task: [${nextTask.id}] ${nextTask.title}`);
    ctx.print(nextTask.description);
    ctx.print('');

    if (stepMode) {
      ctx.print('Step mode: Will pause after this task.');
    } else if (!autoMode) {
      ctx.print('Default mode: Will pause after each task for review.');
    }

    // Mark task as running
    updateTaskStatus(session, nextTask.id, 'running');
    updateTaskInPlan(getPlanPath(ctx.cwd), nextTask.id, 'running');
    updateSessionStatus(session, 'shipping');
    session.currentTaskId = nextTask.id;
    saveSession(session, ctx.cwd);

    // Switch to run mode to execute the task
    return {
      success: true,
      switchMode: 'run',
      modeData: {
        repo: plan.metadata.repo,
        task: `Task ${nextTask.id}: ${nextTask.title}\n\n${nextTask.description}\n\nAcceptance Criteria:\n${
          nextTask.acceptanceCriteria?.map(c => `- ${c}`).join('\n') || 'None specified'
        }`,
        taskId: nextTask.id,
        stepMode,
        autoMode,
      },
    };
  },
});
