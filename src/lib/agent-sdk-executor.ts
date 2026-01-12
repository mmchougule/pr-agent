/**
 * PR-Agent SDK Executor
 *
 * Uses Claude Agent SDK instead of CLI for better:
 * - Subagents (parallel execution)
 * - Hooks (event streaming, billing)
 * - Skills (specialized agents)
 * - MCP integration
 */

// Note: This requires @anthropic-ai/claude-agent-sdk package
// npm install @anthropic-ai/claude-agent-sdk

export interface PRAgentTask {
  repo: string;
  task: string;
  branch?: string;
  skill?: string;
  githubToken?: string;
}

export interface PRAgentResult {
  success: boolean;
  prUrl?: string;
  prNumber?: number;
  filesChanged?: number;
  error?: string;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  duration?: number;
}

export interface AgentEvent {
  type: 'status' | 'tool_call' | 'tool_result' | 'thinking' | 'subagent' | 'result' | 'error';
  timestamp: Date;
  phase?: string;
  message?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  content?: string;
  subagentId?: string;
  result?: PRAgentResult;
  error?: string;
}

/**
 * Skill definitions for specialized agents
 */
export const SKILL_AGENTS = {
  'test-writer': {
    description: 'Expert at writing comprehensive unit tests with edge cases',
    prompt: `You are a test writing expert. Your job is to:
1. Analyze the codebase to understand existing patterns
2. Write thorough unit tests with good coverage
3. Include edge cases and error scenarios
4. Use the project's existing test framework (Jest, Vitest, etc.)
5. Run tests to verify they pass`,
    tools: ['Read', 'Write', 'Bash', 'Glob', 'Grep'],
  },

  'code-reviewer': {
    description: 'Reviews code for quality, security, and best practices',
    prompt: `You are a senior code reviewer. Your job is to:
1. Analyze code for quality issues
2. Check for security vulnerabilities (OWASP top 10)
3. Identify performance problems
4. Suggest improvements
5. Return a detailed review report`,
    tools: ['Read', 'Glob', 'Grep'],
  },

  'type-fixer': {
    description: 'Fixes TypeScript type errors systematically',
    prompt: `You are a TypeScript expert. Your job is to:
1. Run tsc to identify all type errors
2. Analyze each error and its root cause
3. Fix types systematically (don't use 'any' unless necessary)
4. Re-run tsc to verify fixes
5. Continue until all errors are resolved`,
    tools: ['Read', 'Edit', 'Bash', 'Glob'],
  },

  'linter': {
    description: 'Fixes linting and formatting issues',
    prompt: `You are a code quality expert. Your job is to:
1. Run the project's linter (ESLint, Prettier, etc.)
2. Auto-fix what can be auto-fixed
3. Manually fix remaining issues
4. Ensure code follows project conventions
5. Run linter again to verify all issues resolved`,
    tools: ['Read', 'Edit', 'Bash', 'Glob'],
  },

  'security-scanner': {
    description: 'Scans for security vulnerabilities and fixes them',
    prompt: `You are a security expert. Your job is to:
1. Run npm audit / yarn audit
2. Identify vulnerable dependencies
3. Update packages to fix vulnerabilities
4. Check for common security issues in code
5. Report findings and fixes made`,
    tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
  },

  'docs-generator': {
    description: 'Generates documentation for code',
    prompt: `You are a documentation expert. Your job is to:
1. Analyze public APIs and functions
2. Add JSDoc/TSDoc comments
3. Update or create README files
4. Document complex logic
5. Keep docs concise but informative`,
    tools: ['Read', 'Write', 'Edit', 'Glob'],
  },

  'refactorer': {
    description: 'Refactors code for better structure and maintainability',
    prompt: `You are a refactoring expert. Your job is to:
1. Analyze code structure
2. Identify code smells and duplication
3. Apply appropriate refactoring patterns
4. Ensure tests still pass after changes
5. Keep changes minimal and focused`,
    tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  },
} as const;

export type SkillName = keyof typeof SKILL_AGENTS;

