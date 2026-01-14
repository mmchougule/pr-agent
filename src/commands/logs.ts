/**
 * Logs command - View task execution logs
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getLogsDir, loadSession } from '../lib/session.js';

registerCommand({
  name: 'logs',
  aliases: ['log', 'l'],
  description: 'View task execution logs',
  usage: '/logs [--task <id>] [--list]',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const logsDir = getLogsDir(ctx.cwd);

    // --list: Show available logs
    if (args.includes('--list') || args.length === 0) {
      if (!existsSync(logsDir)) {
        ctx.print('\nNo logs available yet. Execute tasks with /ship first.\n');
        return { success: true };
      }

      const files = readdirSync(logsDir).filter(f => f.endsWith('.md'));

      if (files.length === 0) {
        ctx.print('\nNo logs available yet. Execute tasks with /ship first.\n');
        return { success: true };
      }

      ctx.print('\nAvailable logs:\n');
      for (const file of files) {
        const taskId = file.replace('.md', '');
        ctx.print(`  /logs --task ${taskId}`);
      }
      ctx.print('');

      return { success: true };
    }

    // --task <id>: View specific task log
    const taskIdx = args.indexOf('--task');
    if (taskIdx !== -1 && args[taskIdx + 1]) {
      const taskId = args[taskIdx + 1];
      const logPath = join(logsDir, `${taskId}.md`);

      if (!existsSync(logPath)) {
        return { success: false, error: `No log found for task: ${taskId}` };
      }

      const content = readFileSync(logPath, 'utf-8');
      ctx.print(`\n━━━ Log: ${taskId} ━━━\n`);
      ctx.print(content);
      ctx.print('');

      return { success: true };
    }

    // Show latest log
    const session = loadSession(ctx.cwd);
    if (session?.currentTaskId) {
      const logPath = join(logsDir, `${session.currentTaskId}.md`);

      if (existsSync(logPath)) {
        const content = readFileSync(logPath, 'utf-8');
        ctx.print(`\n━━━ Log: ${session.currentTaskId} ━━━\n`);
        ctx.print(content);
        ctx.print('');
        return { success: true };
      }
    }

    ctx.print('\nNo recent log. Use /logs --list to see available logs.\n');
    return { success: true };
  },
});
