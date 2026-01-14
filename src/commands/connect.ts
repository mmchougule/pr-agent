/**
 * Connect command - Connect to a GitHub repository
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  loadSession,
  saveSession,
  createSession,
} from '../lib/session.js';

registerCommand({
  name: 'connect',
  aliases: ['c', 'repo'],
  description: 'Connect to a GitHub repository',
  usage: '/connect <owner/repo> [--branch <branch>]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    if (args.length === 0) {
      if (ctx.repo) {
        ctx.print(`\nCurrently connected to: ${ctx.repo}`);
        return { success: true };
      }
      return { success: false, error: 'Usage: /connect <owner/repo>' };
    }

    const repoArg = args[0];

    // Validate repo format
    if (!repoArg.includes('/')) {
      return { success: false, error: 'Invalid format. Use: owner/repo (e.g., facebook/react)' };
    }

    // Parse branch option
    let branch = 'main';
    const branchIdx = args.indexOf('--branch');
    if (branchIdx !== -1 && args[branchIdx + 1]) {
      branch = args[branchIdx + 1];
    }

    // Create or update session
    let session = loadSession(ctx.cwd);
    if (!session) {
      session = createSession(repoArg, branch);
    } else {
      session.repo = repoArg;
      session.branch = branch;
    }
    saveSession(session, ctx.cwd);

    ctx.print(`\n✓ Connected to: ${repoArg}`);
    ctx.print(`  Branch: ${branch}`);
    ctx.print('');
    ctx.print('Now you can:');
    ctx.print('  /plan <description>  - Create an execution plan');
    ctx.print('  /run <task>          - Execute a single task');
    ctx.print('');

    return {
      success: true,
      modeData: { repo: repoArg, branch },
    };
  },
});
