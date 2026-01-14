/**
 * Commands Index
 * Import all command handlers to register them
 */

// Import types and utilities
export {
  type CommandResult,
  type CommandContext,
  type CommandHandler,
  type CommandDefinition,
  COMMANDS,
  registerCommand,
  getCommand,
  getAllCommands,
  parseCommand,
} from './types.js';

// Import all commands to trigger registration
import './help.js';
import './plan.js';
import './ship.js';
import './status.js';
import './connect.js';
import './watch.js';
import './pause.js';
import './logs.js';
import './exit.js';
import './diff.js';
import './pr.js';
import './config.js';
import './reset.js';
import './retry.js';
import './done.js';
import './history.js';
import './jobs.js';
