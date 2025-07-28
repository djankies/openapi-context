// Global test configuration
export const TEST_CONFIG = {
  port: 3001, // Different from production
  host: "127.0.0.1",
  logLevel: "error" as const, // Reduce noise in tests
  maxSpecSize: 5, // Smaller for tests
};

// Test timeouts
export const TIMEOUTS = {
  UNIT: 5000,
  INTEGRATION: 10000,
  E2E: 15000,
};
