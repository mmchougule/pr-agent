/**
 * Retry command - Reset failed tasks to pending so they can be re-executed
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { getPlanPath } from '../lib/session.js';
import { loadPlan, savePlan } from '../lib/plan-parser.js';

registerCommand({
  name: 'retry',
  aliases: ['rerun'],
  description: 'Reset failed tasks to pending for re-execution',
  usage: '/retry [task-id]',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const planPath = getPlanPath(ctx.cwd);
    const plan = loadPlan(planPath);

    if (!plan) {
      return { success: false, error: 'No plan found.' };
    }

    const taskId = args[0];

    if (taskId) {
      // Reset specific task
      const task = plan.tasks.find(t => t.id === taskId || t.id.toLowerCase() === taskId.toLowerCase());
      if (!task) {
        return { success: false, error: `Task ${taskId} not found.` };
      }
      if (task.status !== 'failed') {
        return { success: false, error: `Task ${taskId} is not failed (status: ${task.status}).` };
      }
      task.status = 'pending';
      savePlan(plan, planPath);
      ctx.print(`Reset ${task.id} to pending.`);
    } else {
      // Reset all failed tasks
      const failedTasks = plan.tasks.filter(t => t.status === 'failed');
      if (failedTasks.length === 0) {
        ctx.print('No failed tasks to retry.');
        return { success: true };
      }

      for (const task of failedTasks) {
        task.status = 'pending';
      }
      savePlan(plan, planPath);
      ctx.print(`Reset ${failedTasks.length} failed task(s) to pending.`);
    }

    return {
      success: true,
      modeData: { planUpdated: true },
    };
  },
});
