/**
 * PR-Agent CLI App
 * Main application component
 */

import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Intro, StepList, ResultBox, ErrorBox, PhaseStatus } from './components/index.js';
import type { Step } from './components/StepList.js';
import type { Phase } from './components/PhaseStatus.js';
import { AuthFlow } from './components/AuthFlow.js';
import { StreamingLogs } from './components/StreamingLogs.js';
import { SandboxMonitor } from './components/SandboxMonitor.js';
import { useExecution } from './hooks/useExecution.js';
import { useAuth } from './hooks/useAuth.js';

type AppMode = 'run' | 'auth' | 'test-stream' | 'fix-pr';

type SkillName = 'test-writer' | 'code-reviewer' | 'type-fixer' | 'linter' | 'security-scanner' | 'docs-generator';

interface AppProps {
  mode: AppMode;
  repo?: string;
  task?: string;
  branch?: string;
  skill?: SkillName;
  prNumber?: number;  // For fix-pr mode
  version?: string;
}

/**
 * Run Mode - Execute a task and create a PR
 */
function RunMode({
  repo,
  task,
  branch,
  skill,
}: {
  repo: string;
  task: string;
  branch?: string;
  skill?: SkillName;
}) {
  const { exit } = useApp();
  const state = useExecution({ repo, task, branch, skill });

  // Handle escape key to cancel
  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  // Exit after completion
  useEffect(() => {
    if (state.status === 'success' || state.status === 'failed') {
      // Wait a moment to show the result
      const timer = setTimeout(() => {
        exit();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [state.status, exit]);

  const showPhaseStatus = state.status === 'executing' || state.status === 'streaming';
  const showSteps = state.steps.some(s => s.status !== 'pending');
  const showStreamingLogs = state.agentLogs.length > 0;
  const showSandboxMonitor = state.sandboxMetrics && (state.status === 'streaming' || state.status === 'executing');
  const showResult = state.status === 'success' && state.result;
  const showError = state.status === 'failed' && state.error;

  return (
    <Box flexDirection="column">
      {showPhaseStatus && (
        <PhaseStatus phase={state.phase} message={state.message} />
      )}

      {showSandboxMonitor && state.sandboxMetrics && (
        <SandboxMonitor
          metrics={{
            sandboxId: state.sandboxMetrics.sandboxId,
            jobId: state.jobId,
            uptime: state.sandboxMetrics.uptime,
            estimatedCost: state.sandboxMetrics.estimatedCost,
            phase: state.phase,
            isRunning: state.sandboxMetrics.isRunning,
          }}
          showDetails={true}
        />
      )}

      {showSteps && <StepList steps={state.steps} />}

      {showStreamingLogs && <StreamingLogs logs={state.agentLogs} />}

      {showResult && (
        <ResultBox
          success={true}
          prUrl={state.result?.prUrl}
          prNumber={state.result?.prNumber}
          filesChanged={state.result?.filesChanged}
          additions={state.result?.additions}
          deletions={state.result?.deletions}
          sandboxId={state.result?.sandboxId}
          jobId={state.jobId}
          estimatedCostUsd={state.result?.estimatedCostUsd}
          sandboxDurationSeconds={state.result?.sandboxDurationSeconds}
          llmInputTokens={state.result?.llmInputTokens}
          llmOutputTokens={state.result?.llmOutputTokens}
          llmModel={state.result?.llmModel}
          summary={state.result?.proof?.summary}
          fixBranch={state.result?.fixBranch}
          commitSha={state.result?.commitSha}
        />
      )}

      {showError && <ErrorBox error={state.error!} />}
    </Box>
  );
}

/**
 * Auth Mode - Authenticate with GitHub
 */
function AuthMode() {
  const { exit } = useApp();
  const auth = useAuth();

  // Start auth flow on mount
  useEffect(() => {
    auth.startAuth();
  }, []);

  // Exit after completion
  useEffect(() => {
    if (auth.status === 'success' || auth.status === 'error') {
      const timer = setTimeout(() => {
        exit();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [auth.status, exit]);

  // Handle escape key to cancel
  useInput((input, key) => {
    if (key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column">
      <AuthFlow
        status={auth.status}
        verificationUrl={auth.verificationUrl}
        userCode={auth.userCode}
        error={auth.error}
        username={auth.username}
      />
    </Box>
  );
}

/**
 * Test Stream Mode - Test SSE streaming with mock data
 */
function TestStreamMode() {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('sandbox');
  const [message, setMessage] = useState('Connecting to test stream...');
  const [steps, setSteps] = useState<Step[]>([
    { id: 'sandbox', label: 'Create sandbox', status: 'pending' },
    { id: 'clone', label: 'Clone repository', status: 'pending' },
    { id: 'agent', label: 'Run Claude Code', status: 'pending' },
    { id: 'push', label: 'Push changes', status: 'pending' },
    { id: 'pr', label: 'Create pull request', status: 'pending' },
  ]);
  const [agentLogs, setAgentLogs] = useState<Array<{
    type: 'tool_call' | 'thinking' | 'message' | 'tool_result';
    tool?: string;
    display?: string;
    content?: string;
    timestamp: Date;
  }>>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [esRef, setEsRef] = useState<any>(null);

  useEffect(() => {
    let es: any = null;

    const setupStream = async () => {
      const { getApiBaseUrl } = await import('./lib/config.js');
      const { default: EventSource } = await import('eventsource');

      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/pr-agent/test-stream`;

      es = new EventSource(url);
      setEsRef(es);

      es.onmessage = (event: any) => {
        try {
          if (event.data === ':heartbeat') return;
          const data = JSON.parse(event.data);

          if (data.type === 'status') {
            setPhase(data.phase || 'sandbox');
            setMessage(data.message || '');

            const phaseOrder = ['sandbox', 'clone', 'agent', 'push', 'pr'];
            const currentIndex = phaseOrder.indexOf(data.phase || 'sandbox');
            setSteps(prev => prev.map((step, idx) => ({
              ...step,
              status: idx < currentIndex ? 'completed' : idx === currentIndex ? 'running' : 'pending'
            } as Step)));
          }

          if (data.type === 'agent') {
            setAgentLogs(prev => [...prev, {
              type: data.eventType,
              tool: data.tool,
              display: data.display,
              content: data.output || data.content,
              timestamp: new Date(),
            }].slice(-30));
          }

          if (data.type === 'result') {
            setResult(data.result);
            setSteps(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
            es.close();
          }

          if (data.type === 'error') {
            setError(data.error);
            es.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        setError('Connection lost');
        es.close();
      };
    };

    setupStream();

    return () => {
      if (es) es.close();
    };
  }, []);

  // Handle escape key
  useInput((_input, key) => {
    if (key.escape) {
      if (esRef) esRef.close();
      exit();
    }
  });

  // Exit after result
  useEffect(() => {
    if (result || error) {
      const timer = setTimeout(() => exit(), 500);
      return () => clearTimeout(timer);
    }
  }, [result, error, exit]);

  const showSteps = steps.some(s => s.status !== 'pending');
  const showLogs = agentLogs.length > 0;

  return (
    <Box flexDirection="column">
      <PhaseStatus phase={phase} message={message} />
      {showSteps && <StepList steps={steps} />}
      {showLogs && <StreamingLogs logs={agentLogs} />}
      {result && (
        <ResultBox
          success={true}
          prUrl={result.prUrl}
          prNumber={result.prNumber}
          filesChanged={result.filesChanged}
          additions={result.additions}
          deletions={result.deletions}
          sandboxId={result.sandboxId}
          estimatedCostUsd={result.estimatedCostUsd}
          sandboxDurationSeconds={result.sandboxDurationSeconds}
          llmInputTokens={result.llmInputTokens}
          llmOutputTokens={result.llmOutputTokens}
          llmModel={result.llmModel}
          summary={result.proof?.summary}
          fixBranch={result.fixBranch}
          commitSha={result.commitSha}
        />
      )}
      {error && <ErrorBox error={error} />}
    </Box>
  );
}

/**
 * Fix-PR Mode - Fix conflicts or update an existing PR
 * Fetches PR details first, then works on the PR's head branch
 */
function FixPRMode({
  repo,
  prNumber,
  task,
}: {
  repo: string;
  prNumber: number;
  task: string;
}) {
  // Build a comprehensive task that tells Claude Code exactly what to do
  // The key is to checkout the PR branch (not create a new one)
  const fixTask = `## Task: Fix PR #${prNumber}

${task}

## Instructions:
1. First, fetch and checkout the existing PR branch:
   - Run: gh pr checkout ${prNumber}
   - This will checkout the PR's head branch directly

2. Then fix the merge conflicts:
   - Run: git fetch origin main
   - Run: git rebase origin/main (or git merge origin/main)
   - Resolve any conflicts

3. After fixing:
   - Run tests if applicable
   - Push the changes: git push --force-with-lease

IMPORTANT: Do NOT create a new branch. Use the existing PR branch from 'gh pr checkout ${prNumber}'.`;

  return (
    <RunMode
      repo={repo}
      task={fixTask}
      branch={undefined}
      skill={undefined}
    />
  );
}

/**
 * Main App Component
 */
export function App({ mode, repo, task, branch, skill, prNumber, version }: AppProps) {
  return (
    <Box flexDirection="column">
      <Intro version={version} />

      {mode === 'run' && repo && task && (
        <RunMode repo={repo} task={task} branch={branch} skill={skill} />
      )}

      {mode === 'fix-pr' && repo && prNumber && task && (
        <FixPRMode repo={repo} prNumber={prNumber} task={task} />
      )}

      {mode === 'auth' && <AuthMode />}

      {mode === 'test-stream' && <TestStreamMode />}
    </Box>
  );
}

export default App;
