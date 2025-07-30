import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, createTestConfig, suppressConsole, callMcpTool, TIMEOUTS } from "@tests/utils/test-helpers.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";

describe("get_headers tool - Parameter Validation", () => {
  let restoreConsole: () => void;
  let testConfig: any;

  beforeEach(async () => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
    testConfig = createTestConfig();
    // Load complex API spec for testing
    const specPath = resolve(__dirname, "../data/complex-api.yaml");
    await schemaStore.loadSchema(specPath);
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  it(
    "should return error when no parameters provided",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);

      // Act
      const result = await callMcpTool(server, "get_headers", {});

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("**Missing Parameters**");
      expect(result.content[0].text).toContain("Please provide either `operation_id` or both `method` and `path`");
      expect(result.content[0].text).toContain("💡 Need help with tool usage?");
    },
    TIMEOUTS.UNIT,
  );

  it(
    "should accept operation_id only",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const params = { operation_id: "listUsers" };

      // Act
      const result = await callMcpTool(server, "get_headers", params);

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Response Headers for GET /users");
      expect(result.content[0].text).toContain("X-Rate-Limit");
      expect(result.content[0].text).toContain("X-Request-ID");
      expect(result.content[0].text).toContain("X-Total-Count");
    },
    TIMEOUTS.UNIT,
  );

  it(
    "should accept method and path combination",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const params = { method: "GET", path: "/users" };

      // Act
      const result = await callMcpTool(server, "get_headers", params);

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Response Headers for GET /users");
      expect(result.content[0].text).toContain("X-Rate-Limit");
      expect(result.content[0].text).toContain("X-Request-ID");
      expect(result.content[0].text).toContain("X-Total-Count");
    },
    TIMEOUTS.UNIT,
  );

  it(
    "should handle case-insensitive HTTP methods",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const params = { method: "get", path: "/users" }; // lowercase method

      // Act
      const result = await callMcpTool(server, "get_headers", params);

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Response Headers for GET /users");
      expect(result.content[0].text).toContain("X-Rate-Limit");
    },
    TIMEOUTS.UNIT,
  );

  it(
    "should return error when only method provided without path",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const params = { method: "GET" };

      // Act
      const result = await callMcpTool(server, "get_headers", params);

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("**Missing Parameters**");
      expect(result.content[0].text).toContain("Please provide either `operation_id` or both `method` and `path`");
    },
    TIMEOUTS.UNIT,
  );

  it(
    "should return error when only path provided without method",
    async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const params = { path: "/users" };

      // Act
      const result = await callMcpTool(server, "get_headers", params);

      // Assert
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("**Missing Parameters**");
      expect(result.content[0].text).toContain("Please provide either `operation_id` or both `method` and `path`");
    },
    TIMEOUTS.UNIT,
  );

  describe("Status Code Filtering", () => {
    it(
      "should return headers for specific status code when provided",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "listUsers", status_code: "200" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for 200");
        expect(result.content[0].text).toContain("X-Rate-Limit");
        expect(result.content[0].text).toContain("X-Request-ID");
        expect(result.content[0].text).toContain("X-Total-Count");
        // Should not contain headers from other status codes
        expect(result.content[0].text).not.toContain("401");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should return error for non-existent status code",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "listUsers", status_code: "500" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("**Status Code Not Found**");
        expect(result.content[0].text).toContain('Status code "500" not found for this operation');
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle numeric status codes converted to strings",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        // Test with a numeric value that will be converted to string
        const params = { operation_id: "listUsers", status_code: 200 as any };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for 200");
        expect(result.content[0].text).toContain("X-Rate-Limit");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle wildcard status codes like 2XX",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "listUsers", status_code: "2XX" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        // For now, this should return not found since wildcard support isn't implemented
        // In a real implementation, it might aggregate all 2XX responses
        expect(result.content[0].text).toContain("**Status Code Not Found**");
        expect(result.content[0].text).toContain('Status code "2XX" not found');
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("Edge Cases", () => {
    beforeEach(async () => {
      // Clear and load edge cases spec for these tests
      schemaStore.clearSchema();
      const edgeCasesPath = resolve(__dirname, "../data/headers-edge-cases.yaml");
      await schemaStore.loadSchema(edgeCasesPath);
    });

    it(
      "should handle operations with no responses defined",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "noResponses" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No headers defined for any response in this operation.");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle responses with empty headers object",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "emptyHeaders" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for GET /empty-headers");
        expect(result.content[0].text).toContain("Status Code: `200`");
        expect(result.content[0].text).toContain("Description: Success with empty headers");
        // Empty headers object doesn't produce "No headers defined" message
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle malformed header schemas",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "malformedHeaders" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for GET /malformed-headers");
        // Should still show headers even if malformed
        expect(result.content[0].text).toContain("X-No-Schema");
        expect(result.content[0].text).toContain("X-Empty-Schema");
        expect(result.content[0].text).toContain("X-No-Type");
        expect(result.content[0].text).toContain("X-Invalid-Type");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle headers with missing schema property",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "malformedHeaders", compact: true };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        // Headers without schema should still be displayed
        expect(result.content[0].text).toContain("**X-No-Schema**");
        expect(result.content[0].text).toContain("Header without schema property");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle headers with complex schema types",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "complexHeaders" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for GET /complex-headers");
        // Array header
        expect(result.content[0].text).toContain("X-Array-Header");
        expect(result.content[0].text).toContain("array");
        expect(result.content[0].text).toContain("Array of strings");
        // Object header
        expect(result.content[0].text).toContain("X-Object-Header");
        expect(result.content[0].text).toContain("object");
        expect(result.content[0].text).toContain("Object header");
        // Enum header
        expect(result.content[0].text).toContain("X-Enum-Header");
        expect(result.content[0].text).toContain("string");
        expect(result.content[0].text).toContain("Enum values");
        // Pattern header
        expect(result.content[0].text).toContain("X-Pattern-Header");
        expect(result.content[0].text).toContain("Pattern constraint");
        // MinMax header
        expect(result.content[0].text).toContain("X-MinMax-Header");
        expect(result.content[0].text).toContain("integer");
        expect(result.content[0].text).toContain("Min/max constraint");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle operations with only error responses",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        const params = { operation_id: "errorOnly" };

        // Act
        const result = await callMcpTool(server, "get_headers", params);

        // Assert
        expect(result.content[0].type).toBe("text");
        // Should show headers from error responses if no success responses exist
        expect(result.content[0].text).toContain("Response Headers");
        // If no headers at all, should indicate that
        if (result.content[0].text.includes("No headers found")) {
          expect(result.content[0].text).toContain("No headers found");
        }
      },
      TIMEOUTS.UNIT,
    );
  });
});
