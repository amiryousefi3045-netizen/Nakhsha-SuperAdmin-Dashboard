module.exports = {
  testEnvironment: "node",
  // Runs before any test module is evaluated — guarantees JWT_SECRET is set
  // before server.js (and its route modules) are require()'d by test files.
  setupFiles: ["./jest.setup.js"],
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "routes/**/*.js",
    "models/**/*.js",
    "middleware/**/*.js",
    "utils/**/*.js",
    "!**/node_modules/**",
    "!**/coverage/**",
  ],
  // Coverage gate — starts at the VALUES MEASURED on 2026-09-15
  // (stmts 51.78 / branch 38.73 / funcs 42.94 / lines 52.73) minus a small
  // buffer for run-to-run variance. Raises these thresholds incrementally as
  // controllers/services/modules gain test coverage.
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 35,
      functions: 40,
      lines: 51,
    },
  },
  testMatch: ["**/__tests__/**/*.js", "**/*.test.js", "**/*.spec.js"],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Timeout برای تست‌های async
  testTimeout: 10000,
};
