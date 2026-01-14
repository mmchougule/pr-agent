/**
 * REPL Component - Invariant CLI
 * Interactive Claude Code-like experience
 *
 * Features:
 * - Tab to switch between Plan and Ship modes
 * - Natural language input triggers plan generation
 * - Auto-detect git repo from current directory
 * - Project-local .inv/ directory
 * - Clean terminal UI inspired by Claude Code
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { colors } from '../theme.js';
import {
  parseCommand,
  getCommand,
  type CommandContext,
} from '../commands/index.js';
import { loadSession, createSession, saveSession, hasPlan, getPlanPath, getProgress } from '../lib/session.js';
import { loadPlan, type Plan, updateTaskInPlan } from '../lib/plan-parser.js';
import { generatePlanWithClaude, getClaudeApiKey } from '../lib/claude-client.js';
import { getSnapshot, formatStats } from '../lib/snapshot.js';
import { savePlan, createEmptyPlan, type PlanTask } from '../lib/plan-parser.js';
import {
  updateSessionStatus,
  addConversationMessage,
  updateTaskStatus,
} from '../lib/session.js';
import { runShipEngineSingleExecution, type ShipCallbacks, type AgentEvent } from '../lib/ship-engine.js';
import { execSync } from 'child_process';

// Product name
const PRODUCT_NAME = 'inv';

interface REPLProps {
  version?: string;
  initialRepo?: string;
  onSwitchMode?: (mode: string, data: Record<string, any>) => void;
}

type OutputLine = {
  type: 'user' | 'system' | 'error' | 'info' | 'success' | 'task';
  content: string;
};

type AgentMode = 'plan' | 'ship';

/**
 * Auto-detect git remote origin to get owner/repo
 */
function detectGitRepo(): string | undefined {
  try {
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const httpsMatch = remote.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = remote.match(/github\.com:([^/]+)\/([^/.]+)/);
    const match = httpsMatch || sshMatch;
    if (match) {
      return `${match[1]}/${match[2]}`;
    }
  } catch {
    // Not a git repo or no remote
  }
  return undefined;
}

/**
 * Get project name from current directory
 */
function getProjectName(): string {
  const cwd = process.cwd();
  return cwd.split('/').pop() || 'project';
}

