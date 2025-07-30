import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, callMcpTool, suppressConsole, TIMEOUTS, createTestConfig } from "@tests/utils/test-helpers.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";

describe("get_headers tool - Schema Store Integration", () => {
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
    "should work after schema reload",
    async () => {
      // Arrange - Load first spec
      const specPath1 = resolve(process.cwd(), "tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath1);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - Clear and reload with different spec
      schemaStore.clearSchema();
      const specPath2 = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath2);

      const result = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
      });

      // Assert
      expect(result.content[0].text).toContain("X-Rate-Limit");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should handle schema store clear and reload",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act
      const result1 = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
      });

      schemaStore.clearSchema();

      const result2 = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
      });

      // Assert
      expect(result1.content[0].text).toContain("X-Rate-Limit");
      expect(result2.content[0].text).toContain("No OpenAPI");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should work with different spec files loaded sequentially",
    async () => {
      // Arrange & Act
      const specs = [
        { path: "tests/data/simple-api.yaml", operationId: "getHealth" },
        { path: "tests/data/complex-api.yaml", operationId: "listUsers" },
        { path: "tests/data/headers-edge-cases.yaml", operationId: "complexHeaders" },
      ];

      const config = createTestConfig();
      registerOpenAPITools(server, config);

      for (const { path, operationId } of specs) {
        schemaStore.clearSchema();
        const specPath = resolve(process.cwd(), path);
        await schemaStore.loadSchema(specPath);

        const result = await callMcpTool(server, "get_headers", {
          operation_id: operationId,
        });

        // Assert
        expect(result.content[0].type).toBe("text");
        if (operationId === "getHealth") {
          expect(result.content[0].text).toContain("No headers defined");
        } else if (operationId === "listUsers") {
          expect(result.content[0].text).toContain("X-Rate-Limit");
        } else if (operationId === "complexHeaders") {
          expect(result.content[0].text).toContain("X-Array-Header");
        }
      }
    },
    TIMEOUTS.INTEGRATION,
  );
});
