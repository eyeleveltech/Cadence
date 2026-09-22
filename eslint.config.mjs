import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

// eslint-config-next's subpaths (core-web-vitals.js, typescript.js) still
// ship legacy eslintrc-shaped objects ({ extends: [...] }), not flat-config
// arrays — FlatCompat bridges the two, per Next.js's own recommended setup
// for flat config until eslint-config-next publishes native flat exports.
const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
