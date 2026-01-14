/**
 * Config command - Manage CLI configuration
 */

import { registerCommand, type CommandResult, type CommandContext } from './types.js';
import { loadConfig, setConfigValue, type Config } from '../lib/config.js';

registerCommand({
  name: 'config',
  aliases: ['cfg'],
  description: 'Manage CLI configuration',
  usage: '/config [show|set <key> <value>]',
  handler: async (args: string[], ctx: CommandContext): Promise<CommandResult> => {
    const subcommand = args[0]?.toLowerCase();

    // /config show - Show current config
    if (subcommand === 'show' || args.length === 0) {
      const config = loadConfig();

      ctx.print('\nConfiguration:');
      ctx.print('');

      if (config.githubToken) {
        ctx.print(`  githubToken: ${config.githubToken.substring(0, 10)}...`);
      }
      if (config.githubUsername) {
        ctx.print(`  githubUsername: ${config.githubUsername}`);
      }
      if (config.anthropicApiKey) {
        ctx.print(`  anthropicApiKey: ${config.anthropicApiKey.substring(0, 15)}...`);
      } else {
        // Check env
        const envKey = process.env.ANTHROPIC_API_KEY;
        if (envKey) {
          ctx.print(`  anthropicApiKey: (from env) ${envKey.substring(0, 15)}...`);
        } else {
          ctx.print('  anthropicApiKey: NOT SET');
          ctx.print('');
          ctx.print('  Set with: /config set anthropicApiKey sk-ant-...');
          ctx.print('  Or: export ANTHROPIC_API_KEY=sk-ant-...');
        }
      }
      if (config.apiBaseUrl) {
        ctx.print(`  apiBaseUrl: ${config.apiBaseUrl}`);
      }
      if (config.defaultBranch) {
        ctx.print(`  defaultBranch: ${config.defaultBranch}`);
      }

      ctx.print('');
      ctx.print('Config file: ~/.pr-agent/config.json');

      return { success: true };
    }

    // /config set <key> <value>
    if (subcommand === 'set') {
      const key = args[1] as keyof Config;
      const value = args.slice(2).join(' ');

      if (!key || !value) {
        return { success: false, error: 'Usage: /config set <key> <value>' };
      }

      const validKeys: (keyof Config)[] = [
        'githubToken',
        'githubUsername',
        'anthropicApiKey',
        'apiBaseUrl',
        'defaultBranch',
        'sandboxProvider',
      ];

      if (!validKeys.includes(key)) {
        return { success: false, error: `Invalid key. Valid keys: ${validKeys.join(', ')}` };
      }

      setConfigValue(key, value);
      ctx.print(`Set ${key} = ${key.includes('Token') || key.includes('Key') ? value.substring(0, 10) + '...' : value}`);

      return { success: true };
    }

    return { success: false, error: 'Unknown subcommand. Use /config show or /config set <key> <value>' };
  },
});
