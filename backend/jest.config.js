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
  testMatch: ["**/__tests__/**/*.js", "**/*.test.js", "**/*.spec.js"],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  // Timeout برای تست‌های async
  testTimeout: 10000,
};
