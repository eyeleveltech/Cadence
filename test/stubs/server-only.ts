// `server-only` throws on import outside a React Server Component, which
// is the whole point of it — and which makes any module that imports it
// untestable under vitest's plain-node environment. Aliased in
// vitest.config.ts so the guard stays real in the app and inert in tests.
export {};
