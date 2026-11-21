import { describe, it, expect } from "vitest";
import { validateEnvironment } from "./env";

describe("Production Environment Hardening (lib/env.ts)", () => {
  it("passes validation in development even with empty production credentials", () => {
    const devEnv = {
      NODE_ENV: "development",
    };
    const res = validateEnvironment(devEnv);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("fails in production when BETTER_AUTH_URL does not start with https://", () => {
    const prodEnv = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "http://localhost:3000",
      TOKEN_ENCRYPTION_KEY: "12345678901234567890123456789012",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "123",
      CLOUDINARY_API_SECRET: "sec",
    };
    const res = validateEnvironment(prodEnv);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("BETTER_AUTH_URL"))).toBe(true);
  });

  it("fails in production when TOKEN_ENCRYPTION_KEY is less than 32 characters", () => {
    const prodEnv = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://cadence.theeyelevelstudio.com",
      TOKEN_ENCRYPTION_KEY: "short-key",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "123",
      CLOUDINARY_API_SECRET: "sec",
    };
    const res = validateEnvironment(prodEnv);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("TOKEN_ENCRYPTION_KEY"))).toBe(true);
  });

  it("fails in production when Cloudinary credentials are missing", () => {
    const prodEnv = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://cadence.theeyelevelstudio.com",
      TOKEN_ENCRYPTION_KEY: "12345678901234567890123456789012",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
    };
    const res = validateEnvironment(prodEnv);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("CLOUDINARY_CLOUD_NAME"))).toBe(true);
    expect(res.errors.some((e) => e.includes("CLOUDINARY_API_KEY"))).toBe(true);
    expect(res.errors.some((e) => e.includes("CLOUDINARY_API_SECRET"))).toBe(true);
  });

  it("passes validation in production when all credentials meet requirements", () => {
    const prodEnv = {
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://cadence.theeyelevelstudio.com",
      TOKEN_ENCRYPTION_KEY: "123456789012345678901234567890123456",
      CLOUDINARY_CLOUD_NAME: "cadence_prod",
      CLOUDINARY_API_KEY: "prod_key_999",
      CLOUDINARY_API_SECRET: "prod_secret_888",
    };
    const res = validateEnvironment(prodEnv);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});
