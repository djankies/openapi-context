import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, callMcpTool, suppressConsole, TIMEOUTS, createTestConfig } from "@tests/utils/test-helpers.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";

describe("get_headers tool - MCP Protocol Integration", () => {
  let restoreConsole: () => void;
  let server: ReturnType<typeof createTestMcpServer>;

  beforeEach(() => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
    server = createTestMcpServer();
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  it(
    "should return proper MCP response format",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
      });

      // Assert
      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty("type");
      expect(result.content[0].type).toBe("text");
      expect(result.content[0]).toHaveProperty("text");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should handle MCP transport errors gracefully",
    async () => {
      // Arrange - No spec loaded
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "someOperation",
      });

      // Assert
      expect(result.content[0].text).toContain("No OpenAPI");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should work correctly in stdio mode",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - Call through MCP protocol
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
        compact: true,
      });

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("**X-Rate-Limit**");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should work correctly in HTTP mode",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - Simulate HTTP mode call
      const result = await callMcpTool(server, "get_headers", {
        method: "GET",
        path: "/users",
      });

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Response Headers");
    },
    TIMEOUTS.INTEGRATION,
  );
});
