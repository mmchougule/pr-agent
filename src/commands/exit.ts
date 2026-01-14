/**
 * Exit command - Exit the CLI
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';

registerCommand({
  name: 'exit',
  aliases: ['quit', 'q'],
  description: 'Exit pr-agent',
  usage: '/exit',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    ctx.print('\nGoodbye!\n');
    return { success: true, exit: true };
  },
});
