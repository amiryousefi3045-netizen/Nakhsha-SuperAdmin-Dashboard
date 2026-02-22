/**
 * Jest global setup — runs before any test module is loaded.
 *
 * Sets the minimum required environment variables so that server.js (and the
 * modules it requires) can be imported without throwing due to missing secrets.
 * Tests that need different values can override them inside beforeAll/beforeEach.
 */

// Must be set before server.js is required, otherwise the fail-fast JWT getter
// will throw on the very first token operation.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-key-for-jest-only";
process.env.NODE_ENV = process.env.NODE_ENV || "test";
