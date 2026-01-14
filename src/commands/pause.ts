/**
 * Pause and Resume commands - Control execution flow
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  loadSession,
  saveSession,
  updateSessionStatus,
} from '../lib/session.js';

registerCommand({
  name: 'pause',
  description: 'Pause current execution',
  usage: '/pause',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const session = loadSession(ctx.cwd);

    if (!session) {
      return { success: false, error: 'No active session.' };
    }

    if (session.status !== 'shipping') {
      return { success: false, error: 'Not currently executing. Nothing to pause.' };
    }

    updateSessionStatus(session, 'paused');
    saveSession(session, ctx.cwd);

    ctx.print('\n⏸ Execution paused.');
    ctx.print('Use /resume to continue.');
    ctx.print('');

    return { success: true };
  },
});

registerCommand({
  name: 'resume',
  aliases: ['continue'],
  description: 'Resume paused execution',
  usage: '/resume',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    const session = loadSession(ctx.cwd);

    if (!session) {
      return { success: false, error: 'No active session.' };
    }

    if (session.status !== 'paused') {
      return { success: false, error: 'Not paused. Use /ship to start execution.' };
    }

    ctx.print('\n▶ Resuming execution...');

    // Delegate to ship command to continue
    const { COMMANDS } = await import('./types.js');
    const shipCmd = COMMANDS['ship'];

    if (shipCmd) {
      return shipCmd.handler([], ctx);
    }

    return { success: false, error: 'Ship command not found.' };
  },
});
