#!/usr/bin/env node
/**
 * PR-Agent CLI
 * Delegate repo work to a coding agent.
 *
 * Usage:
 *   npx pr-agent run --repo owner/repo --task "add unit tests"
 *   pr-agent auth
 *   pr-agent snapshot src/
 *   pr-agent show @f1
 */

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './App.js';
import { isAuthenticated, getConfigValue, clearAuth } from './lib/config.js';
import { getSnapshot, resolveRef, getRefContent, formatStats, type SnapshotResult } from './lib/snapshot.js';
import { getGitContext } from './lib/git.js';
import { join, resolve } from 'path';

// Read version from package.json
const VERSION = '1.1.0';

const program = new Command();

program
  .name('pr-agent')
  .description('Delegate repo work to a coding agent.')
  .version(VERSION);

/**
 * Available skills (specialized agents)
 */
const AVAILABLE_SKILLS = [
  'test-writer',
  'code-reviewer',
  'type-fixer',
  'linter',
  'security-scanner',
  'docs-generator',
] as const;

type SkillName = typeof AVAILABLE_SKILLS[number];

/**
 * Run command - Execute a task and create a PR
 */
program
  .command('run')
  .description('Execute a task and create a PR')
  .requiredOption('--repo <owner/repo>', 'Repository to work on')
  .requiredOption('--task <task>', 'Task description')
  .option('--branch <branch>', 'Base branch (default: main)')
  .option('--skill <skill>', `Use a specialized skill: ${AVAILABLE_SKILLS.join(', ')}`)
  .action((options) => {
    const { repo, task, branch, skill } = options;

    // Validate repo format
    if (!repo.includes('/')) {
      console.error('Error: Invalid repo format. Use: owner/repo');
      process.exit(1);
    }

    // Validate skill if provided
    if (skill && !AVAILABLE_SKILLS.includes(skill as SkillName)) {
      console.error(`Error: Invalid skill "${skill}"`);
      console.error(`Available skills: ${AVAILABLE_SKILLS.join(', ')}`);
      process.exit(1);
    }

    // Get GitHub token if authenticated
    const githubToken = getConfigValue('githubToken');

    // Render the app
    render(
      <App
        mode="run"
        repo={repo}
        task={task}
        branch={branch}
        skill={skill}
        version={VERSION}
      />
    );
  });

/**
 * Auth command - Authenticate with GitHub
 */
program
  .command('auth')
  .description('Authenticate with GitHub')
  .action(() => {
    if (isAuthenticated()) {
      const username = getConfigValue('githubUsername');
      console.log(`Already authenticated as ${username || 'unknown'}`);
      console.log('Run "pr-agent logout" to sign out.');
      return;
    }

    render(<App mode="auth" version={VERSION} />);
  });

/**
 * Logout command - Clear authentication
 */
program
  .command('logout')
  .description('Clear GitHub authentication')
  .action(() => {
    clearAuth();
    console.log('Logged out successfully.');
  });

/**
 * Status command - Show current authentication status
 */
program
  .command('status')
  .description('Show authentication status')
  .action(() => {
    if (isAuthenticated()) {
      const username = getConfigValue('githubUsername');
      console.log(`Authenticated as: ${username || 'unknown'}`);
    } else {
      console.log('Not authenticated.');
      console.log('Run "pr-agent auth" to sign in with GitHub.');
    }
  });

/**
 * Test-stream command - Test SSE streaming UI with mock data
 */
program
  .command('test-stream')
  .description('Test streaming UI with mock data (no real Claude Code)')
  .action(() => {
    render(<App mode="test-stream" version={VERSION} />);
  });

/**
 * Fix-PR command - Fix conflicts or update an existing PR
 */
