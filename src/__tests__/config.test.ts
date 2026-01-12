/**
 * Config Store Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Create unique test directory for each run
let TEST_HOME: string;

// Mock homedir before any imports that use it
vi.hoisted(() => {
  // This runs before any other code
});

vi.mock('os', async (importOriginal) => {
  const mod = await importOriginal<typeof import('os')>();
  return {
    ...mod,
    homedir: vi.fn(() => TEST_HOME),
  };
});

describe('Config Store', () => {
  // Dynamic imports to ensure mocks are applied
  let loadConfig: typeof import('../lib/config').loadConfig;
  let saveConfig: typeof import('../lib/config').saveConfig;
  let getConfigValue: typeof import('../lib/config').getConfigValue;
  let setConfigValue: typeof import('../lib/config').setConfigValue;
  let isAuthenticated: typeof import('../lib/config').isAuthenticated;
  let clearAuth: typeof import('../lib/config').clearAuth;
  let getApiBaseUrl: typeof import('../lib/config').getApiBaseUrl;

  beforeEach(async () => {
    // Create unique test directory
    TEST_HOME = join(tmpdir(), 'pr-agent-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    mkdirSync(TEST_HOME, { recursive: true });

    // Reset modules to pick up new TEST_HOME
    vi.resetModules();

    // Re-import config module
    const configModule = await import('../lib/config');
    loadConfig = configModule.loadConfig;
    saveConfig = configModule.saveConfig;
    getConfigValue = configModule.getConfigValue;
    setConfigValue = configModule.setConfigValue;
    isAuthenticated = configModule.isAuthenticated;
    clearAuth = configModule.clearAuth;
    getApiBaseUrl = configModule.getApiBaseUrl;
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(TEST_HOME, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('loadConfig', () => {
    it('should return empty object when no config exists', () => {
      const config = loadConfig();
      expect(config).toEqual({});
    });

    it('should load existing config from disk', () => {
      // Create config file manually
      const configDir = join(TEST_HOME, '.pr-agent');
      mkdirSync(configDir, { recursive: true });

      const testConfig = {
        githubToken: 'test-token',
        githubUsername: 'testuser',
      };

      writeFileSync(
        join(configDir, 'config.json'),
        JSON.stringify(testConfig),
        { mode: 0o600 }
      );

      const config = loadConfig();
      expect(config.githubToken).toBe('test-token');
      expect(config.githubUsername).toBe('testuser');
    });

    it('should handle malformed JSON gracefully', () => {
      const configDir = join(TEST_HOME, '.pr-agent');
      mkdirSync(configDir, { recursive: true });

      writeFileSync(
        join(configDir, 'config.json'),
        'not valid json {{{',
        { mode: 0o600 }
      );

      const config = loadConfig();
      expect(config).toEqual({});
    });
  });

  describe('saveConfig', () => {
    it('should create config directory if it does not exist', () => {
      saveConfig({ githubToken: 'test-token' });

      const configDir = join(TEST_HOME, '.pr-agent');
      expect(existsSync(configDir)).toBe(true);
    });

    it('should save config to disk', () => {
      const config = {
        githubToken: 'test-token',
        githubUsername: 'testuser',
        apiBaseUrl: 'https://custom.api.com',
      };
      saveConfig(config);

      const configFile = join(TEST_HOME, '.pr-agent', 'config.json');
      const savedContent = readFileSync(configFile, 'utf-8');
      const savedConfig = JSON.parse(savedContent);

      expect(savedConfig.githubToken).toBe('test-token');
      expect(savedConfig.githubUsername).toBe('testuser');
      expect(savedConfig.apiBaseUrl).toBe('https://custom.api.com');
    });
  });

  describe('getConfigValue / setConfigValue', () => {
    it('should get and set individual config values', () => {
      setConfigValue('githubToken', 'new-token');
      expect(getConfigValue('githubToken')).toBe('new-token');
    });

    it('should return undefined for non-existent keys', () => {
      expect(getConfigValue('githubToken')).toBeUndefined();
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token exists', () => {
      expect(isAuthenticated()).toBe(false);
    });

    it('should return true when token exists', () => {
      setConfigValue('githubToken', 'test-token');
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('clearAuth', () => {
    it('should remove authentication data', () => {
      setConfigValue('githubToken', 'test-token');
      setConfigValue('githubUsername', 'testuser');

      clearAuth();

      expect(getConfigValue('githubToken')).toBeUndefined();
      expect(getConfigValue('githubUsername')).toBeUndefined();
    });

    it('should preserve other config values', () => {
      setConfigValue('githubToken', 'test-token');
      setConfigValue('apiBaseUrl', 'https://custom.api.com');

      clearAuth();

      expect(getConfigValue('githubToken')).toBeUndefined();
      expect(getConfigValue('apiBaseUrl')).toBe('https://custom.api.com');
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return default URL when not configured', () => {
      expect(getApiBaseUrl()).toBe('https://api.useinvariant.com');
    });

    it('should return custom URL when configured', () => {
      setConfigValue('apiBaseUrl', 'https://custom.api.com');
      expect(getApiBaseUrl()).toBe('https://custom.api.com');
    });
  });
});
