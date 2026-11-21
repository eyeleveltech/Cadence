import "server-only";

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  name?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  retryAfterSeconds: number;
}

/**
 * High-performance sliding-window in-memory rate limiter.
 * Zero-dependency: works locally without Redis and protects standalone endpoints.
 */
export class InMemoryRateLimiter {
  private requests = new Map<string, number[]>();
  readonly limit: number;
  readonly windowMs: number;
  readonly name: string;

  constructor(options: RateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.name = options.name ?? "rate-limiter";
  }

  check(key: string, now: number = Date.now()): RateLimitResult {
    const windowStart = now - this.windowMs;
    const existing = this.requests.get(key);
    const timestamps = existing ? existing.filter((t) => t > windowStart) : [];

    if (timestamps.length >= this.limit) {
      const oldest = timestamps[0];
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      const retryAfterSeconds = Math.ceil(resetMs / 1000);
      this.requests.set(key, timestamps);
      return {
        success: false,
        limit: this.limit,
        remaining: 0,
        resetMs,
        retryAfterSeconds,
      };
    }

    timestamps.push(now);
    this.requests.set(key, timestamps);

    return {
      success: true,
      limit: this.limit,
      remaining: this.limit - timestamps.length,
      resetMs: this.windowMs,
      retryAfterSeconds: 0,
    };
  }

  reset(key?: string): void {
    if (key) {
      this.requests.delete(key);
    } else {
      this.requests.clear();
    }
  }

  cleanup(now: number = Date.now()): void {
    const windowStart = now - this.windowMs;
    for (const [key, timestamps] of this.requests.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, active);
      }
    }
  }
}

/**
 * Extracts the client IP from proxy headers (x-forwarded-for, x-real-ip, cf-connecting-ip)
 * or falls back to loopback.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "127.0.0.1"
  );
}

// 10 password login attempts per 15 minutes per IP
export const authEmailLimiter = new InMemoryRateLimiter({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  name: "auth-email",
});

// 5 magic link requests per 15 minutes per IP
export const authMagicLinkLimiter = new InMemoryRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  name: "auth-magic-link",
});

// 5 password reset requests per 15 minutes per IP/email
export const forgotPasswordLimiter = new InMemoryRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  name: "forgot-password",
});

