/**
 * PR command - Create or view pull requests
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { loadSession } from '../lib/session.js';

registerCommand({
  name: 'pr',
  description: 'View or create pull request',
  usage: '/pr [--create]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    const session = loadSession(ctx.cwd);

    // Show existing PR if available
    if (session?.execution.prUrl && !args.includes('--create')) {
      ctx.print(`\nPull Request: ${session.execution.prUrl}\n`);
      return { success: true };
    }

    // Check if we should create PR
    if (args.includes('--create')) {
      if (!ctx.repo) {
        return { success: false, error: 'No repository connected. Use /connect first.' };
      }

      ctx.print('\nCreating PR would require executing tasks first.');
      ctx.print('Use /ship to execute the plan and create a PR.\n');
      return { success: true };
    }

    // No PR yet
    ctx.print('\nNo pull request created yet.');
    ctx.print('Execute tasks with /ship to create a PR.\n');

    return { success: true };
  },
});
