/**
 * API Client for PR-Agent CLI
 * Handles HTTP requests and SSE streaming to the Invariant API
 */

import EventSource from 'eventsource';
import { getApiBaseUrl, getConfigValue } from './config.js';

// ============================================================================
// Types
// ============================================================================

export type SkillName = 'test-writer' | 'code-reviewer' | 'type-fixer' | 'linter' | 'security-scanner' | 'docs-generator';

export interface ExecuteRequest {
  repo: string;
  task: string;
  branch?: string;
  skill?: SkillName;
  useSDK?: boolean;        // Use Claude Agent SDK instead of CLI
  githubToken?: string;
  clientFingerprint?: string;
}

export interface ExecuteResponse {
  jobId: string;
  streamUrl: string;
}

export interface JobResponse {
  job: {
    id: string;
    status: string;
    repoFullName: string;
    branch: string;
    task: string;
    fixBranch?: string;
    prNumber?: number;
    prUrl?: string;
    filesChanged: number;
    errorMessage?: string;
    createdAt: string;
    completedAt?: string;
  };
}

export type StreamEventType = 'status' | 'agent' | 'output' | 'result' | 'error';

export interface ProofBlock {
  durationSeconds: number;
  sandboxCostUsd: number;
  filesChanged: number;
  checksFixed: string[];
  testsRun?: string;
  testsPassed?: boolean;
  prUrl?: string;
  prNumber?: number;
  fixBranch: string;
  commitSha?: string;
  summary?: string;             // LLM-generated summary of the fix
}

export interface StreamEvent {
  type: StreamEventType;
  timestamp: string;
  jobId: string;
  status?: string;
  phase?: 'sandbox' | 'clone' | 'agent' | 'push' | 'pr';
  message?: string;
  success?: boolean;
  result?: {
    success: boolean;
    fixBranch?: string;
    prNumber?: number;
    prUrl?: string;
    commitSha?: string;
    filesChanged: number;
    additions?: number;       // Lines added
    deletions?: number;       // Lines deleted
    sandboxId?: string;       // Sandbox identifier
    sandboxDurationSeconds: number;
    estimatedCostUsd: number;
    llmInputTokens?: number;
    llmOutputTokens?: number;
    llmModel?: string;
    proof?: ProofBlock;       // Marketing-ready proof block with summary
    error?: string;
  };
  error?: string;
}

export interface AgentEvent {
  eventType: 'tool_call' | 'thinking' | 'message' | 'tool_result';
  tool?: string;
  display?: string;
  content?: string;
}

export interface StreamCallbacks {
  onStatus?: (message: string, phase?: string, sandboxId?: string) => void;
  onAgent?: (event: AgentEvent) => void;
  onProgress?: (percent: number) => void;
  onResult?: (result: StreamEvent['result']) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// API Client
// ============================================================================

/**
 * Execute a PR agent task
 */
export async function executeTask(request: ExecuteRequest): Promise<ExecuteResponse> {
  const baseUrl = getApiBaseUrl();
  const githubToken = request.githubToken || getConfigValue('githubToken');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/pr-agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        repo: request.repo,
        task: request.task,
        branch: request.branch,
        skill: request.skill,
        useSDK: request.useSDK,
        githubToken,
        clientFingerprint: request.clientFingerprint || getClientFingerprint(),
      }),
    });
  } catch (err: any) {
    // Network error - backend not reachable
    throw new Error(`Cannot connect to API at ${baseUrl}. Is the backend running? (${err.message})`);
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string; message?: string };
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return (await response.json()) as ExecuteResponse;
}

/**
 * Get job status
 */
export async function getJob(jobId: string): Promise<JobResponse> {
  const baseUrl = getApiBaseUrl();

  const response = await fetch(`${baseUrl}/api/pr-agent/${jobId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string; message?: string };
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return (await response.json()) as JobResponse;
}

/**
 * Stream job progress via SSE
 */
export function streamJob(
  streamUrl: string,
  callbacks: StreamCallbacks
): { close: () => void } {
  const baseUrl = getApiBaseUrl();
  const fullUrl = `${baseUrl}${streamUrl}`;

  const eventSource = new EventSource(fullUrl);

  eventSource.onmessage = (event) => {
    try {
      // Skip heartbeat events
      if (event.data === ':heartbeat') {
        return;
      }

      const data: StreamEvent = JSON.parse(event.data);

      switch (data.type) {
        case 'status':
          // Extract sandboxId from status events if available
          callbacks.onStatus?.(data.message || '', data.phase, (data as any).sandboxId);
          break;

        case 'agent':
          // Handle agent events (tool calls, thinking, messages)
          if (callbacks.onAgent && (data as any).eventType) {
            callbacks.onAgent({
              eventType: (data as any).eventType,
              tool: (data as any).tool,
              display: (data as any).display,
              content: (data as any).output || (data as any).content,
            });
          }
          break;

        case 'result':
          callbacks.onResult?.(data.result);
          eventSource.close();
          break;

        case 'error':
          callbacks.onError?.(data.error || 'Unknown error');
          eventSource.close();
          break;
      }
    } catch {
      // Ignore parse errors (likely heartbeat)
    }
  };

  eventSource.onerror = () => {
    callbacks.onError?.('Connection lost');
    eventSource.close();
  };

  return {
    close: () => eventSource.close(),
  };
}

export interface JobSummary {
  id: string;
  status: string;
  repoFullName: string;
  task: string;
  sandboxId?: string;
  sandboxProvider?: string;
  prUrl?: string;
  filesChanged: number;
  githubUsername?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ListJobsResponse {
  jobs: JobSummary[];
  count: number;
}

/**
 * List recent jobs for this client
 * Uses GitHub username if authenticated, falls back to fingerprint/IP
 */
export async function listJobs(options?: { status?: string; limit?: number }): Promise<ListJobsResponse> {
  const baseUrl = getApiBaseUrl();
  const fingerprint = getClientFingerprint();
  const githubUsername = getConfigValue('githubUsername');

  const params = new URLSearchParams();

  // Prefer GitHub username for filtering (most reliable for authenticated users)
  if (githubUsername) {
    params.set('github_username', githubUsername);
  } else {
    params.set('fingerprint', fingerprint);
  }

  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());

  const response = await fetch(`${baseUrl}/api/pr-agent/jobs?${params.toString()}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: 'Unknown error' }))) as { error?: string; message?: string };
    throw new Error(error.error || error.message || `HTTP ${response.status}`);
  }

  return (await response.json()) as ListJobsResponse;
}

/**
 * Generate a simple client fingerprint for rate limiting
 */
export function getClientFingerprint(): string {
  const os = process.platform;
  const arch = process.arch;
  const nodeVersion = process.version;
  const home = process.env.HOME || process.env.USERPROFILE || '';

  // Create a simple hash from system info
  const data = `${os}-${arch}-${nodeVersion}-${home}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
