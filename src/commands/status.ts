/**
 * Status command - Show current session and execution status
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  loadSession,
  hasPlan,
  getPlanPath,
  getProgress,
} from '../lib/session.js';
import { loadPlan } from '../lib/plan-parser.js';

registerCommand({
  name: 'status',
  aliases: ['st'],
  description: 'Show current status',
  usage: '/status',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    ctx.print('\n━━━ PR-Agent Status ━━━\n');

    // Check for connected repo
    if (ctx.repo) {
      ctx.print(`Repository: ${ctx.repo}`);
    } else {
      ctx.print('Repository: Not connected (use /connect <owner/repo>)');
    }

    // Session info
    const session = loadSession(ctx.cwd);
    if (session) {
      ctx.print(`Session: ${session.sessionId.substring(0, 8)}...`);
      ctx.print(`Status: ${session.status}`);

      if (session.execution.jobId) {
        ctx.print(`Last Job: ${session.execution.jobId.substring(0, 8)}...`);
      }
      if (session.execution.prUrl) {
        ctx.print(`PR: ${session.execution.prUrl}`);
      }
    } else {
      ctx.print('Session: None');
    }

    ctx.print('');

    // Plan info
    if (hasPlan(ctx.cwd)) {
      const plan = loadPlan(getPlanPath(ctx.cwd));
      if (plan) {
        ctx.print(`Plan: ${plan.metadata.name}`);

        const progress = session ? getProgress(session) : null;
        if (progress) {
          const bar = createProgressBar(progress.percent, 20);
          ctx.print(`Progress: ${bar} ${progress.completed}/${progress.total} tasks`);

          if (progress.running > 0) {
            const runningTask = session?.tasks.find(t => t.status === 'running');
            if (runningTask) {
              ctx.print(`Running: [${runningTask.id}] ${runningTask.title}`);
            }
          }

          if (progress.failed > 0) {
            ctx.print(`Failed: ${progress.failed} task(s)`);
          }
        }
      }
    } else {
      ctx.print('Plan: None (use /plan to create)');
    }

    ctx.print('');

    // Background jobs hint
    ctx.print('Jobs: Use /jobs to view recent jobs\n');

    return { success: true };
  },
});

/**
 * Create a simple ASCII progress bar
 */
function createProgressBar(percent: number, width: number): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
}
