/**
 * Rate Limiter Implementation using Token Bucket Algorithm
 *
 * The token bucket algorithm allows for burst traffic while maintaining
 * an average rate limit over time.
 */

export interface RateLimitConfig {
  /** Maximum number of tokens (requests) in the bucket */
  maxTokens: number;
  /** Number of tokens to refill per interval */
  refillRate: number;
  /** Interval in milliseconds for refilling tokens */
  refillInterval: number;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitResult {
  allowed: boolean;
  tokensRemaining: number;
  retryAfter?: number;
}

/**
 * Token Bucket Rate Limiter
 *
 * Uses the token bucket algorithm to rate limit requests.
 * Each request consumes one token. Tokens are refilled at a constant rate.
 */
export class TokenBucketRateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if a request is allowed and consume a token if so
   *
   * @param key - Unique identifier for the rate limit bucket (e.g., endpoint name, user ID)
   * @param tokens - Number of tokens to consume (default: 1)
   * @returns Result indicating if request is allowed and retry information
   */
  public consume(key: string, tokens: number = 1): RateLimitResult {
    const state = this.getOrCreateState(key);
    this.refillTokens(state);

    if (state.tokens >= tokens) {
      state.tokens -= tokens;
      this.states.set(key, state);
      return {
        allowed: true,
        tokensRemaining: Math.floor(state.tokens),
      };
    }

    // Calculate retry after time
    const tokensNeeded = tokens - state.tokens;
    const refillsNeeded = Math.ceil(tokensNeeded / this.config.refillRate);
    const retryAfter = refillsNeeded * this.config.refillInterval;

    return {
      allowed: false,
      tokensRemaining: Math.floor(state.tokens),
      retryAfter,
    };
  }

  /**
   * Get the current token count for a key without consuming
   */
  public getTokens(key: string): number {
    const state = this.getOrCreateState(key);
    this.refillTokens(state);
    return Math.floor(state.tokens);
  }

  /**
   * Reset the rate limit state for a key
   */
  public reset(key: string): void {
    this.states.delete(key);
  }

  /**
   * Reset all rate limit states
   */
  public resetAll(): void {
    this.states.clear();
  }

  /**
   * Get or create a state for a given key
   */
  private getOrCreateState(key: string): RateLimitState {
    const existing = this.states.get(key);
    if (existing) {
      return existing;
    }

    const newState: RateLimitState = {
      tokens: this.config.maxTokens,
      lastRefill: Date.now(),
    };
    this.states.set(key, newState);
    return newState;
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillTokens(state: RateLimitState): void {
    const now = Date.now();
    const timePassed = now - state.lastRefill;
    const intervalsPassed = Math.floor(timePassed / this.config.refillInterval);

    if (intervalsPassed > 0) {
      const tokensToAdd = intervalsPassed * this.config.refillRate;
      state.tokens = Math.min(this.config.maxTokens, state.tokens + tokensToAdd);
      state.lastRefill = now;
    }
  }
}

/**
 * Rate Limiter Manager
 *
 * Manages multiple rate limiters for different endpoints and services
 */
export class RateLimiterManager {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map();

  /**
   * Register a new rate limiter for a specific key
   */
  public register(key: string, config: RateLimitConfig): void {
    this.limiters.set(key, new TokenBucketRateLimiter(config));
  }

  /**
   * Get a rate limiter by key
   */
  public get(key: string): TokenBucketRateLimiter | undefined {
    return this.limiters.get(key);
  }

  /**
   * Check and consume tokens from a specific rate limiter
   */
  public consume(limiterKey: string, requestKey: string, tokens: number = 1): RateLimitResult {
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      throw new Error(`Rate limiter not found: ${limiterKey}`);
    }
    return limiter.consume(requestKey, tokens);
  }

  /**
   * Get token count from a specific rate limiter
   */
  public getTokens(limiterKey: string, requestKey: string): number {
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      return 0;
    }
    return limiter.getTokens(requestKey);
  }

  /**
   * Reset a specific rate limiter
   */
  public reset(limiterKey: string, requestKey?: string): void {
    const limiter = this.limiters.get(limiterKey);
    if (!limiter) {
      return;
    }
    if (requestKey) {
      limiter.reset(requestKey);
    } else {
      limiter.resetAll();
    }
  }

  /**
   * Reset all rate limiters
   */
  public resetAll(): void {
    this.limiters.forEach(limiter => limiter.resetAll());
  }
}

/**
 * Create a rate limiter with exponential backoff support
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export class RateLimitedExecutor {
  private limiter: TokenBucketRateLimiter;
  private retryConfig: RetryConfig;

  constructor(rateLimitConfig: RateLimitConfig, retryConfig: RetryConfig) {
    this.limiter = new TokenBucketRateLimiter(rateLimitConfig);
    this.retryConfig = retryConfig;
  }

  /**
   * Execute a function with rate limiting and automatic retry with exponential backoff
   */
  public async execute<T>(
    key: string,
    fn: () => Promise<T>,
    tokens: number = 1
  ): Promise<T> {
    let attempt = 0;

    while (attempt <= this.retryConfig.maxRetries) {
      const result = this.limiter.consume(key, tokens);

      if (result.allowed) {
        try {
          return await fn();
        } catch (error: any) {
          // If we get a 429 error from the API, treat it as rate limited
          if (error.message?.includes('429') || error.message?.includes('rate limit')) {
            // Backoff and retry
            attempt++;
            if (attempt <= this.retryConfig.maxRetries) {
              const delay = Math.min(
                this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
                this.retryConfig.maxDelay
              );
              await this.sleep(delay);
              continue;
            }
          }
          throw error;
        }
      }

      // Rate limited by our limiter
      if (attempt >= this.retryConfig.maxRetries) {
        throw new Error(`Rate limit exceeded after ${attempt} attempts. Retry after ${result.retryAfter}ms`);
      }

      // Calculate backoff delay
      const delay = Math.min(
        Math.max(result.retryAfter || this.retryConfig.baseDelay, this.retryConfig.baseDelay) * Math.pow(2, attempt),
        this.retryConfig.maxDelay
      );

      await this.sleep(delay);
      attempt++;
    }

    throw new Error(`Rate limit exceeded after ${this.retryConfig.maxRetries} retries`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public getTokens(key: string): number {
    return this.limiter.getTokens(key);
  }

  public reset(key: string): void {
    this.limiter.reset(key);
  }
}
