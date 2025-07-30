import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, callMcpTool, suppressConsole, TIMEOUTS, createTestConfig } from "@tests/utils/test-helpers.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";

describe("get_headers tool - Cross-Tool Integration", () => {
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
    "should work after list_operations to find operations with headers",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - First list operations, then get headers for one
      const listResult = await callMcpTool(server, "list_operations", {
        compact: true,
      });
      const getHeadersResult = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
      });

      // Assert
      expect(listResult.content[0].text).toContain("get /users");
      expect(getHeadersResult.content[0].text).toContain("X-Rate-Limit");
      expect(getHeadersResult.content[0].text).toContain("X-Request-ID");
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should complement get_response_schema by showing headers separately",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - Get both response schema and headers
      const schemaResult = await callMcpTool(server, "get_response_schema", {
        operation_id: "listUsers",
        status_code: "200",
      });
      const headersResult = await callMcpTool(server, "get_headers", {
        operation_id: "listUsers",
        status_code: "200",
      });

      // Assert
      expect(schemaResult.content[0].text).toContain("users");
      expect(schemaResult.content[0].text).toContain("pagination");
      expect(headersResult.content[0].text).toContain("X-Rate-Limit");
      // Headers output should not contain the response body schema fields
      expect(headersResult.content[0].text).not.toContain("pagination"); // Body field not in headers
    },
    TIMEOUTS.INTEGRATION,
  );

  it(
    "should work with search_operations results",
    async () => {
      // Arrange
      const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
      const config = createTestConfig();
      registerOpenAPITools(server, config);

      // Act - Search for operations then get headers
      const searchResult = await callMcpTool(server, "search_operations", {
        query: "list",
      });
      const headersResult = await callMcpTool(server, "get_headers", {
        method: "GET",
        path: "/users",
      });

      // Assert
      expect(searchResult.content[0].text).toContain("List users");
      expect(headersResult.content[0].text).toContain("Response Headers");
    },
    TIMEOUTS.INTEGRATION,
  );
});
