/**
 * Jobs command - List recent jobs from the API
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { listJobs } from '../lib/api-client.js';
import { getBackgroundJobs, updateBackgroundJob } from '../lib/session.js';

registerCommand({
  name: 'jobs',
  aliases: ['j'],
  description: 'List recent jobs',
  usage: '/jobs [--local]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    const showLocal = args.includes('--local');

    if (showLocal) {
      // Show local background jobs from ~/.pr-agent/global-state.json
      const jobs = getBackgroundJobs();

      if (jobs.length === 0) {
        ctx.print('\nNo local jobs tracked.\n');
        return { success: true };
      }

      ctx.print('\n━━━ Local Background Jobs ━━━\n');
      for (const job of jobs.slice(0, 10)) {
        const icon = {
          running: '◐',
          completed: '●',
          failed: '✗',
        }[job.status] || '○';

        const startedAt = new Date(job.startedAt).toLocaleString();
        ctx.print(`${icon} ${job.jobId.substring(0, 8)} (${job.status}) - ${startedAt}`);
      }
      ctx.print('\nNote: Local jobs may be stale. Use /jobs without --local for API status.\n');
      return { success: true };
    }

    // Fetch from API
    try {
      ctx.print('\nFetching jobs from API...\n');
      const { jobs, count } = await listJobs({ limit: 10 });

      if (count === 0) {
        ctx.print('No jobs found.\n');
        return { success: true };
      }

      ctx.print(`━━━ Recent Jobs (${count}) ━━━\n`);

      for (const job of jobs) {
        const icon = {
          pending: '○',
          running: '◐',
          success: '●',
          completed: '●',
          failed: '✗',
          no_changes: '⊘',
          cancelled: '⊗',
        }[job.status] || '○';

        const createdAt = new Date(job.createdAt).toLocaleString();
        const taskPreview = job.task.length > 40 ? job.task.substring(0, 37) + '...' : job.task;

        ctx.print(`${icon} ${job.status.padEnd(10)} ${job.id}`);
        ctx.print(`                    ${job.repoFullName}`);
        ctx.print(`                    ${taskPreview}`);
        ctx.print(`                    ${createdAt}`);
        if (job.prUrl) {
          ctx.print(`                    ${job.prUrl}`);
        }
        ctx.print('');

        // Update local job status to match API (cleanup)
        updateBackgroundJob(job.id, job.status === 'success' ? 'completed' : job.status === 'failed' ? 'failed' : 'running');
      }

      ctx.print('Use "inv watch <job-id>" to watch a specific job.\n');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      ctx.print(`Error fetching jobs: ${errorMessage}\n`);
      ctx.print('Use /jobs --local to see locally tracked jobs.\n');
      return { success: false, error: errorMessage };
    }
  },
});
