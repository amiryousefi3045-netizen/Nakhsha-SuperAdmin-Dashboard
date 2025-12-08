module.exports = {
  testEnvironment: "node",
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "routes/**/*.js",
    "models/**/*.js",
    "middlewares/**/*.js",
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
