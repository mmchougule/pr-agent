/**
 * Reset command - Clear the current plan and start fresh
 */

import { existsSync, rmSync } from 'fs';
import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { getPrAgentDir, deleteSession } from '../lib/session.js';

registerCommand({
  name: 'reset',
  aliases: ['clear', 'new'],
  description: 'Clear current plan and start fresh',
  usage: '/reset',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const prAgentDir = getPrAgentDir(ctx.cwd);

    if (!existsSync(prAgentDir)) {
      ctx.print('Nothing to reset.');
      return { success: true };
    }

    try {
      // Remove the entire .pr-agent directory
      rmSync(prAgentDir, { recursive: true, force: true });
      ctx.print('Plan cleared. Ready for a new task.');
      return {
        success: true,
        modeData: { reset: true },
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to reset: ${err.message}`,
      };
    }
  },
});
