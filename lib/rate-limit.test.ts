import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryRateLimiter,
  getClientIp,
  authEmailLimiter,
  authMagicLinkLimiter,
  forgotPasswordLimiter,
} from "./rate-limit";

describe("Rate Limiting (lib/rate-limit.ts)", () => {
  describe("InMemoryRateLimiter", () => {
    let limiter: InMemoryRateLimiter;

    beforeEach(() => {
      limiter = new InMemoryRateLimiter({
        limit: 3,
        windowMs: 10_000, // 10 seconds
        name: "test-limiter",
      });
    });

    it("allows requests within the limit and decrements remaining", () => {
      const now = 1_000_000;
      const r1 = limiter.check("user-1", now);
      expect(r1.success).toBe(true);
      expect(r1.limit).toBe(3);
      expect(r1.remaining).toBe(2);
      expect(r1.retryAfterSeconds).toBe(0);

      const r2 = limiter.check("user-1", now + 100);
      expect(r2.success).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = limiter.check("user-1", now + 200);
      expect(r3.success).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it("blocks requests once limit is exceeded and provides accurate retryAfterSeconds", () => {
      const now = 1_000_000;
      limiter.check("user-1", now); // request 1
      limiter.check("user-1", now + 1000); // request 2
      limiter.check("user-1", now + 2000); // request 3

      // 4th request at now + 3000ms: should fail
      // Oldest request was at now (1_000_000), window is 10_000ms, expires at 1_010_000.
      // Remaining reset time = 1_010_000 - 1_003_000 = 7000ms -> 7 seconds.
      const blocked = limiter.check("user-1", now + 3000);
      expect(blocked.success).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetMs).toBe(7000);
      expect(blocked.retryAfterSeconds).toBe(7);
    });

    it("restores capacity as timestamps roll outside the sliding window", () => {
      const now = 1_000_000;
      limiter.check("user-1", now); // Expires at now + 10_000
      limiter.check("user-1", now + 5000); // Expires at now + 15_000
      limiter.check("user-1", now + 6000); // Expires at now + 16_000

      // At now + 7000, 3 active requests -> blocked
      expect(limiter.check("user-1", now + 7000).success).toBe(false);

      // At now + 10_001, the first request has expired! Should be allowed now
      const allowed = limiter.check("user-1", now + 10_001);
      expect(allowed.success).toBe(true);
      expect(allowed.remaining).toBe(0); // now has requests at 5000, 6000, 10001 (total 3)

      // Next request at now + 10_002 is blocked again
      expect(limiter.check("user-1", now + 10_002).success).toBe(false);

      // At now + 15_001, the second request expires
      expect(limiter.check("user-1", now + 15_001).success).toBe(true);
    });

    it("isolates rate limits by distinct keys", () => {
      const now = 1_000_000;
      limiter.check("ip-1", now);
      limiter.check("ip-1", now);
      limiter.check("ip-1", now);
      expect(limiter.check("ip-1", now).success).toBe(false);

      // ip-2 should still have full quota
      const check2 = limiter.check("ip-2", now);
      expect(check2.success).toBe(true);
      expect(check2.remaining).toBe(2);
    });

    it("resets state per key or globally", () => {
      const now = 1_000_000;
      limiter.check("user-1", now);
      limiter.check("user-1", now);
      limiter.check("user-1", now);
      expect(limiter.check("user-1", now).success).toBe(false);

      limiter.reset("user-1");
      expect(limiter.check("user-1", now).success).toBe(true);

      limiter.check("user-2", now);
      limiter.reset(); // clear all
      expect(limiter.check("user-2", now).remaining).toBe(2);
    });

    it("cleans up expired entries during cleanup()", () => {
      const now = 1_000_000;
      limiter.check("expired-key", now);
      limiter.check("active-key", now + 8000);

      // Run cleanup after expired-key's window has passed
      limiter.cleanup(now + 12000);

      // expired-key should have been pruned and get fresh full quota
      expect(limiter.check("expired-key", now + 12000).remaining).toBe(2);
    });
  });

  describe("getClientIp", () => {
    it("extracts the first IP from comma-separated x-forwarded-for header", () => {
      const headers = new Headers({
        "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      });
      expect(getClientIp(headers)).toBe("203.0.113.195");
    });

    it("trims whitespace from single x-forwarded-for IP", () => {
      const headers = new Headers({
        "x-forwarded-for": "  198.51.100.42  ",
      });
      expect(getClientIp(headers)).toBe("198.51.100.42");
    });

    it("falls back to x-real-ip when x-forwarded-for is missing", () => {
      const headers = new Headers({
        "x-real-ip": "192.0.2.1",
      });
      expect(getClientIp(headers)).toBe("192.0.2.1");
    });

    it("falls back to cf-connecting-ip when other headers are missing", () => {
      const headers = new Headers({
        "cf-connecting-ip": "104.28.1.1",
      });
      expect(getClientIp(headers)).toBe("104.28.1.1");
    });

    it("defaults to 127.0.0.1 when no proxy headers exist", () => {
      const headers = new Headers();
      expect(getClientIp(headers)).toBe("127.0.0.1");
    });
  });

  describe("Preconfigured limiters", () => {
    it("configures authEmailLimiter with 10 requests per 15 min", () => {
      expect(authEmailLimiter.limit).toBe(10);
      expect(authEmailLimiter.windowMs).toBe(15 * 60 * 1000);
      expect(authEmailLimiter.name).toBe("auth-email");
    });

    it("configures authMagicLinkLimiter with 5 requests per 15 min", () => {
      expect(authMagicLinkLimiter.limit).toBe(5);
      expect(authMagicLinkLimiter.windowMs).toBe(15 * 60 * 1000);
      expect(authMagicLinkLimiter.name).toBe("auth-magic-link");
    });

    it("configures forgotPasswordLimiter with 5 requests per 15 min", () => {
      expect(forgotPasswordLimiter.limit).toBe(5);
      expect(forgotPasswordLimiter.windowMs).toBe(15 * 60 * 1000);
      expect(forgotPasswordLimiter.name).toBe("forgot-password");
    });
  });
});

