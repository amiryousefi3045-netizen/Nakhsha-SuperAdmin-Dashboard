// ESLint v9 flat config – Node.js / CommonJS backend
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "logs/**",
      "uploads/**",
      "dist/**",
      "public/**",
    ],
  },
  {
    files: ["**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      // Unused variables are warnings (args starting with _ are exempt)
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // console.log is fine in a backend service
      "no-console": "off",
      // Let async/await errors surface
      "no-async-promise-executor": "error",
      "no-return-await": "warn",
    },
  },
];
