/**
 * API Client Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config
vi.mock('../lib/config', () => ({
  getApiBaseUrl: () => 'https://api.test.com',
  getConfigValue: vi.fn(),
  getRateLimitSettings: () => ({
    apiRequestsPerMinute: 60,
    apiRequestsPerHour: 1000,
    claudeRequestsPerMinute: 50,
    claudeRequestsPerHour: 1000,
    commandsPerMinute: 30,
    enableRateLimiting: false, // Disabled for most tests
  }),
}));

// Import after mocking
import { executeTask, getJob } from '../lib/api-client';

describe('API Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('executeTask', () => {
    it('should make POST request with correct body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          jobId: 'test-job-123',
          streamUrl: '/api/pr-agent/test-job-123/stream',
        }),
      });

      const result = await executeTask({
        repo: 'test/repo',
        task: 'add unit tests',
        branch: 'main',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/pr-agent/execute',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.repo).toBe('test/repo');
      expect(callBody.task).toBe('add unit tests');
      expect(callBody.branch).toBe('main');

      expect(result.jobId).toBe('test-job-123');
      expect(result.streamUrl).toContain('/stream');
    });

    it('should throw error on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid repo format' }),
      });

      await expect(
        executeTask({
          repo: 'invalid',
          task: 'test',
        })
      ).rejects.toThrow('Invalid repo format');
    });

    it('should throw error on rate limit', async () => {
      // Mock multiple responses for the retry logic
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: 'Rate limit exceeded',
          message: 'Too many requests',
        }),
      });

      await expect(
        executeTask({
          repo: 'test/repo',
          task: 'test',
        })
      ).rejects.toThrow('429');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        executeTask({
          repo: 'test/repo',
          task: 'test',
        })
      ).rejects.toThrow('Network error');
    });

    it('should include GitHub token when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          jobId: 'test-job-123',
          streamUrl: '/api/pr-agent/test-job-123/stream',
        }),
      });

      await executeTask({
        repo: 'test/repo',
        task: 'test',
        githubToken: 'ghp_secret123',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.githubToken).toBe('ghp_secret123');
    });
  });

  describe('getJob', () => {
    it('should fetch job details', async () => {
      const mockJob = {
        id: 'test-job-123',
        status: 'success',
        repoFullName: 'test/repo',
        prUrl: 'https://github.com/test/repo/pull/123',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ job: mockJob }),
      });

      const result = await getJob('test-job-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.test.com/api/pr-agent/test-job-123',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );

      expect(result.job.id).toBe('test-job-123');
      expect(result.job.status).toBe('success');
    });

    it('should throw error for non-existent job', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Job not found' }),
      });

      await expect(getJob('non-existent')).rejects.toThrow('Job not found');
    });
  });
});

describe('API Client - Client Fingerprint', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('should generate consistent fingerprint for same environment', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        jobId: 'test-job-123',
        streamUrl: '/api/pr-agent/test-job-123/stream',
      }),
    });

    await executeTask({ repo: 'test/repo', task: 'test1' });
    await executeTask({ repo: 'test/repo', task: 'test2' });

    // Both calls should have been made
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const body1 = JSON.parse(mockFetch.mock.calls[0][1].body);
    const body2 = JSON.parse(mockFetch.mock.calls[1][1].body);

    // Fingerprints should be the same for same environment
    expect(body1.clientFingerprint).toBe(body2.clientFingerprint);
  });
});

describe('API Client - Rate Limiting Integration', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle server 429 responses with retry', async () => {
    // First call returns 429, second succeeds
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({
          error: 'Rate limit exceeded',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          jobId: 'test-job-123',
          streamUrl: '/api/pr-agent/test-job-123/stream',
        }),
      });

    // Should eventually succeed after retry
    const promise = executeTask({
      repo: 'test/repo',
      task: 'test',
    });

    // Advance timers to allow retry
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result.jobId).toBe('test-job-123');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should include rate limit error in message for 429 status', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({
        error: 'Rate limit exceeded',
      }),
    });

    const promise = executeTask({
      repo: 'test/repo',
      task: 'test',
    });

    // Advance timers to allow retries
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow('429');
  });
});
