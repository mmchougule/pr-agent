/**
 * History command - List and view archived plans
 */

import { existsSync, readFileSync } from 'fs';
import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { listArchivedPlans } from './done.js';

registerCommand({
  name: 'history',
  aliases: ['plans', 'archived'],
  description: 'List archived plans',
  usage: '/history [plan-name]',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    const plans = listArchivedPlans(ctx.cwd);

    if (plans.length === 0) {
      ctx.print('No archived plans.');
      ctx.print('');
      ctx.print('Completed plans are archived with /done.');
      return { success: true };
    }

    // If a plan name is provided, show that plan
    if (args.length > 0) {
      const searchTerm = args.join(' ').toLowerCase();
      const plan = plans.find(p => p.name.toLowerCase().includes(searchTerm));

      if (!plan) {
        ctx.print(`Plan not found: ${searchTerm}`);
        ctx.print('');
        ctx.print('Available plans:');
        for (const p of plans.slice(0, 5)) {
          ctx.print(`  - ${p.name}`);
        }
        return { success: true };
      }

      // Show plan content
      if (existsSync(plan.path)) {
        const content = readFileSync(plan.path, 'utf-8');
        ctx.print(`━━━ ${plan.name} ━━━`);
        ctx.print(`Completed: ${plan.date.toLocaleDateString()}`);
        ctx.print('');

        // Show first 30 lines
        const lines = content.split('\n').slice(0, 30);
        for (const line of lines) {
          ctx.print(line);
        }
        if (content.split('\n').length > 30) {
          ctx.print('');
          ctx.print(`... (${content.split('\n').length - 30} more lines)`);
        }
      }

      return { success: true };
    }

    // List all archived plans
    ctx.print('━━━ Plan History ━━━');
    ctx.print('');

    for (const plan of plans.slice(0, 10)) {
      const dateStr = plan.date.toLocaleDateString();
      ctx.print(`  ${dateStr}  ${plan.name}`);
    }

    if (plans.length > 10) {
      ctx.print(`  ... and ${plans.length - 10} more`);
    }

    ctx.print('');
    ctx.print('Use /history <name> to view a specific plan.');

    return { success: true };
  },
});
