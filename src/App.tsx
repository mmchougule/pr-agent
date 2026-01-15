/**
 * PR-Agent CLI App
 * Main application component
 */

import React, { useState, useEffect } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Intro, StepList, ResultBox, ErrorBox, PhaseStatus, ProgressBar } from './components/index.js';
import type { Step } from './components/StepList.js';
import type { Phase } from './components/PhaseStatus.js';
import { AuthFlow } from './components/AuthFlow.js';
import { StreamingLogs } from './components/StreamingLogs.js';
import { SandboxMonitor } from './components/SandboxMonitor.js';
import { useExecution } from './hooks/useExecution.js';
import { useAuth } from './hooks/useAuth.js';

type AppMode = 'run' | 'auth' | 'test-stream' | 'fix-pr' | 'watch';

type SkillName = 'test-writer' | 'code-reviewer' | 'type-fixer' | 'linter' | 'security-scanner' | 'docs-generator';

interface AppProps {
  mode: AppMode;
  repo?: string;
  task?: string;
  branch?: string;
  skill?: SkillName;
  prNumber?: number;  // For fix-pr mode
  jobId?: string;     // For watch mode
  speed?: number;     // For watch mode (replay speed)
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
  const showProgressBar = (state.status === 'executing' || state.status === 'streaming') && state.progress > 0;
  const showResult = state.status === 'success' && state.result;
  const showError = state.status === 'failed' && state.error;

  return (
    <Box flexDirection="column">
      {showPhaseStatus && (
        <PhaseStatus phase={state.phase} message={state.message} />
      )}

      {showProgressBar && (
        <Box marginY={1}>
          <ProgressBar
            progress={state.progress}
            style="bar"
            width={40}
            label="Progress:"
            showPercentage={true}
          />
        </Box>
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
 * The backend creates a new branch and handles push/PR creation.
 * We just provide context about what PR to reference.
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
  // Build the task with PR context but WITHOUT telling Claude to checkout PR branch
  // The backend (CodingSupervisor) handles branch management - it creates invariant/fix-ci-xxx
  // Claude should work on that branch, not checkout a different one
  const fixTask = `## Task: Fix issues in PR #${prNumber}

${task}

## Context:
- This is related to PR #${prNumber} on this repository
- You can view PR details with: gh pr view ${prNumber}
- Focus on fixing the issues described above

## Important:
- Work on the CURRENT branch (do NOT run 'gh pr checkout' or switch branches)
- The system handles branch management and PR creation automatically
- After making changes, commit them (the system will push and create/update PR)`;

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
 * Watch Mode - Watch a running job or replay a completed one
 * Connects to the watch/replay endpoint and streams events
 */
function WatchMode({ jobId, speed = 1 }: { jobId: string; speed?: number }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('sandbox');
  const [message, setMessage] = useState(`Connecting to job ${jobId.substring(0, 8)}...`);
  const [jobStatus, setJobStatus] = useState<'connecting' | 'watching' | 'replaying' | 'done' | 'error'>('connecting');
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
      // Use replay endpoint for watch (handles both running and completed jobs)
      const url = speed !== 1
        ? `${baseUrl}/api/pr-agent/${jobId}/replay?speed=${speed}`
        : `${baseUrl}/api/pr-agent/${jobId}/watch`;

      setMessage(speed !== 1 ? `Replaying at ${speed}x speed...` : 'Connecting...');

      es = new EventSource(url);
      setEsRef(es);

      es.onopen = () => {
        setJobStatus(speed !== 1 ? 'replaying' : 'watching');
        setMessage(speed !== 1 ? `Replaying at ${speed}x speed...` : 'Watching live...');
      };

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
              timestamp: new Date(data.timestamp || Date.now()),
            }].slice(-30));
          }

          if (data.type === 'result') {
            setResult(data.result);
            setJobStatus('done');
            setSteps(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
            es.close();
          }

          if (data.type === 'error') {
            setError(data.error);
            setJobStatus('error');
            es.close();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = (err: any) => {
        // Check if it's just the stream ending (normal for replay)
        if (es.readyState === 2) { // CLOSED
          if (!result && !error) {
            setJobStatus('done');
          }
        } else {
          setError('Connection lost');
          setJobStatus('error');
        }
        es.close();
      };
    };

    setupStream();

    return () => {
      if (es) es.close();
    };
  }, [jobId, speed]);

  // Handle escape key
  useInput((_input, key) => {
    if (key.escape) {
      if (esRef) esRef.close();
      exit();
    }
  });

  // Exit after result
  useEffect(() => {
    if (jobStatus === 'done' || jobStatus === 'error') {
      const timer = setTimeout(() => exit(), 500);
      return () => clearTimeout(timer);
    }
  }, [jobStatus, exit]);

  const showSteps = steps.some(s => s.status !== 'pending');
  const showLogs = agentLogs.length > 0;

  return (
    <Box flexDirection="column">
      <PhaseStatus phase={phase} message={message} />
      {showSteps && <StepList steps={steps} />}
      {showLogs && <StreamingLogs logs={agentLogs} />}
      {result && (
        <ResultBox
          success={result.success}
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
 * Main App Component
 */
export function App({ mode, repo, task, branch, skill, prNumber, jobId, speed, version }: AppProps) {
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

      {mode === 'watch' && jobId && (
        <WatchMode jobId={jobId} speed={speed} />
      )}
    </Box>
  );
}

export default App;
