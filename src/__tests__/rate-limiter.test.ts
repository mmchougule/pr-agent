/**
 * Rate Limiter Tests
 * Tests for TokenBucketRateLimiter and RateLimiterManager
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TokenBucketRateLimiter,
  RateLimiterManager,
  RateLimitedExecutor,
} from '../lib/rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Token Consumption', () => {
    it('should allow requests when tokens are available', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      const result = limiter.consume('test-key', 1);
      expect(result.allowed).toBe(true);
      expect(result.tokensRemaining).toBeGreaterThanOrEqual(9);
    });

    it('should deny requests when tokens are exhausted', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 3,
        refillRate: 1,
        refillInterval: 1000,
      });

      // Consume all tokens
      limiter.consume('test-key', 1);
      limiter.consume('test-key', 1);
      limiter.consume('test-key', 1);

      const result = limiter.consume('test-key', 1);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should consume multiple tokens at once', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      const result = limiter.consume('test-key', 5);
      expect(result.allowed).toBe(true);
      expect(result.tokensRemaining).toBeGreaterThanOrEqual(5);
    });

    it('should deny requests when requesting more tokens than available', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      limiter.consume('test-key', 8);
      const result = limiter.consume('test-key', 5);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Token Refill', () => {
    it('should refill tokens after interval', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      // Consume all tokens
      limiter.consume('test-key', 10);
      expect(limiter.getTokens('test-key')).toBe(0);

      // Wait for refill
      vi.advanceTimersByTime(1000);

      expect(limiter.getTokens('test-key')).toBe(5);
    });

    it('should refill tokens multiple times', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 2,
        refillInterval: 1000,
      });

      // Consume all tokens
      limiter.consume('test-key', 10);

      // Wait for 3 refills
      vi.advanceTimersByTime(3000);

      expect(limiter.getTokens('test-key')).toBe(6); // 0 + 2 + 2 + 2 = 6
    });

    it('should not exceed max tokens when refilling', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      limiter.consume('test-key', 2);

      // Wait for many refills
      vi.advanceTimersByTime(10000);

      expect(limiter.getTokens('test-key')).toBe(10); // Capped at maxTokens
    });
  });

  describe('Multiple Keys', () => {
    it('should track tokens separately for different keys', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      limiter.consume('key1', 5);
      limiter.consume('key2', 3);

      expect(limiter.getTokens('key1')).toBe(5);
      expect(limiter.getTokens('key2')).toBe(7);
    });
  });

  describe('Reset', () => {
    it('should reset tokens for a specific key', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      limiter.consume('test-key', 5);
      limiter.reset('test-key');

      expect(limiter.getTokens('test-key')).toBe(10);
    });

    it('should reset all tokens', () => {
      const limiter = new TokenBucketRateLimiter({
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      });

      limiter.consume('key1', 5);
      limiter.consume('key2', 3);
      limiter.resetAll();

      expect(limiter.getTokens('key1')).toBe(10);
      expect(limiter.getTokens('key2')).toBe(10);
    });
  });
});

describe('RateLimiterManager', () => {
  it('should register and retrieve rate limiters', () => {
    const manager = new RateLimiterManager();

    manager.register('test-limiter', {
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    const limiter = manager.get('test-limiter');
    expect(limiter).toBeDefined();
  });

  it('should consume tokens from registered limiter', () => {
    const manager = new RateLimiterManager();

    manager.register('test-limiter', {
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    const result = manager.consume('test-limiter', 'test-key', 3);
    expect(result.allowed).toBe(true);
    expect(result.tokensRemaining).toBeGreaterThanOrEqual(7);
  });

  it('should throw error for non-existent limiter', () => {
    const manager = new RateLimiterManager();

    expect(() => {
      manager.consume('non-existent', 'test-key', 1);
    }).toThrow('Rate limiter not found: non-existent');
  });

  it('should get token count from registered limiter', () => {
    const manager = new RateLimiterManager();

    manager.register('test-limiter', {
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    manager.consume('test-limiter', 'test-key', 3);
    const tokens = manager.getTokens('test-limiter', 'test-key');

    expect(tokens).toBeGreaterThanOrEqual(7);
  });

  it('should reset specific limiter', () => {
    const manager = new RateLimiterManager();

    manager.register('test-limiter', {
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    manager.consume('test-limiter', 'test-key', 5);
    manager.reset('test-limiter', 'test-key');

    expect(manager.getTokens('test-limiter', 'test-key')).toBe(10);
  });

  it('should reset all limiters', () => {
    const manager = new RateLimiterManager();

    manager.register('limiter1', {
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    manager.register('limiter2', {
      maxTokens: 20,
      refillRate: 10,
      refillInterval: 1000,
    });

    manager.consume('limiter1', 'key1', 5);
    manager.consume('limiter2', 'key2', 10);

    manager.resetAll();

    expect(manager.getTokens('limiter1', 'key1')).toBe(10);
    expect(manager.getTokens('limiter2', 'key2')).toBe(20);
  });
});

describe('RateLimitedExecutor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should execute function when rate limit allows', async () => {
    const executor = new RateLimitedExecutor(
      {
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      },
      {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
      }
    );

    const fn = vi.fn().mockResolvedValue('success');
    const result = await executor.execute('test-key', fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on rate limit exceeded', async () => {
    const executor = new RateLimitedExecutor(
      {
        maxTokens: 2,
        refillRate: 1,
        refillInterval: 1000,
      },
      {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
      }
    );

    const fn = vi.fn().mockResolvedValue('success');

    // Consume all tokens
    executor.execute('test-key', fn);
    executor.execute('test-key', fn);

    // This should wait and retry
    const promise = executor.execute('test-key', fn);

    // Advance time to allow refill
    await vi.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe('success');
  });

  it('should throw error after max retries', async () => {
    const executor = new RateLimitedExecutor(
      {
        maxTokens: 1,
        refillRate: 0, // No refill
        refillInterval: 1000,
      },
      {
        maxRetries: 1, // Only 1 retry
        baseDelay: 10,
        maxDelay: 100,
      }
    );

    const fn = vi.fn().mockResolvedValue('success');

    // Consume the only token
    await executor.execute('test-key', fn);

    // Next call should fail after retry
    const promise = executor.execute('test-key', fn);

    // Advance timers to allow retries
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('Rate limit exceeded');
  });

  it('should handle function errors', async () => {
    const executor = new RateLimitedExecutor(
      {
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      },
      {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
      }
    );

    const fn = vi.fn().mockRejectedValue(new Error('Function error'));

    await expect(executor.execute('test-key', fn)).rejects.toThrow('Function error');
  });

  it('should retry on 429 errors', async () => {
    const executor = new RateLimitedExecutor(
      {
        maxTokens: 10,
        refillRate: 5,
        refillInterval: 1000,
      },
      {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
      }
    );

    let attemptCount = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attemptCount++;
      if (attemptCount === 1) {
        throw new Error('429: Rate limited');
      }
      return 'success';
    });

    const promise = executor.execute('test-key', fn);

    // Advance time for retry
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('Concurrent Requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle concurrent requests correctly', () => {
    const limiter = new TokenBucketRateLimiter({
      maxTokens: 10,
      refillRate: 5,
      refillInterval: 1000,
    });

    // Simulate concurrent requests
    const results = [];
    for (let i = 0; i < 15; i++) {
      results.push(limiter.consume('test-key', 1));
    }

    // First 10 should be allowed
    const allowedCount = results.filter(r => r.allowed).length;
    const deniedCount = results.filter(r => !r.allowed).length;

    expect(allowedCount).toBe(10);
    expect(deniedCount).toBe(5);
  });
});
