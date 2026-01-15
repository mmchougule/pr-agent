/**
 * Types for PR-Agent CLI commands
 */

import type { SessionState } from '../lib/session.js';
import { getRateLimitSettings } from '../lib/config.js';
import { TokenBucketRateLimiter } from '../lib/rate-limiter.js';

/**
 * Result of executing a command
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
  /** If true, the REPL should exit */
  exit?: boolean;
  /** If true, switch to a different mode (e.g., run mode for /ship) */
  switchMode?: 'run' | 'watch' | 'plan';
  /** Data to pass to the switched mode */
  modeData?: Record<string, any>;
}

/**
 * Context available to all commands
 */
export interface CommandContext {
  /** Current session state */
  session: SessionState | null;
  /** Working directory */
  cwd: string;
  /** Print a message to the user */
  print: (message: string) => void;
  /** Print an error to the user */
  printError: (message: string) => void;
  /** Prompt the user for input */
  prompt?: (question: string) => Promise<string>;
  /** Current repo (if connected) */
  repo?: string;
}

/**
 * Command handler function
 */
export type CommandHandler = (
  args: string[],
  context: CommandContext
) => Promise<CommandResult> | CommandResult;

/**
 * Command definition
 */
export interface CommandDefinition {
  /** Command name (without /) */
  name: string;
  /** Aliases for the command */
  aliases?: string[];
  /** Short description */
  description: string;
  /** Usage example */
  usage?: string;
  /** Handler function */
  handler: CommandHandler;
}

/**
 * All available commands
 */
export const COMMANDS: Record<string, CommandDefinition> = {};

// ============================================================================
// Command Rate Limiting
// ============================================================================

/**
 * Rate limiter for command execution
 */
let commandRateLimiter: TokenBucketRateLimiter | null = null;

/**
 * Initialize command rate limiter based on configuration
 */
function initializeCommandRateLimiter(): void {
  const settings = getRateLimitSettings();

  if (!settings.enableRateLimiting) {
    commandRateLimiter = null;
    return;
  }

  commandRateLimiter = new TokenBucketRateLimiter({
    maxTokens: settings.commandsPerMinute,
    refillRate: settings.commandsPerMinute,
    refillInterval: 60000, // 1 minute
  });
}

// Initialize on module load
initializeCommandRateLimiter();

/**
 * Check if a command can be executed (rate limit)
 * @param commandName - Name of the command being executed
 * @returns true if allowed, false if rate limited
 */
export function checkCommandRateLimit(commandName: string): { allowed: boolean; retryAfter?: number } {
  const settings = getRateLimitSettings();

  if (!settings.enableRateLimiting || !commandRateLimiter) {
    return { allowed: true };
  }

  const result = commandRateLimiter.consume(commandName);
  return {
    allowed: result.allowed,
    retryAfter: result.retryAfter,
  };
}

/**
 * Get current command rate limit status
 */
export function getCommandRateLimitStatus(): { tokensRemaining: number; enabled: boolean } {
  const settings = getRateLimitSettings();

  if (!settings.enableRateLimiting || !commandRateLimiter) {
    return { tokensRemaining: Infinity, enabled: false };
  }

  // Use a generic key for overall command tracking
  return {
    tokensRemaining: commandRateLimiter.getTokens('commands'),
    enabled: true,
  };
}

/**
 * Register a command
 */
export function registerCommand(command: CommandDefinition): void {
  COMMANDS[command.name] = command;

  // Register aliases
  if (command.aliases) {
    for (const alias of command.aliases) {
      COMMANDS[alias] = command;
    }
  }
}

/**
 * Get a command by name
 */
export function getCommand(name: string): CommandDefinition | null {
  return COMMANDS[name] || null;
}

/**
 * Get all unique commands (excludes aliases)
 */
export function getAllCommands(): CommandDefinition[] {
  const seen = new Set<string>();
  const commands: CommandDefinition[] = [];

  for (const cmd of Object.values(COMMANDS)) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      commands.push(cmd);
    }
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Parse a command string into name and args
 */
export function parseCommand(input: string): { name: string; args: string[] } | null {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    return null;
  }

  const parts = trimmed.substring(1).split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);

  return { name, args };
}
