/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: Test utilities require flexible any types for mocking and testing

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "@/types.js";
import { TEST_CONFIG } from "../setup.js";

// Test timeouts
export const TIMEOUTS = {
  UNIT: 5000,
  INTEGRATION: 10000,
  E2E: 15000,
} as const;

/**
 * Create a test MCP server instance
 */
export function createTestMcpServer(): McpServer {
  return new McpServer({
    name: "Test OpenAPI Context MCP Server",
    version: "1.0.0-test",
  });
}

/**
 * Create test configuration
 */
export function createTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...TEST_CONFIG,
    ...overrides,
  };
}

/**
 * Wait for a promise with timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))]);
}

/**
 * Suppress console output during tests
 */
export function suppressConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};

  return () => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  };
}

/**
 * Assert that a value is defined (not null or undefined)
 */
export function assertDefined<T>(value: T | null | undefined, message?: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message || "Expected value to be defined");
  }
}

/**
 * Create a mock fetch function for testing
 */
export function createMockFetch(responses: Map<string, any>) {
  return async (url: string) => {
    const response = responses.get(url);
    if (!response) {
      throw new Error(`No mock response for URL: ${url}`);
    }

    return {
      ok: true,
      status: 200,
      json: async () => response,
      text: async () => JSON.stringify(response),
    };
  };
}

/**
 * Get registered MCP tool by name
 */
export function getMcpTool(server: McpServer, toolName: string) {
  const registeredTools = (server as any)._registeredTools;
  if (!registeredTools || !registeredTools[toolName]) {
    throw new Error(`Tool '${toolName}' not found in registered tools`);
  }
  return registeredTools[toolName];
}

/**
 * Call an MCP tool with proper validation and error handling
 */
export async function callMcpTool(server: McpServer, toolName: string, args: any = {}) {
  const tool = getMcpTool(server, toolName);

  try {
    // Call the tool callback with the arguments
    return await tool.callback(args);
  } catch (error) {
    // Return error in MCP format
    return {
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : String(error),
          isError: true,
        },
      ],
    };
  }
}

/**
 * Check if a tool is registered
 */
export function isMcpToolRegistered(server: McpServer, toolName: string): boolean {
  const registeredTools = (server as any)._registeredTools;
  return registeredTools && registeredTools[toolName] !== undefined;
}

/**
 * Get all registered tool names
 */
export function getMcpToolNames(server: McpServer): string[] {
  const registeredTools = (server as any)._registeredTools;
  return registeredTools ? Object.keys(registeredTools) : [];
}
