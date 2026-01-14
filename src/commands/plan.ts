/**
 * Plan command - Create and manage execution plans
 *
 * Uses snapshot to analyze codebase, then calls Claude API directly
 * to generate AI-powered task breakdown.
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import {
  loadSession,
  saveSession,
  createSession,
  getPlanPath,
  hasPlan,
  addConversationMessage,
  updateSessionStatus,
} from '../lib/session.js';
import { loadPlan, savePlan, createEmptyPlan, type PlanTask } from '../lib/plan-parser.js';
import { getSnapshot, formatStats } from '../lib/snapshot.js';
import { hasClaudeApiKey, generatePlanWithClaude } from '../lib/claude-client.js';

registerCommand({
  name: 'plan',
  aliases: ['p'],
  description: 'Create or view execution plan',
  usage: '/plan [show|edit|clear] or /plan <description>',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = args[0]?.toLowerCase();

    // /plan show - Show current plan
    if (subcommand === 'show') {
      if (!hasPlan(ctx.cwd)) {
        return { success: false, error: 'No plan exists. Use /plan <description> to create one.' };
      }

      const plan = loadPlan(getPlanPath(ctx.cwd));
      if (!plan) {
        return { success: false, error: 'Failed to load plan.' };
      }

      ctx.print(`\n# ${plan.metadata.name}\n`);
      ctx.print(`Repo: ${plan.metadata.repo} | Branch: ${plan.metadata.branch}`);
      ctx.print('');

      if (plan.context) {
        ctx.print('## Context');
        ctx.print(plan.context);
        ctx.print('');
      }

      ctx.print('## Tasks');
      for (const task of plan.tasks) {
        const statusIcon = {
          pending: '○',
          running: '◐',
          completed: '●',
          failed: '✗',
          skipped: '⊘',
        }[task.status] || '?';

        ctx.print(`${statusIcon} [${task.id}] ${task.title} (${task.status})`);
      }
      ctx.print('');

      return { success: true };
    }

    // /plan clear - Clear current plan
    if (subcommand === 'clear') {
      const planPath = getPlanPath(ctx.cwd);
      const { unlinkSync, existsSync } = await import('fs');

      if (existsSync(planPath)) {
        unlinkSync(planPath);
        ctx.print('Plan cleared.');
      } else {
        ctx.print('No plan to clear.');
      }

      return { success: true };
    }

    // /plan edit - Open plan for editing (future: in-place editing)
    if (subcommand === 'edit') {
      const planPath = getPlanPath(ctx.cwd);

      if (!hasPlan(ctx.cwd)) {
        return { success: false, error: 'No plan exists. Use /plan <description> to create one.' };
      }

      ctx.print(`Plan file: ${planPath}`);
      ctx.print('Edit the plan.md file directly, then run /plan show to verify.');

      return { success: true };
    }

    // /plan (no args) - Check status
    if (args.length === 0) {
      if (hasPlan(ctx.cwd)) {
        const plan = loadPlan(getPlanPath(ctx.cwd));
        if (plan) {
          const completed = plan.tasks.filter(t => t.status === 'completed').length;
          const total = plan.tasks.length;
          ctx.print(`\nCurrent plan: ${plan.metadata.name}`);
          ctx.print(`Progress: ${completed}/${total} tasks completed`);
          ctx.print('\nUse /plan show to view details, /ship to execute.');
          return { success: true };
        }
      }
      ctx.print('\nNo plan exists. Create one with: /plan <description>');
      ctx.print('Example: /plan add user authentication with JWT');
      return { success: true };
    }

    // /plan <description> - Create a new plan using AI
    const description = args.join(' ');

    if (!ctx.repo) {
      return { success: false, error: 'No repository connected. Use /connect <owner/repo> first.' };
    }

    ctx.print(`\nCreating plan for: "${description}"`);
    ctx.print('');

    // Generate snapshot of current codebase
    ctx.print('Analyzing codebase...');
    const snapshot = getSnapshot({
      path: ctx.cwd,
      depth: 5,
      interactive: true, // Only functions and classes
      compact: true,
    });
    ctx.print(`   Found: ${formatStats(snapshot.stats)}`);
    ctx.print('');

    // Create or update session
    let session = loadSession(ctx.cwd);
    if (!session) {
      session = createSession(ctx.repo);
    }

    updateSessionStatus(session, 'planning');
    addConversationMessage(session, 'user', description);
    saveSession(session, ctx.cwd);

    // Generate plan with AI
    ctx.print('Generating tasks...');

    try {
      let tasks: PlanTask[];
      let usage: { input_tokens: number; output_tokens: number } | undefined;

      // Use direct Claude API if key is configured
      if (hasClaudeApiKey()) {
        ctx.print('   Using Claude API directly...');
        const result = await generatePlanWithClaude(
          description,
          snapshot.tree,
          (msg) => ctx.print(`   ${msg}`)
        );
        tasks = result.tasks.map(t => ({
          ...t,
          status: 'pending' as const,
        }));
        usage = result.usage;
      } else {
        // Fall back to local heuristic plan
        ctx.print('   (No API key - using fallback plan generation)');
        ctx.print('   Tip: Set ANTHROPIC_API_KEY or run: pr-agent config set anthropicApiKey <key>');
        tasks = generateFallbackPlan(description);
      }

      if (tasks.length === 0) {
        ctx.print('\nNo tasks generated. Try being more specific.');
        return { success: false, error: 'Failed to generate tasks' };
      }

      // Store usage for display
      const tokenUsage = usage;

      // Create plan
      const plan = createEmptyPlan(
        `Plan: ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`,
        ctx.repo,
        session.branch || 'main'
      );
      plan.context = description;
      plan.tasks = tasks;

      // Save plan
      savePlan(plan, getPlanPath(ctx.cwd));

      // Update session
      session.planName = plan.metadata.name;
      session.planPath = getPlanPath(ctx.cwd);
      session.tasks = plan.tasks.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        dependencies: t.dependencies,
        status: t.status,
        acceptanceCriteria: t.acceptanceCriteria,
      }));
      updateSessionStatus(session, 'plan_ready');
      addConversationMessage(session, 'assistant', `Created plan with ${plan.tasks.length} tasks.`);
      saveSession(session, ctx.cwd);

      ctx.print('');
      ctx.print(`Plan created with ${plan.tasks.length} tasks\n`);
      ctx.print(`## ${plan.metadata.name}\n`);
      for (const task of plan.tasks) {
        ctx.print(`  o [${task.id}] ${task.title}`);
        if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
          for (const criterion of task.acceptanceCriteria.slice(0, 2)) {
            ctx.print(`      - ${criterion}`);
          }
        }
      }
      ctx.print('');

      if (tokenUsage) {
        ctx.print(`Tokens: ${tokenUsage.input_tokens} in / ${tokenUsage.output_tokens} out`);
      }

      ctx.print('Plan saved to .pr-agent/plan.md');
      ctx.print('Run /ship to execute the plan');

      return { success: true };
    } catch (err: any) {
      ctx.printError(`Failed to generate plan: ${err.message}`);
      return { success: false, error: err.message };
    }
  },
});

/**
 * Generate a fallback plan locally when backend is unavailable
 */
