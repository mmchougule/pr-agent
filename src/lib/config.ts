/**
 * Configuration store for PR-Agent CLI
 * Stores credentials and settings in ~/.pr-agent/config.json
 */

import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.pr-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface RateLimitSettings {
  // API Client rate limits (requests per minute)
  apiRequestsPerMinute?: number;
  apiRequestsPerHour?: number;

  // Claude API rate limits
  claudeRequestsPerMinute?: number;
  claudeRequestsPerHour?: number;

  // Command execution rate limits
  commandsPerMinute?: number;

  // Enable/disable rate limiting
  enableRateLimiting?: boolean;
}

export interface Config {
  // GitHub authentication
  githubToken?: string;
  githubUsername?: string;

  // Anthropic API (for plan generation)
  anthropicApiKey?: string;

  // API endpoint (for self-hosted)
  apiBaseUrl?: string;

  // Preferences
  defaultBranch?: string;
  sandboxProvider?: 'e2b' | 'daytona';

  // Rate limiting configuration
  rateLimits?: RateLimitSettings;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Load configuration from disk
 */
export function loadConfig(): Config {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content) as Config;
  } catch {
    return {};
  }
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: Config): void {
  ensureConfigDir();

  const content = JSON.stringify(config, null, 2);
  writeFileSync(CONFIG_FILE, content, { mode: 0o600 }); // Secure file permissions
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof Config>(key: K): Config[K] | undefined {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 */
export function setConfigValue<K extends keyof Config>(key: K, value: Config[K]): void {
  const config = loadConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const config = loadConfig();
  return !!config.githubToken;
}

/**
 * Clear all authentication
 */
export function clearAuth(): void {
  const config = loadConfig();
  delete config.githubToken;
  delete config.githubUsername;
  saveConfig(config);
}

/**
 * Get the API base URL
 * Priority: env var > config file > default
 */
export function getApiBaseUrl(): string {
  // Check environment variable first (for local dev)
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }
  // Then check config file
  const config = loadConfig();
  return config.apiBaseUrl || 'https://api.useinvariant.com';
}

/**
 * Default rate limit settings
 */
export const DEFAULT_RATE_LIMITS: Required<RateLimitSettings> = {
  // API Client: 60 requests per minute, 1000 per hour
  apiRequestsPerMinute: 60,
  apiRequestsPerHour: 1000,

  // Claude API: 50 requests per minute (Anthropic tier limits)
  claudeRequestsPerMinute: 50,
  claudeRequestsPerHour: 1000,

  // Commands: 30 per minute (prevent spam)
  commandsPerMinute: 30,

  // Rate limiting enabled by default
  enableRateLimiting: true,
};

/**
 * Get rate limit settings with defaults
 */
export function getRateLimitSettings(): Required<RateLimitSettings> {
  const config = loadConfig();
  return {
    ...DEFAULT_RATE_LIMITS,
    ...config.rateLimits,
  };
}

/**
 * Update rate limit settings
 */
export function setRateLimitSettings(settings: Partial<RateLimitSettings>): void {
  const config = loadConfig();
  config.rateLimits = {
    ...config.rateLimits,
    ...settings,
  };
  saveConfig(config);
}
