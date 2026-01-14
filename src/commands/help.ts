/**
 * Help command - Show available commands
 */

import { registerCommand, getAllCommands, type CommandResult, type CommandContext } from './types.js';

registerCommand({
  name: 'help',
  aliases: ['h', '?'],
  description: 'Show available commands',
  usage: '/help [command]',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const commands = getAllCommands();

    if (args.length > 0) {
      // Show help for specific command
      const cmdName = args[0].toLowerCase().replace(/^\//, '');
      const cmd = commands.find(c => c.name === cmdName || c.aliases?.includes(cmdName));

      if (cmd) {
        ctx.print(`\n${cmd.name} - ${cmd.description}`);
        if (cmd.usage) {
          ctx.print(`Usage: ${cmd.usage}`);
        }
        if (cmd.aliases && cmd.aliases.length > 0) {
          ctx.print(`Aliases: ${cmd.aliases.map(a => `/${a}`).join(', ')}`);
        }
        ctx.print('');
        return { success: true };
      } else {
        return { success: false, error: `Unknown command: ${args[0]}` };
      }
    }

    // Show all commands
    ctx.print('\nAvailable Commands:\n');

    const maxNameLen = Math.max(...commands.map(c => c.name.length));

    for (const cmd of commands) {
      const padding = ' '.repeat(maxNameLen - cmd.name.length + 2);
      ctx.print(`  /${cmd.name}${padding}${cmd.description}`);
    }

    ctx.print('\nType /help <command> for more details.');
    ctx.print('');

    return { success: true };
  },
});
