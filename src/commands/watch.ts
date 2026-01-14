/**
 * Watch command - Watch a running job or replay a completed one
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { loadSession, getRunningJobs } from '../lib/session.js';

registerCommand({
  name: 'watch',
  aliases: ['w'],
  description: 'Watch a running job or replay completed one',
  usage: '/watch [job-id] [--speed <n>]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    // Parse speed option
    let speed = 1;
    const speedIdx = args.indexOf('--speed');
    if (speedIdx !== -1 && args[speedIdx + 1]) {
      speed = parseFloat(args[speedIdx + 1]) || 1;
      speed = Math.max(0.5, Math.min(10, speed));
    }

    // Filter out speed args to get job ID
    const nonSpeedArgs = args.filter((_, i) => {
      if (i === speedIdx || i === speedIdx + 1) return false;
      return true;
    });

    let jobId = nonSpeedArgs[0];

    // If no job ID provided, try to find one
    if (!jobId) {
      // Check session for current job
      const session = loadSession(ctx.cwd);
      if (session?.execution.jobId) {
        jobId = session.execution.jobId;
        ctx.print(`Watching current session job: ${jobId.substring(0, 8)}...`);
      } else {
        // Check for running background jobs
        const runningJobs = getRunningJobs();
        if (runningJobs.length > 0) {
          jobId = runningJobs[0].jobId;
          ctx.print(`Watching background job: ${jobId.substring(0, 8)}...`);
        } else {
          return {
            success: false,
            error: 'No job to watch. Provide a job ID or run /ship first.',
          };
        }
      }
    }

    ctx.print(`\nConnecting to job ${jobId.substring(0, 8)}...`);
    if (speed !== 1) {
      ctx.print(`Replay speed: ${speed}x`);
    }
    ctx.print('');

    // Switch to watch mode
    return {
      success: true,
      switchMode: 'watch',
      modeData: {
        jobId,
        speed,
      },
    };
  },
});
