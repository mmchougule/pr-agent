/**
 * Rate Limit Configuration Tests
 * Tests for rate limit settings in config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  loadConfig,
  saveConfig,
  getRateLimitSettings,
  setRateLimitSettings,
  DEFAULT_RATE_LIMITS,
} from '../lib/config.js';

const CONFIG_DIR = join(homedir(), '.pr-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const TEST_BACKUP = CONFIG_FILE + '.test-backup';

describe('Rate Limit Configuration', () => {
  beforeEach(() => {
    // Backup existing config if present
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }
  });

  afterEach(() => {
    // Clean up test config
    if (existsSync(CONFIG_FILE)) {
      unlinkSync(CONFIG_FILE);
    }
  });

  describe('Default Rate Limits', () => {
    it('should have default API rate limits', () => {
      expect(DEFAULT_RATE_LIMITS.apiRequestsPerMinute).toBe(60);
      expect(DEFAULT_RATE_LIMITS.apiRequestsPerHour).toBe(1000);
    });

    it('should have default Claude rate limits', () => {
      expect(DEFAULT_RATE_LIMITS.claudeRequestsPerMinute).toBe(50);
      expect(DEFAULT_RATE_LIMITS.claudeRequestsPerHour).toBe(1000);
    });

    it('should have default command rate limits', () => {
      expect(DEFAULT_RATE_LIMITS.commandsPerMinute).toBe(30);
    });

    it('should have rate limiting enabled by default', () => {
      expect(DEFAULT_RATE_LIMITS.enableRateLimiting).toBe(true);
    });
  });

  describe('getRateLimitSettings', () => {
    it('should return default settings when no config exists', () => {
      const settings = getRateLimitSettings();

      expect(settings.apiRequestsPerMinute).toBe(DEFAULT_RATE_LIMITS.apiRequestsPerMinute);
      expect(settings.claudeRequestsPerMinute).toBe(DEFAULT_RATE_LIMITS.claudeRequestsPerMinute);
      expect(settings.commandsPerMinute).toBe(DEFAULT_RATE_LIMITS.commandsPerMinute);
      expect(settings.enableRateLimiting).toBe(true);
    });

    it('should merge custom settings with defaults', () => {
      saveConfig({
        rateLimits: {
          apiRequestsPerMinute: 100,
          // Other settings will use defaults
        },
      });

      const settings = getRateLimitSettings();

      expect(settings.apiRequestsPerMinute).toBe(100);
      expect(settings.claudeRequestsPerMinute).toBe(DEFAULT_RATE_LIMITS.claudeRequestsPerMinute);
    });

    it('should allow disabling rate limiting', () => {
      saveConfig({
        rateLimits: {
          enableRateLimiting: false,
        },
      });

      const settings = getRateLimitSettings();
      expect(settings.enableRateLimiting).toBe(false);
    });
  });

  describe('setRateLimitSettings', () => {
    it('should save custom rate limit settings', () => {
      setRateLimitSettings({
        apiRequestsPerMinute: 120,
        claudeRequestsPerMinute: 75,
      });

      const settings = getRateLimitSettings();
      expect(settings.apiRequestsPerMinute).toBe(120);
      expect(settings.claudeRequestsPerMinute).toBe(75);
    });

    it('should preserve other config values', () => {
      saveConfig({
        githubToken: 'test-token',
        rateLimits: {
          apiRequestsPerMinute: 60,
        },
      });

      setRateLimitSettings({
        claudeRequestsPerMinute: 100,
      });

      const config = loadConfig();
      expect(config.githubToken).toBe('test-token');
      expect(config.rateLimits?.apiRequestsPerMinute).toBe(60);
      expect(config.rateLimits?.claudeRequestsPerMinute).toBe(100);
    });

    it('should allow partial updates', () => {
      setRateLimitSettings({
        apiRequestsPerMinute: 80,
      });

      const settings = getRateLimitSettings();
      expect(settings.apiRequestsPerMinute).toBe(80);
      expect(settings.claudeRequestsPerMinute).toBe(DEFAULT_RATE_LIMITS.claudeRequestsPerMinute);
    });
  });

  describe('Rate Limit Settings Validation', () => {
    it('should accept valid minute limits', () => {
      setRateLimitSettings({
        apiRequestsPerMinute: 10,
        claudeRequestsPerMinute: 5,
        commandsPerMinute: 20,
      });

      const settings = getRateLimitSettings();
      expect(settings.apiRequestsPerMinute).toBe(10);
      expect(settings.claudeRequestsPerMinute).toBe(5);
      expect(settings.commandsPerMinute).toBe(20);
    });

    it('should accept valid hour limits', () => {
      setRateLimitSettings({
        apiRequestsPerHour: 2000,
        claudeRequestsPerHour: 1500,
      });

      const settings = getRateLimitSettings();
      expect(settings.apiRequestsPerHour).toBe(2000);
      expect(settings.claudeRequestsPerHour).toBe(1500);
    });
  });
});
