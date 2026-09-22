// jest.config.js  (CommonJS — Jest loads this before any transpilation)
/** @type {import('jest').Config} */
const config = {
  // Use ts-jest to transpile TypeScript test files
  preset: "ts-jest",
  testEnvironment: "node",

  // Override ts-jest compiler options so it can resolve LangChain subpath exports
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // Skip type-checking during test runs — tsc --noEmit handles that.
        // This lets ts-jest act purely as a transpiler and avoids subpath-import
        // type errors that only occur under 'node' moduleResolution.
        diagnostics: false,
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "node",
          esModuleInterop: true,
          skipLibCheck: true,
        },
      },
    ],
  },

  // Resolve LangChain subpath imports that use package.json "exports" field.
  // Jest's CommonJS resolver doesn't support "exports" by default.
  moduleNameMapper: {
    "^@langchain/langgraph/prebuilt$":
      "<rootDir>/node_modules/@langchain/langgraph/dist/prebuilt/index.cjs",
    "^@langchain/core/messages$":
      "<rootDir>/node_modules/@langchain/core/dist/messages/index.cjs",
    "^@langchain/core/tools$":
      "<rootDir>/node_modules/@langchain/core/dist/tools/index.cjs",
    "^@langchain/google-genai$":
      "<rootDir>/node_modules/@langchain/google-genai/dist/index.cjs",
  },

  // Where to find integration tests
  testMatch: ["**/tests/integration/**/*.test.ts"],

  // Per-test timeout: allow up to 2 min for 4-leg LLM chain
  testTimeout: 120_000,

  verbose: true,
};

module.exports = config;