export function REPL({ version = '1.0.0', initialRepo, onSwitchMode }: REPLProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [repo, setRepo] = useState<string | undefined>(initialRepo);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<AgentMode>('plan');
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [projectName] = useState(getProjectName());
  const cwd = process.cwd();
  const executionAbortRef = useRef<boolean>(false);

  // Initialize session on mount - auto-detect repo
  // Start in Plan mode like Claude Code (don't auto-load plans)
  useEffect(() => {
    const detectedRepo = detectGitRepo();
    if (detectedRepo && !initialRepo) {
      setRepo(detectedRepo);
    }

    let session = loadSession(cwd);

    if (session) {
      if (session.repo) setRepo(session.repo);

      // Check if there's an existing plan (but don't auto-switch to Ship mode)
      if (hasPlan(cwd)) {
        const plan = loadPlan(getPlanPath(cwd));
        if (plan) {
          setCurrentPlan(plan);
          // Don't auto-switch to ship mode - let user decide
          // Just show a hint that a plan exists
        }
      }
    } else {
      session = createSession(detectedRepo || initialRepo, 'main');
      saveSession(session, cwd);
    }
  }, [cwd, initialRepo]);

  // During execution, keep only last 10 lines. Otherwise keep 40.
  const addOutput = useCallback((type: OutputLine['type'], content: string) => {
    setOutput(prev => {
      const limit = isProcessing ? 10 : 40;
      return [...prev.slice(-limit), { type, content }];
    });
  }, [isProcessing]);

  const clearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  const print = useCallback((message: string) => {
    addOutput('system', message);
  }, [addOutput]);

  const printError = useCallback((message: string) => {
    addOutput('error', message);
  }, [addOutput]);

  const createContext = useCallback((): CommandContext => ({
    session: loadSession(cwd),
    cwd,
    print,
    printError,
    repo,
  }), [cwd, print, printError, repo]);

  /**
   * Show plan summary
   */
  const showPlanSummary = useCallback((plan: Plan) => {
    clearOutput();
    addOutput('success', plan.metadata.name); // Show random name (e.g., "bold-falcon")
    addOutput('info', plan.context || '');
    addOutput('info', '');

    for (const task of plan.tasks) {
      const icon = {
        pending: 'o',
        running: '*',
        completed: '+',
        failed: 'x',
        skipped: '-',
      }[task.status] || '?';

      addOutput('task', `${icon} [${task.id}] ${task.title}`);
      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        for (const ac of task.acceptanceCriteria.slice(0, 2)) {
          addOutput('info', `    - ${ac}`);
        }
      }
    }

    const pending = plan.tasks.filter(t => t.status === 'pending').length;
    addOutput('info', '');
    addOutput('info', `${pending}/${plan.tasks.length} tasks pending`);
  }, [addOutput, clearOutput]);

  /**
   * Generate plan from natural language description
   */
  const generatePlan = useCallback(async (description: string) => {
    if (!repo) {
      addOutput('error', 'No repository detected. Use /connect <owner/repo>');
      return;
    }

    clearOutput();
    addOutput('system', `Planning: "${description}"`);
    addOutput('info', '');

    // Analyze codebase
    addOutput('info', 'Analyzing codebase...');
    const snapshot = getSnapshot({
      path: cwd,
      depth: 5,
      interactive: true,
      compact: true,
    });
    addOutput('info', `Found ${formatStats(snapshot.stats)}`);

    // Create/update session
    let session = loadSession(cwd);
    if (!session) {
      session = createSession(repo);
    }

    updateSessionStatus(session, 'planning');
    addConversationMessage(session, 'user', description);
    saveSession(session, cwd);

    addOutput('info', '');
    addOutput('info', 'Generating tasks...');

    // Check API key
    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      addOutput('error', 'No ANTHROPIC_API_KEY found');
      addOutput('info', 'Set: export ANTHROPIC_API_KEY=sk-ant-...');
      return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
      addOutput('error', 'Invalid API key format');
      return;
    }

    try {
      const result = await generatePlanWithClaude(
        description,
        snapshot.tree,
        (msg) => addOutput('info', msg)
      );

      const tasks: PlanTask[] = result.tasks.map(t => ({
        ...t,
        status: 'pending' as const,
      }));

      if (tasks.length === 0) {
        addOutput('error', 'No tasks generated. Try being more specific.');
        return;
      }

      // Create plan
      const plan = createEmptyPlan(
        `${description.substring(0, 60)}${description.length > 60 ? '...' : ''}`,
        repo,
        session.branch || 'main'
      );
      plan.context = description;
      plan.tasks = tasks;

      // Save plan
      savePlan(plan, getPlanPath(cwd));
      setCurrentPlan(plan);

      // Update session
      session.planName = plan.metadata.name;
      session.planPath = getPlanPath(cwd);
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
      saveSession(session, cwd);

      // Show the plan
      showPlanSummary(plan);
      addOutput('info', '');
      addOutput('info', `Tokens: ${result.usage.input_tokens} in / ${result.usage.output_tokens} out`);

      // Switch to ship mode and show confirm
      setMode('ship');
      setShowConfirm(true);

    } catch (err: any) {
      addOutput('error', `Failed: ${err.message}`);
    }
  }, [repo, cwd, addOutput, clearOutput, showPlanSummary]);

  /**
   * Execute the current plan using ship-engine with full tracking
   */
  const executePlan = useCallback(async () => {
    if (!currentPlan) {
      addOutput('error', 'No plan to execute.');
      return;
    }

    if (!repo) {
      addOutput('error', 'No repository detected.');
      return;
    }

    const pending = currentPlan.tasks.filter(t => t.status === 'pending');
    if (pending.length === 0) {
      addOutput('success', 'All tasks completed!');
      return;
    }

    setShowConfirm(false);
    setIsProcessing(true);
    executionAbortRef.current = false;

    clearOutput();
    addOutput('system', `Executing ${pending.length} tasks...`);
    addOutput('info', '');

    // Ship engine callbacks for real-time updates
    const callbacks: ShipCallbacks = {
      onTaskStart: (task) => {
        addOutput('system', `━━━ ${task.id}: ${task.title} ━━━`);

        // Update plan.md to show running
        updateTaskInPlan(getPlanPath(cwd), task.id, 'running');

        // Reload plan to update UI
        const updatedPlan = loadPlan(getPlanPath(cwd));
        if (updatedPlan) setCurrentPlan(updatedPlan);
      },

      onTaskComplete: (task) => {
        addOutput('success', `✓ ${task.id} completed`);

        // Reload plan to update UI
        const updatedPlan = loadPlan(getPlanPath(cwd));
        if (updatedPlan) setCurrentPlan(updatedPlan);
      },

      onTaskFailed: (task, error) => {
        addOutput('error', `✗ ${task.id} failed: ${error}`);

        // Reload plan to update UI
        const updatedPlan = loadPlan(getPlanPath(cwd));
        if (updatedPlan) setCurrentPlan(updatedPlan);
      },

      onProgress: () => {
        // Progress tracked via task status list, no separate progress bar needed
      },

      onStatus: (message, phase) => {
        if (phase === 'agent') {
          addOutput('info', `  ${message}`);
        } else {
          addOutput('system', message);
        }
      },

      onAgent: (event: AgentEvent) => {
        if (event.eventType === 'tool_call' && event.tool) {
          addOutput('info', `  → ${event.tool}${event.display ? `: ${event.display.slice(0, 50)}` : ''}`);
        } else if (event.eventType === 'message' && event.content) {
          const shortContent = event.content.slice(0, 80);
          addOutput('info', `  ${shortContent}${event.content.length > 80 ? '...' : ''}`);
        }
      },

      onComplete: (prUrl) => {
        addOutput('info', '');
        addOutput('success', '━━━ All tasks completed! ━━━');
        if (prUrl) {
          addOutput('success', `PR: ${prUrl}`);
        }
      },

      onError: (error) => {
        addOutput('error', `Error: ${error}`);
      },

      // Step mode confirmation (for future --step flag)
      onStepPause: async (nextTask) => {
        // For now, continue automatically
        // In future, could pause and wait for user confirmation
        return !executionAbortRef.current;
      },
    };

    try {
      // Use single execution mode - sends full plan to Claude Code
      // Creates one sandbox, executes all tasks, creates one PR
      const result = await runShipEngineSingleExecution(
        {
          cwd,
          repo,
        },
        callbacks
      );

      if (result.success) {
        addOutput('info', '');
        addOutput('success', `Completed ${result.completedTasks}/${result.totalTasks} tasks`);
        if (result.prUrl) {
          addOutput('success', `PR: ${result.prUrl}`);
        }
      } else {
        addOutput('error', `Execution stopped: ${result.error || 'Unknown error'}`);
        addOutput('info', `Completed ${result.completedTasks}/${result.totalTasks} tasks`);
      }
    } catch (err: any) {
      addOutput('error', `Execution failed: ${err.message}`);
    } finally {
      setIsProcessing(false);

      // Final reload of plan
      const finalPlan = loadPlan(getPlanPath(cwd));
      if (finalPlan) setCurrentPlan(finalPlan);
    }
  }, [currentPlan, repo, cwd, addOutput, clearOutput]);

  // Handle input submission
  const handleSubmit = useCallback(async (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

    setInput('');
    setShowConfirm(false);

    // Check if it's a slash command
    const parsed = parseCommand(trimmed);

    if (parsed) {
      const cmd = getCommand(parsed.name);

      if (!cmd) {
        addOutput('error', `Unknown: /${parsed.name}`);
        return;
      }

      setIsProcessing(true);

      try {
        // Special handling for /plan show - local only
        if (parsed.name === 'plan' && (parsed.args[0] === 'show' || parsed.args.length === 0)) {
          if (currentPlan) {
            showPlanSummary(currentPlan);
          } else {
            addOutput('info', 'No plan exists. Describe what to build.');
          }
          return;
        }

        const ctx = createContext();
        const result = await cmd.handler(parsed.args, ctx);

        if (!result.success && result.error) {
          addOutput('error', result.error);
        }

        if (result.switchMode && onSwitchMode) {
          onSwitchMode(result.switchMode, result.modeData || {});
          return;
        }

        if (result.exit) {
          exit();
          return;
        }

        if (result.modeData?.repo) {
          setRepo(result.modeData.repo);
        }

        // Handle /reset - clear plan and switch to plan mode
        if (result.modeData?.reset) {
          setCurrentPlan(null);
          setMode('plan');
          clearOutput();
        }

        // Handle /retry - reload plan after task status change
        if (result.modeData?.planUpdated) {
          const updatedPlan = loadPlan(getPlanPath(cwd));
          if (updatedPlan) {
            setCurrentPlan(updatedPlan);
            showPlanSummary(updatedPlan);
          }
        }

        // Handle /done - plan archived, switch to plan mode
        if (result.modeData?.planArchived) {
          setCurrentPlan(null);
          setMode('plan');
        }
      } catch (err: any) {
        addOutput('error', err.message || 'Unknown error');
      } finally {
        setIsProcessing(false);
      }

      return;
    }

    // Natural language input
    addOutput('user', trimmed);

    if (mode === 'plan') {
      setIsProcessing(true);
      try {
        await generatePlan(trimmed);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // In ship mode with text, show help
      if (currentPlan) {
        addOutput('info', 'Type "y" or press Enter to execute, "n" to cancel.');
        setShowConfirm(true);
      } else {
        addOutput('info', 'No plan. Press Tab to switch to Plan mode.');
      }
    }
  }, [addOutput, createContext, exit, mode, onSwitchMode, generatePlan, currentPlan, showPlanSummary]);

  // Handle keyboard shortcuts - including Enter key for confirmation
  useInput((char, key) => {
    if (key.escape) {
      if (showConfirm) {
        setShowConfirm(false);
        addOutput('info', 'Cancelled.');
      } else {
        exit();
      }
      return;
    }

    // Handle Enter key for execution when in ship mode with plan
    if (key.return && !isProcessing && mode === 'ship' && currentPlan && !input) {
      if (showConfirm) {
        executePlan();
      } else {
        setShowConfirm(true);
        addOutput('info', '');
        addOutput('success', 'Execute plan? (Enter = yes, Esc = cancel)');
      }
      return;
    }

    // Handle y/n for confirmation
    if (showConfirm && !input) {
      if (char === 'y' || char === 'Y') {
        executePlan();
        return;
      }
      if (char === 'n' || char === 'N') {
        setShowConfirm(false);
        addOutput('info', 'Cancelled.');
        return;
      }
    }

    if (key.tab && !isProcessing) {
      const newMode = mode === 'plan' ? 'ship' : 'plan';
      setMode(newMode);
      setShowConfirm(false);

      if (newMode === 'ship' && currentPlan) {
        showPlanSummary(currentPlan);
      } else if (newMode === 'plan') {
        clearOutput();
        addOutput('info', 'What do you want to build?');
      } else {
        clearOutput();
        addOutput('info', 'No plan. Press Tab to create one.');
      }
    }
  });

  const modeColor = mode === 'plan' ? colors.info : colors.primary;
  const borderColor = isProcessing ? colors.warning : showConfirm ? colors.success : modeColor;

  // Get placeholder text
  const getPlaceholder = () => {
    if (showConfirm) {
      return 'Enter = execute, Esc = cancel';
    }
    if (mode === 'plan') {
      return 'Describe what to build...';
    }
    if (currentPlan) {
      return 'Enter to execute, Tab for new plan';
    }
    return 'Tab to switch to Plan mode';
  };

  // Calculate task stats
  const taskStats = currentPlan
    ? `${currentPlan.tasks.filter(t => t.status === 'pending').length}/${currentPlan.tasks.length}`
    : null;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box borderStyle="round" borderColor={borderColor} paddingX={1}>
        <Box flexGrow={1}>
          <Text color={colors.primary} bold>{PRODUCT_NAME}</Text>
          <Text color={colors.muted}> v{version}</Text>
        </Box>
        <Box gap={1}>
          <Text color={mode === 'plan' ? colors.info : colors.muted} bold={mode === 'plan'}>
            {mode === 'plan' ? '[Plan]' : 'Plan'}
          </Text>
          <Text color={mode === 'ship' ? colors.primary : colors.muted} bold={mode === 'ship'}>
            {mode === 'ship' ? '[Ship]' : 'Ship'}
          </Text>
        </Box>
      </Box>

      {/* Context bar */}
      <Box paddingX={2} marginTop={1}>
        <Text color={colors.muted}>
          {repo || projectName}
          {taskStats && <Text color={colors.primary}> | {taskStats} tasks</Text>}
        </Text>
      </Box>

      {/* Task status during execution - compact list only */}
      {isProcessing && currentPlan && (
        <Box paddingX={2} marginTop={1} flexDirection="column">
          {currentPlan.tasks.slice(0, 6).map((task) => {
            const icon = {
              pending: '○',
              running: '●',
              completed: '✓',
              failed: '✗',
              skipped: '−',
            }[task.status] || '?';

            const statusColor = {
              pending: colors.muted,
              running: colors.warning,
              completed: colors.success,
              failed: colors.error,
              skipped: colors.muted,
            }[task.status] || colors.muted;

            return (
              <Box key={task.id}>
                <Text color={statusColor}>{icon}</Text>
                <Text color={task.status === 'running' ? colors.text : colors.muted}>
                  {' '}{task.id}: {task.title.slice(0, 45)}{task.title.length > 45 ? '...' : ''}
                </Text>
              </Box>
            );
          })}
          {currentPlan.tasks.length > 6 && (
            <Text color={colors.muted} dimColor>  +{currentPlan.tasks.length - 6} more</Text>
          )}
        </Box>
      )}

      {/* Output area */}
      <Box flexDirection="column" paddingX={2} marginTop={1} minHeight={6}>
        {output.length === 0 && mode === 'plan' && !currentPlan && (
          <Box flexDirection="column">
            <Text color={colors.text}>What do you want to build?</Text>
            <Text color={colors.muted}>Type a description or /help for commands</Text>
          </Box>
        )}
        {output.length === 0 && mode === 'plan' && currentPlan && (
          <Box flexDirection="column">
            <Text color={colors.text}>What do you want to build?</Text>
            <Text color={colors.muted}>Type a description or /help for commands</Text>
            <Text color={colors.muted}> </Text>
            <Text color={colors.warning}>
              Existing plan: {currentPlan.metadata.name} ({currentPlan.tasks.filter(t => t.status === 'pending').length} pending)
            </Text>
            <Text color={colors.muted}>Tab to Ship mode to continue, or /reset to start fresh</Text>
          </Box>
        )}
        {output.length === 0 && mode === 'ship' && !currentPlan && (
          <Box flexDirection="column">
            <Text color={colors.muted}>No plan loaded.</Text>
            <Text color={colors.muted}>Press Tab to switch to Plan mode.</Text>
          </Box>
        )}
        {output.map((line, i) => (
          <Box key={i}>
            <Text
              color={
                line.type === 'error' ? colors.error
                : line.type === 'user' ? colors.info
                : line.type === 'success' ? colors.success
                : line.type === 'task' ? colors.text
                : line.type === 'system' ? colors.text
                : colors.muted
              }
              bold={line.type === 'success' || line.type === 'system'}
            >
              {line.type === 'user' ? '> ' : ''}{line.content}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Confirmation bar - shows when ready to execute */}
      {showConfirm && (
        <Box marginTop={1} paddingX={2}>
          <Box borderStyle="round" borderColor={colors.success} paddingX={2} paddingY={0}>
            <Text color={colors.success} bold>
              Execute {currentPlan?.tasks.filter(t => t.status === 'pending').length} tasks?
            </Text>
            <Text color={colors.muted}> [Enter] Yes </Text>
            <Text color={colors.muted}> [Esc] Cancel</Text>
          </Box>
        </Box>
      )}

      {/* Input box */}
      <Box marginTop={1} borderStyle="round" borderColor={borderColor} paddingX={1}>
        {isProcessing ? (
          <Text color={colors.warning}>Processing...</Text>
        ) : (
          <Box flexGrow={1}>
            <Text color={modeColor} bold>{'>'}</Text>
            <Text> </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder={getPlaceholder()}
            />
          </Box>
        )}
      </Box>

      {/* Status bar */}
      <Box paddingX={2} marginTop={1}>
        <Text color={colors.muted} dimColor>
          {showConfirm
            ? 'Enter: execute | Esc: cancel'
            : 'Tab: switch | /help: commands | Esc: exit'}
        </Text>
      </Box>
    </Box>
  );
}

export default REPL;
