/**
 * Diff command - Show uncommitted changes
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { execSync } from 'child_process';

registerCommand({
  name: 'diff',
  aliases: ['d', 'changes'],
  description: 'Show uncommitted changes',
  usage: '/diff [--staged]',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const staged = args.includes('--staged') || args.includes('-s');

    try {
      const cmd = staged ? 'git diff --staged' : 'git diff';
      const output = execSync(cmd, {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (!output.trim()) {
        ctx.print(staged ? '\nNo staged changes.\n' : '\nNo uncommitted changes.\n');
        return { success: true };
      }

      ctx.print(`\n━━━ ${staged ? 'Staged' : 'Uncommitted'} Changes ━━━\n`);
      ctx.print(output);
      ctx.print('');

      return { success: true };
    } catch (err: any) {
      if (err.message?.includes('not a git repository')) {
        return { success: false, error: 'Not a git repository.' };
      }
      return { success: false, error: err.message || 'Failed to get diff.' };
    }
  },
});
