/**
 * Configuration store for PR-Agent CLI
 * Stores credentials and settings in ~/.pr-agent/config.json
 */

import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const CONFIG_DIR = join(homedir(), '.pr-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface Config {
  // GitHub authentication
  githubToken?: string;
  githubUsername?: string;

  // API endpoint (for self-hosted)
  apiBaseUrl?: string;

  // Preferences
  defaultBranch?: string;
  sandboxProvider?: 'e2b' | 'daytona';
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