/**
 * System prompt for the main PR-Agent
 */
export const PR_AGENT_SYSTEM_PROMPT = `You are PR-Agent, an autonomous coding agent that completes tasks and creates pull requests.

## Your Capabilities
- Read and understand codebases
- Write, edit, and create files
- Run commands (npm, git, tests, etc.)
- Use specialized subagents for specific tasks
- Create branches and commits
- Open pull requests

## Available Subagents
You can delegate work to specialized subagents using the Task tool:
- test-writer: Write comprehensive unit tests
- code-reviewer: Review code for quality and security
- type-fixer: Fix TypeScript type errors
- linter: Fix linting and formatting issues
- security-scanner: Find and fix security vulnerabilities
- docs-generator: Generate documentation
- refactorer: Refactor code for better structure

## Workflow
1. Understand the task and explore the codebase
2. Plan your approach
3. Execute changes (use subagents for specialized work)
4. Test your changes
5. Commit with a clear message
6. Create a pull request

## Important Rules
- Always run tests before committing
- Write clear commit messages
- Create focused, reviewable PRs
- Don't modify files outside the task scope
- Use existing patterns from the codebase`;

/**
 * Generate the SDK options for a task
 */
export function createAgentOptions(task: PRAgentTask) {
  return {
    systemPrompt: PR_AGENT_SYSTEM_PROMPT,
    allowedTools: [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
      'Task',  // Enable subagents
    ],
    agents: SKILL_AGENTS,
    permissionMode: 'acceptEdits' as const,
    // MCP servers for external integrations
    mcpServers: task.githubToken ? {
      github: {
        command: 'npx',
        args: ['@anthropic/mcp-github'],
        env: { GITHUB_TOKEN: task.githubToken },
      },
    } : undefined,
  };
}

/**
 * Build the task prompt
 */
export function buildTaskPrompt(task: PRAgentTask): string {
  const parts = [
    `Repository: ${task.repo}`,
    `Branch: ${task.branch || 'main'}`,
    '',
    `Task: ${task.task}`,
  ];

  if (task.skill && task.skill in SKILL_AGENTS) {
    parts.push('', `Use the ${task.skill} subagent to complete this task.`);
  }

  parts.push(
    '',
    'After completing the task:',
    '1. Run any relevant tests',
    '2. Create a new branch with a descriptive name',
    '3. Commit your changes with a clear message',
    '4. Push the branch',
    '5. Report the branch name and summary of changes'
  );

  return parts.join('\n');
}

/**
 * Example usage with the SDK (requires @anthropic-ai/claude-agent-sdk)
 *
 * ```typescript
 * import { query } from "@anthropic-ai/claude-agent-sdk";
 * import { createAgentOptions, buildTaskPrompt, PRAgentTask } from './agent-sdk-executor';
 *
 * async function executeWithSDK(task: PRAgentTask, onEvent: (event: AgentEvent) => void) {
 *   const options = createAgentOptions(task);
 *   const prompt = buildTaskPrompt(task);
 *
 *   for await (const message of query({ prompt, options })) {
 *     // Handle different message types
 *     if (message.type === 'assistant' && message.content) {
 *       for (const block of message.content) {
 *         if (block.type === 'tool_use') {
 *           onEvent({
 *             type: 'tool_call',
 *             timestamp: new Date(),
 *             tool: block.name,
 *             toolInput: block.input,
 *           });
 *         } else if (block.type === 'text') {
 *           onEvent({
 *             type: 'thinking',
 *             timestamp: new Date(),
 *             content: block.text,
 *           });
 *         }
 *       }
 *     }
 *
 *     if ('result' in message) {
 *       onEvent({
 *         type: 'result',
 *         timestamp: new Date(),
 *         result: { success: true, ... },
 *       });
 *     }
 *   }
 * }
 * ```
 */

export default {
  SKILL_AGENTS,
  PR_AGENT_SYSTEM_PROMPT,
  createAgentOptions,
  buildTaskPrompt,
};
