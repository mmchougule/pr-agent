/**
 * Claude API Client for Plan Generation
 *
 * Direct Claude API access for fast planning - no sandbox needed.
 * Falls back to backend if no API key configured.
 */

import { getConfigValue, setConfigValue, getRateLimitSettings } from './config.js';
import { RateLimiterManager, RateLimitedExecutor } from './rate-limiter.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514'; // Fast and capable

// ============================================================================
// Rate Limiting Setup
// ============================================================================

// Global rate limiter manager for Claude API
const claudeRateLimiterManager = new RateLimiterManager();

/**
 * Initialize Claude rate limiters based on configuration
 */
function initializeClaudeRateLimiters(): void {
  const settings = getRateLimitSettings();

  if (!settings.enableRateLimiting) {
    return;
  }

  // Claude API requests rate limiter (per minute)
  claudeRateLimiterManager.register('claude-minute', {
    maxTokens: settings.claudeRequestsPerMinute,
    refillRate: settings.claudeRequestsPerMinute,
    refillInterval: 60000, // 1 minute
  });

  // Claude API requests rate limiter (per hour)
  claudeRateLimiterManager.register('claude-hour', {
    maxTokens: settings.claudeRequestsPerHour,
    refillRate: settings.claudeRequestsPerHour,
    refillInterval: 3600000, // 1 hour
  });
}

// Initialize on module load
initializeClaudeRateLimiters();

/**
 * Create a rate limited executor for Claude API calls with retry logic
 */
function createClaudeExecutor(): RateLimitedExecutor {
  const settings = getRateLimitSettings();

  return new RateLimitedExecutor(
    {
      maxTokens: settings.claudeRequestsPerMinute,
      refillRate: settings.claudeRequestsPerMinute,
      refillInterval: 60000,
    },
    {
      maxRetries: 3,
      baseDelay: 2000, // 2 seconds (Claude rate limits are stricter)
      maxDelay: 60000, // 60 seconds
    }
  );
}

const claudeExecutor = createClaudeExecutor();

/**
 * Check Claude API rate limits before making a request
 * @throws Error if rate limit exceeded
 */
function checkClaudeRateLimit(): void {
  const settings = getRateLimitSettings();

  if (!settings.enableRateLimiting) {
    return;
  }

  // Use a fixed key since Claude API is per-account
  const key = 'claude-api';

  // Check minute limit
  const minuteResult = claudeRateLimiterManager.consume('claude-minute', key);
  if (!minuteResult.allowed) {
    throw new Error(
      `Claude API rate limit exceeded: ${settings.claudeRequestsPerMinute} requests per minute. ` +
      `Retry after ${Math.ceil((minuteResult.retryAfter || 0) / 1000)} seconds.`
    );
  }

  // Check hour limit
  const hourResult = claudeRateLimiterManager.consume('claude-hour', key);
  if (!hourResult.allowed) {
    throw new Error(
      `Claude API rate limit exceeded: ${settings.claudeRequestsPerHour} requests per hour. ` +
      `Retry after ${Math.ceil((hourResult.retryAfter || 0) / 1000)} seconds.`
    );
  }
}

/**
 * Get current Claude API rate limit status
 */
export interface ClaudeRateLimitStatus {
  tokensRemainingMinute: number;
  tokensRemainingHour: number;
  rateLimitingEnabled: boolean;
}

export function getClaudeRateLimitStatus(): ClaudeRateLimitStatus {
  const settings = getRateLimitSettings();
  const key = 'claude-api';

  if (!settings.enableRateLimiting) {
    return {
      tokensRemainingMinute: Infinity,
      tokensRemainingHour: Infinity,
      rateLimitingEnabled: false,
    };
  }

  return {
    tokensRemainingMinute: claudeRateLimiterManager.getTokens('claude-minute', key),
    tokensRemainingHour: claudeRateLimiterManager.getTokens('claude-hour', key),
    rateLimitingEnabled: true,
  };
}

// ============================================================================
// Types
// ============================================================================

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Check if Claude API key is configured
 */
export function hasClaudeApiKey(): boolean {
  const key = getClaudeApiKey();
  return !!key && key.startsWith('sk-ant-');
}

/**
 * Get Claude API key from config or environment
 */
export function getClaudeApiKey(): string | undefined {
  // Check config first
  const configKey = getConfigValue('anthropicApiKey');
  if (configKey) return configKey;

  // Fall back to environment
  return process.env.ANTHROPIC_API_KEY;
}

/**
 * Set Claude API key in config
 */