program
  .command('fix-pr')
  .description('Fix conflicts or update an existing PR')
  .requiredOption('--repo <owner/repo>', 'Repository containing the PR')
  .requiredOption('--pr <number>', 'PR number to fix')
  .option('--task <task>', 'Specific task (default: fix merge conflicts)')
  .action((options) => {
    const { repo, pr, task } = options;

    // Validate repo format
    if (!repo.includes('/')) {
      console.error('Error: Invalid repo format. Use: owner/repo');
      process.exit(1);
    }

    // Validate PR number
    const prNumber = parseInt(pr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      console.error('Error: Invalid PR number');
      process.exit(1);
    }

    // Default task is to fix merge conflicts
    const fixTask = task || `Fix merge conflicts in PR #${prNumber} and rebase onto main branch`;

    // Render the app in fix-pr mode
    render(
      <App
        mode="fix-pr"
        repo={repo}
        prNumber={prNumber}
        task={fixTask}
        version={VERSION}
      />
    );
  });

/**
 * Jobs command - List recent jobs
 */
program
  .command('jobs')
  .description('List recent jobs')
  .option('--status <status>', 'Filter by status (running, success, failed)')
  .option('--limit <limit>', 'Maximum number of jobs to show', '10')
  .action(async (options) => {
    const { listJobs } = await import('./lib/api-client.js');

    try {
      const { jobs, count } = await listJobs({
        status: options.status,
        limit: parseInt(options.limit),
      });

      if (count === 0) {
        console.log('No jobs found.');
        return;
      }

      console.log(`\nRecent Jobs (${count}):\n`);
      console.log('─'.repeat(80));

      for (const job of jobs) {
        const statusColor = {
          pending: '\x1b[33m',   // Yellow
          running: '\x1b[36m',   // Cyan
          success: '\x1b[32m',   // Green
          failed: '\x1b[31m',    // Red
        }[job.status] || '\x1b[0m';

        const resetColor = '\x1b[0m';
        const dimColor = '\x1b[2m';

        const createdAt = new Date(job.createdAt).toLocaleString();
        const taskPreview = job.task.length > 50 ? job.task.substring(0, 47) + '...' : job.task;

        console.log(`${statusColor}${job.status.padEnd(8)}${resetColor} ${job.repoFullName}`);
        console.log(`${dimColor}         ${taskPreview}${resetColor}`);
        console.log(`${dimColor}         ${createdAt}${job.sandboxId ? ` · sandbox:${job.sandboxId.substring(0, 8)}` : ''}${resetColor}`);
        if (job.prUrl) {
          console.log(`         ${job.prUrl}`);
        }
        console.log('');
      }
    } catch (error) {
      console.error('Error listing jobs:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Watch command - Watch a running job or replay a completed one
 * This is the killer feature from Electric SQL's durable sessions pattern
 */
program
  .command('watch <jobId>')
  .description('Watch a running job or replay a completed one')
  .option('--speed <speed>', 'Replay speed multiplier (0.5-10)', '1')
  .action(async (jobId: string, options: { speed: string }) => {
    const speed = Math.max(0.5, Math.min(10, parseFloat(options.speed) || 1));

    // Render watch mode
    render(<App mode="watch" jobId={jobId} speed={speed} version={VERSION} />);
  });

/**
 * Replay command - Alias for watch with speed option prominent
 */
program
  .command('replay <jobId>')
  .description('Replay a completed job at custom speed')
  .option('--speed <speed>', 'Replay speed multiplier (default: 4x for fast replay)', '4')
  .action(async (jobId: string, options: { speed: string }) => {
    const speed = Math.max(0.5, Math.min(10, parseFloat(options.speed) || 4));

    render(<App mode="watch" jobId={jobId} speed={speed} version={VERSION} />);
  });

/**
 * Snapshot command - Generate AI-friendly code structure with refs
 * Like agent-browser element refs, but for code
 */
program
  .command('snapshot [path]')
  .description('Generate code structure with AI-friendly refs (@f1, @c2, etc.)')
  .option('-i, --interactive', 'Only show interactive elements (functions, classes)')
  .option('-c, --compact', 'Compact output (no nested items)')
  .option('-d, --depth <depth>', 'Max directory depth', '10')
  .option('--json', 'Output as JSON')
  .action((targetPath: string | undefined, options: { interactive?: boolean; compact?: boolean; depth?: string; json?: boolean }) => {
    const rootPath = targetPath ? resolve(process.cwd(), targetPath) : process.cwd();
    const depth = parseInt(options.depth || '10', 10);

    try {
      const snapshot = getSnapshot({
        path: rootPath,
        depth,
        interactive: options.interactive,
        compact: options.compact,
      });

      if (options.json) {
        console.log(JSON.stringify({
          tree: snapshot.tree,
          refs: snapshot.refs,
          stats: snapshot.stats,
        }, null, 2));
        return;
      }

      // Print header
      const gitContext = getGitContext(rootPath);
      console.log('\n\x1b[1m\x1b[36mCode Snapshot\x1b[0m');
      console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m');
      
      if (gitContext.isGitRepo) {
        console.log(`\x1b[2mRepo: ${gitContext.repo || 'local'} (${gitContext.branch})\x1b[0m`);
      }
      console.log(`\x1b[2mPath: ${rootPath}\x1b[0m`);
      console.log(`\x1b[2mStats: ${formatStats(snapshot.stats)}\x1b[0m`);
      console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m\n');

      // Print tree
      console.log(snapshot.tree);

      // Print legend
      console.log('\n\x1b[2m' + '─'.repeat(50) + '\x1b[0m');
      console.log('\x1b[2mRefs: @f=function, @c=class, @m=module, @t=type\x1b[0m');
      console.log('\x1b[2mUse "pr-agent show @f1" to view a specific ref\x1b[0m\n');
    } catch (err) {
      console.error('\x1b[31mError:\x1b[0m', err instanceof Error ? err.message : 'Failed to generate snapshot');
      process.exit(1);
    }
  });

/**
 * Show command - Display details for a specific ref
 */
program
  .command('show <ref>')
  .description('Show details for a code ref (e.g., @f1, @c2)')
  .option('-c, --context <lines>', 'Lines of context to show', '20')
  .option('-p, --path <path>', 'Root path for snapshot', process.cwd())
  .action((ref: string, options: { context?: string; path?: string }) => {
    const rootPath = options.path ? resolve(process.cwd(), options.path) : process.cwd();
    const contextLines = parseInt(options.context || '20', 10);

    try {
      // Generate snapshot to find the ref
      const snapshot = getSnapshot({ path: rootPath, interactive: false });
      const codeRef = resolveRef(ref, snapshot);

      if (!codeRef) {
        console.error(`\x1b[31mError:\x1b[0m Ref "${ref}" not found`);
        console.log('\x1b[2mRun "pr-agent snapshot" to see available refs\x1b[0m');
        process.exit(1);
      }

      // Print ref details
      console.log('\n\x1b[1m\x1b[36m' + codeRef.ref + '\x1b[0m \x1b[1m' + codeRef.name + '\x1b[0m');
      console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m');
      console.log(`\x1b[2mType:\x1b[0m ${codeRef.type}`);
      console.log(`\x1b[2mPath:\x1b[0m ${codeRef.path}${codeRef.line ? `:${codeRef.line}` : ''}`);
      if (codeRef.signature) {
        console.log(`\x1b[2mSignature:\x1b[0m ${codeRef.signature}`);
      }
      console.log('\x1b[2m' + '─'.repeat(50) + '\x1b[0m\n');

      // Show code content
      const content = getRefContent(codeRef, rootPath, contextLines);
      if (content) {
        console.log('\x1b[2mCode:\x1b[0m');
        console.log(content);
        console.log('');
      } else {
        console.log('\x1b[2mCould not read file content\x1b[0m\n');
      }
    } catch (err) {
      console.error('\x1b[31mError:\x1b[0m', err instanceof Error ? err.message : 'Failed to show ref');
      process.exit(1);
    }
  });

/**
 * Interactive mode - Just type `pr-agent` with no args for a Claude Code-like experience
 */
program
  .command('interactive', { isDefault: true })
  .description('Interactive mode - prompt for repo and task')
  .action(async () => {
    // If any other command was passed, skip interactive mode
    if (process.argv.length > 2 && !['interactive'].includes(process.argv[2])) {
      return;
    }

    const { InteractiveMode } = await import('./components/InteractiveMode.js');
    render(<InteractiveMode version={VERSION} />);
  });

// Parse command line arguments
program.parse();

// Only show help if explicitly requested, not on empty args (interactive mode handles that)
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  program.outputHelp();
}
