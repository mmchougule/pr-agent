/**
 * Done command - Mark current plan as complete and archive it
 */

import { existsSync, mkdirSync, renameSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  getPrAgentDir,
  getPlanPath,
  loadSession,
  saveSession,
  updateSessionStatus,
  hasPlan,
} from '../lib/session.js';
import { loadPlan } from '../lib/plan-parser.js';

const ARCHIVE_DIR = 'archive';

/**
 * Get the archive directory path
 */
function getArchiveDir(cwd: string): string {
  return join(getPrAgentDir(cwd), ARCHIVE_DIR);
}

/**
 * Archive the current plan
 */
function archivePlan(cwd: string): { success: boolean; archivePath?: string; error?: string } {
  const planPath = getPlanPath(cwd);

  if (!existsSync(planPath)) {
    return { success: false, error: 'No plan to archive' };
  }

  const plan = loadPlan(planPath);
  if (!plan) {
    return { success: false, error: 'Failed to load plan' };
  }

  const archiveDir = getArchiveDir(cwd);

  // Create archive directory if it doesn't exist
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  // Create timestamped archive filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = plan.metadata.name.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 30);
  const archiveFileName = `${timestamp}_${safeName}.md`;
  const archivePath = join(archiveDir, archiveFileName);

  // Move plan to archive
  renameSync(planPath, archivePath);

  return { success: true, archivePath };
}

/**
 * List archived plans
 */
export function listArchivedPlans(cwd: string): Array<{ name: string; date: Date; path: string }> {
  const archiveDir = getArchiveDir(cwd);

  if (!existsSync(archiveDir)) {
    return [];
  }

  const files = readdirSync(archiveDir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const path = join(archiveDir, f);
      const stat = statSync(path);
      return {
        name: f.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_/, '').replace('.md', ''),
        date: stat.mtime,
        path,
      };
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return files;
}

registerCommand({
  name: 'done',
  aliases: ['complete', 'finish', 'archive'],
  description: 'Mark plan complete and archive it',
  usage: '/done',
  handler: (args: string[], ctx: CommandContext): CommandResult => {
    if (!hasPlan(ctx.cwd)) {
      ctx.print('No active plan to complete.');
      return { success: true };
    }

    const plan = loadPlan(getPlanPath(ctx.cwd));
    if (!plan) {
      return { success: false, error: 'Failed to load plan' };
    }

    // Show plan summary
    const completed = plan.tasks.filter(t => t.status === 'completed').length;
    const total = plan.tasks.length;

    ctx.print(`Plan: ${plan.metadata.name}`);
    ctx.print(`Completed: ${completed}/${total} tasks`);
    ctx.print('');

    // Archive the plan
    const result = archivePlan(ctx.cwd);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Update session
    const session = loadSession(ctx.cwd);
    if (session) {
      updateSessionStatus(session, 'completed');
      session.planName = undefined;
      session.planPath = undefined;
      session.tasks = [];
      session.currentTaskId = undefined;
      saveSession(session, ctx.cwd);
    }

    ctx.print(`✓ Plan archived to: ${basename(result.archivePath!)}`);
    ctx.print('');
    ctx.print('Ready for a new task. Type a description or /help.');

    return {
      success: true,
      modeData: { planArchived: true },
    };
  },
});
