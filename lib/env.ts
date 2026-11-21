/**
 * Environment configuration validation and production hardening.
 */

export type EnvValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validates runtime environment variables, applying strict production safety checks.
 */
export function validateEnvironment(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const errors: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  if (isProduction) {
    // 1. Ensure BETTER_AUTH_URL starts with https://
    const betterAuthUrl = env.BETTER_AUTH_URL;
    if (!betterAuthUrl) {
      errors.push("BETTER_AUTH_URL is required in production and must start with 'https://'.");
    } else if (!betterAuthUrl.startsWith("https://")) {
      errors.push(`BETTER_AUTH_URL must start with 'https://' in production. Received: '${betterAuthUrl}'`);
    }

    // 2. Ensure TOKEN_ENCRYPTION_KEY is present and at least 32 characters long
    const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
    if (!encryptionKey) {
      errors.push("TOKEN_ENCRYPTION_KEY is required in production.");
    } else if (encryptionKey.length < 32) {
      errors.push(
        `TOKEN_ENCRYPTION_KEY must be at least 32 characters long in production (current length: ${encryptionKey.length}).`
      );
    }

    // 3. Ensure Cloudinary credentials are non-empty
    if (!env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME.trim() === "") {
      errors.push("CLOUDINARY_CLOUD_NAME is required in production.");
    }
    if (!env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY.trim() === "") {
      errors.push("CLOUDINARY_API_KEY is required in production.");
    }
    if (!env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET.trim() === "") {
      errors.push("CLOUDINARY_API_SECRET is required in production.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Enforces production environment assertions during runtime.
 * Throws a detailed error message if any required production variable is missing or malformed.
 */
export function assertProductionEnvironment(env: Record<string, string | undefined> = process.env): void {
  // During build step (phase-production-build), skip hard crashes to permit static compilation without live secrets
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { valid, errors } = validateEnvironment(env);
  if (!valid) {
    const formatted = errors.map((err) => `  - ${err}`).join("\n");
    throw new Error(`Production Environment Hardening Failed:\n${formatted}`);
  }
}
