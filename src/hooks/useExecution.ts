/**
 * useExecution Hook
 * Manages execution state and SSE streaming for PR agent jobs
 */

import { useState, useEffect, useCallback } from 'react';
import { executeTask, streamJob, type StreamEvent } from '../lib/api-client.js';
import type { Step, StepStatus } from '../components/StepList.js';
import type { Phase } from '../components/PhaseStatus.js';

interface AgentLog {
  type: 'tool_call' | 'thinking' | 'message' | 'tool_result';
  tool?: string;
  display?: string;
  content?: string;
  timestamp: Date;
}

interface SandboxMetrics {
  sandboxId?: string;
  uptime: number;           // seconds since start
  estimatedCost: number;    // USD (estimated based on E2B pricing)
  startTime: Date;
  isRunning: boolean;
}

interface ExecutionState {
  status: 'idle' | 'executing' | 'streaming' | 'success' | 'failed';
  phase: Phase;
  message: string;
  steps: Step[];
  agentLogs: AgentLog[];
  result?: StreamEvent['result'];
  error?: string;
  jobId?: string;  // Job ID for tracking
  sandboxMetrics?: SandboxMetrics;
}

const DEFAULT_STEPS: Step[] = [
  { id: 'sandbox', label: 'Create sandbox', status: 'pending' },
  { id: 'clone', label: 'Clone repository', status: 'pending' },
  { id: 'agent', label: 'Run Claude Code', status: 'pending' },
  { id: 'push', label: 'Push changes', status: 'pending' },
  { id: 'pr', label: 'Create pull request', status: 'pending' },
];

type SkillName = 'test-writer' | 'code-reviewer' | 'type-fixer' | 'linter' | 'security-scanner' | 'docs-generator';

interface UseExecutionOptions {
  repo: string;
  task: string;
  branch?: string;
  skill?: SkillName;
  githubToken?: string;
}

export function useExecution(options: UseExecutionOptions | null) {
  const [state, setState] = useState<ExecutionState>({
    status: 'idle',
    phase: 'sandbox',
    message: '',
    steps: DEFAULT_STEPS.map(s => ({ ...s })),
    agentLogs: [],
  });

  const updateStepStatus = useCallback((stepId: string, status: StepStatus, detail?: string) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((step) =>
        step.id === stepId ? { ...step, status, detail } : step
      ),
    }));
  }, []);

  const execute = useCallback(async () => {
    if (!options) return;

    const startTime = new Date();

    setState((prev) => ({
      ...prev,
      status: 'executing',
      phase: 'sandbox',
      message: 'Starting execution...',
      steps: DEFAULT_STEPS.map(s => ({ ...s })),
      sandboxMetrics: {
        uptime: 0,
        estimatedCost: 0,
        startTime,
        isRunning: true,
      },
    }));

    try {
      // Execute the task
      const response = await executeTask({
        repo: options.repo,
        task: options.task,
        branch: options.branch,
        skill: options.skill,
        githubToken: options.githubToken,
      });

      setState((prev) => ({
        ...prev,
        status: 'streaming',
        message: 'Creating sandbox...',
        jobId: response.jobId,  // Store jobId for display
      }));

      // Start streaming
      const stream = streamJob(response.streamUrl, {
        onStatus: (message, phase, sandboxId) => {
          const typedPhase = (phase as Phase) || 'sandbox';

          setState((prev) => {
            // Calculate uptime and estimated cost
            const uptime = prev.sandboxMetrics?.startTime
              ? Math.floor((Date.now() - prev.sandboxMetrics.startTime.getTime()) / 1000)
              : 0;
            // E2B pricing: ~$0.12/min for standard sandbox
            const estimatedCost = (uptime / 60) * 0.12;

            return {
              ...prev,
              phase: typedPhase,
              message,
              sandboxMetrics: {
                ...prev.sandboxMetrics,
                sandboxId: sandboxId || prev.sandboxMetrics?.sandboxId,
                uptime,
                estimatedCost,
                startTime: prev.sandboxMetrics?.startTime || new Date(),
                isRunning: true,
              },
            };
          });

          // Update step statuses based on phase
          const phaseOrder = ['sandbox', 'clone', 'agent', 'push', 'pr'];
          const currentIndex = phaseOrder.indexOf(typedPhase);

          phaseOrder.forEach((p, index) => {
            if (index < currentIndex) {
              updateStepStatus(p, 'completed');
            } else if (index === currentIndex) {
              updateStepStatus(p, 'running', message);
            }
          });
        },

        // Handle agent events (tool calls, thinking, messages) for streaming logs
        onAgent: (event) => {
          setState((prev) => ({
            ...prev,
            agentLogs: [
              ...prev.agentLogs,
              {
                type: event.eventType,
                tool: event.tool,
                display: event.display,
                content: event.content,
                timestamp: new Date(),
              },
            ].slice(-30), // Keep last 30 logs
          }));
        },

        onResult: (result) => {
          if (result?.success) {
            setState((prev) => ({
              ...prev,
              status: 'success',
              phase: 'complete',
              result,
              steps: prev.steps.map((step) => ({ ...step, status: 'completed' as StepStatus })),
              sandboxMetrics: prev.sandboxMetrics ? {
                ...prev.sandboxMetrics,
                sandboxId: result.sandboxId || prev.sandboxMetrics.sandboxId,
                uptime: result.sandboxDurationSeconds || prev.sandboxMetrics.uptime,
                estimatedCost: result.estimatedCostUsd || prev.sandboxMetrics.estimatedCost,
                isRunning: false,
              } : undefined,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              status: 'failed',
              phase: 'complete',
              result,
              error: result?.error || 'Task failed',
              sandboxMetrics: prev.sandboxMetrics ? {
                ...prev.sandboxMetrics,
                isRunning: false,
              } : undefined,
            }));
          }
        },

        onError: (error) => {
          setState((prev) => ({
            ...prev,
            status: 'failed',
            error,
            sandboxMetrics: prev.sandboxMetrics ? {
              ...prev.sandboxMetrics,
              isRunning: false,
            } : undefined,
          }));
        },
      });

      // Return cleanup function
      return () => stream.close();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [options, updateStepStatus]);

  // Auto-execute when options change
  useEffect(() => {
    if (options && state.status === 'idle') {
      execute();
    }
  }, [options, execute, state.status]);

  // Update sandbox metrics timer every second while running
  useEffect(() => {
    if (!state.sandboxMetrics?.isRunning || !state.sandboxMetrics?.startTime) {
      return;
    }

    const interval = setInterval(() => {
      setState((prev) => {
        if (!prev.sandboxMetrics?.isRunning || !prev.sandboxMetrics?.startTime) {
          return prev;
        }

        const uptime = Math.floor((Date.now() - prev.sandboxMetrics.startTime.getTime()) / 1000);
        // E2B pricing: ~$0.12/min for standard sandbox
        const estimatedCost = (uptime / 60) * 0.12;

        return {
          ...prev,
          sandboxMetrics: {
            ...prev.sandboxMetrics,
            uptime,
            estimatedCost,
          },
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [state.sandboxMetrics?.isRunning, state.sandboxMetrics?.startTime]);

  return state;
}

export default useExecution;
