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

// Override MONGODB_URI so that server.js connects to the test database
// when it is require()'d by test files.  This prevents the "different
// connection strings" error that occurs when server.js connects to the
// dev database and test beforeAll hooks then try to connect to nakhsha_test.
process.env.MONGODB_URI =
  process.env.MONGODB_TEST_URI || "mongodb://127.0.0.1:27017/nakhsha_test";