function generateFallbackPlan(description: string): PlanTask[] {
  // Simple heuristic-based task generation
  const tasks: PlanTask[] = [];

  // Always start with analysis
  tasks.push({
    id: 'US-001',
    title: 'Analyze requirements and existing code',
    description: `Review the codebase to understand: ${description}. Identify files that need to be modified.`,
    priority: 1,
    dependencies: [],
    status: 'pending',
    acceptanceCriteria: [
      'Identified all files that need changes',
      'Understood existing patterns and conventions',
    ],
  });

  // Main implementation
  tasks.push({
    id: 'US-002',
    title: 'Implement core functionality',
    description: `Implement the main feature: ${description}`,
    priority: 2,
    dependencies: ['US-001'],
    status: 'pending',
    acceptanceCriteria: [
      'Core functionality implemented',
      'Code follows existing patterns',
      'No linting errors',
    ],
  });

  // Tests
  tasks.push({
    id: 'US-003',
    title: 'Add tests',
    description: 'Add unit tests and integration tests for the new functionality',
    priority: 3,
    dependencies: ['US-002'],
    status: 'pending',
    acceptanceCriteria: [
      'Unit tests added',
      'All tests pass',
      'Good test coverage',
    ],
  });

  // Documentation
  tasks.push({
    id: 'US-004',
    title: 'Update documentation',
    description: 'Update README, comments, and any relevant documentation',
    priority: 4,
    dependencies: ['US-002'],
    status: 'pending',
    acceptanceCriteria: [
      'README updated if needed',
      'Code comments added',
      'API documentation updated',
    ],
  });

  return tasks;
}