export function setClaudeApiKey(key: string): void {
  setConfigValue('anthropicApiKey', key);
}

/**
 * Call Claude API directly for fast responses
 */
export async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  options: {
    maxTokens?: number;
    temperature?: number;
    onStream?: (text: string) => void;
  } = {}
): Promise<{ text: string; usage: ClaudeResponse['usage'] }> {
  const apiKey = getClaudeApiKey();

  if (!apiKey) {
    throw new Error(
      'No Anthropic API key configured.\n' +
      'Set it with: pr-agent config set anthropicApiKey sk-ant-...\n' +
      'Or set ANTHROPIC_API_KEY environment variable.'
    );
  }

  // Check rate limits before making request
  checkClaudeRateLimit();

  const { maxTokens = 4096, temperature = 0.3 } = options;

  // Execute with rate limiting and retry logic
  return await claudeExecutor.execute('claude-api', async () => {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } })) as {
        error?: { message?: string; type?: string };
      };

      if (response.status === 401) {
        throw new Error('Invalid Anthropic API key. Check your key and try again.');
      }

      if (response.status === 429) {
        throw new Error('429: Rate limited by Anthropic. Please wait and try again.');
      }

      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json() as ClaudeResponse;

    const text = data.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      text,
      usage: data.usage,
    };
  });
}

/**
 * Generate a plan using Claude API
 */
export async function generatePlanWithClaude(
  description: string,
  codeSnapshot: string,
  onProgress?: (msg: string) => void
): Promise<{
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: number;
    dependencies: string[];
    acceptanceCriteria: string[];
  }>;
  usage: ClaudeResponse['usage'];
}> {
  const systemPrompt = `You are a senior software engineer creating an implementation plan.
Your job is to analyze the codebase and break down the user's request into specific, actionable tasks.

IMPORTANT: Respond ONLY with a valid JSON array. No markdown, no explanation, just JSON.`;

  const userPrompt = `## Request
${description}

## Codebase Structure
${codeSnapshot.substring(0, 8000)} ${codeSnapshot.length > 8000 ? '... (truncated)' : ''}

## Instructions
Create 3-7 specific, actionable tasks to implement this request.
Each task should be completable by an AI coding agent in one session (30-60 minutes).

Respond with a JSON array in this exact format:
[
  {
    "id": "US-001",
    "title": "Short descriptive title (max 60 chars)",
    "description": "Detailed description of what to implement. Include specific files to modify.",
    "priority": 1,
    "dependencies": [],
    "acceptanceCriteria": ["Specific criterion 1", "Specific criterion 2"]
  }
]

Requirements:
- Keep tasks focused and specific
- Include file paths when possible
- Set dependencies correctly (task can only start when deps are done)
- Make acceptance criteria testable`;

  onProgress?.('Analyzing request...');

  const response = await callClaude(systemPrompt, [
    { role: 'user', content: userPrompt },
  ], {
    maxTokens: 4096,
    temperature: 0.3,
  });

  onProgress?.('Parsing response...');

  // Extract JSON from response (handle markdown code blocks)
  let jsonText = response.text.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const tasks = JSON.parse(jsonText);

    if (!Array.isArray(tasks)) {
      throw new Error('Response is not an array');
    }

    // Validate and normalize tasks
    const normalizedTasks = tasks.map((task, index) => ({
      id: task.id || `US-${String(index + 1).padStart(3, '0')}`,
      title: String(task.title || 'Untitled task').substring(0, 100),
      description: String(task.description || ''),
      priority: Number(task.priority) || index + 1,
      dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
      acceptanceCriteria: Array.isArray(task.acceptanceCriteria)
        ? task.acceptanceCriteria.map(String)
        : [],
    }));

    return {
      tasks: normalizedTasks,
      usage: response.usage,
    };
  } catch (parseError) {
    // Try to extract JSON from response
    const jsonMatch = response.text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        const tasks = JSON.parse(jsonMatch[0]);
        return {
          tasks: tasks.map((task: any, index: number) => ({
            id: task.id || `US-${String(index + 1).padStart(3, '0')}`,
            title: String(task.title || 'Untitled task').substring(0, 100),
            description: String(task.description || ''),
            priority: Number(task.priority) || index + 1,
            dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
            acceptanceCriteria: Array.isArray(task.acceptanceCriteria)
              ? task.acceptanceCriteria.map(String)
              : [],
          })),
          usage: response.usage,
        };
      } catch {
        throw new Error('Failed to parse Claude response as JSON');
      }
    }
    throw new Error(`Invalid response format: ${parseError}`);
  }
}
