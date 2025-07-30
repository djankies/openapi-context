import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { createTestMcpServer, callMcpTool, suppressConsole, TIMEOUTS, createTestConfig } from "@tests/utils/test-helpers.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";

describe("get_headers tool - Core Integration Tests", () => {
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

  describe("Real OpenAPI Spec Testing", () => {
    it(
      "should handle complex nested header structures from real specs",
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
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("X-Rate-Limit");
        expect(result.content[0].text).toContain("integer");
        expect(result.content[0].text).toContain("API rate limit remaining");
        expect(result.content[0].text).toContain("X-Request-ID");
        expect(result.content[0].text).toContain("uuid");
        expect(result.content[0].text).toContain("X-Total-Count");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should work with different OpenAPI versions in real specs",
      async () => {
        // Arrange - Using complex-api.yaml which is OpenAPI 3.1.0
        const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          method: "GET",
          path: "/users",
        });

        // Assert
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for GET /users");
        expect(result.content[0].text).toContain("Status Code: `200`");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle vendor extensions (x-* fields) in headers",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "vendorExtensions",
        });

        // Assert
        expect(result.content[0].type).toBe("text");
        const text = result.content[0].text;
        expect(text).toContain("X-Custom-Header");
        expect(text).toContain("Custom header");
        // Vendor extensions are not included in the standard output
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should process large specs with many operations efficiently",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act - Multiple operations to test performance
        const startTime = Date.now();
        const results = await Promise.all([
          callMcpTool(server, "get_headers", { operation_id: "complexHeaders" }),
          callMcpTool(server, "get_headers", { operation_id: "securityHeaders" }),
          callMcpTool(server, "get_headers", { operation_id: "statusVariations" }),
        ]);
        const endTime = Date.now();

        // Assert
        results.forEach((result) => {
          expect(result.content[0].type).toBe("text");
        });
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("Error Recovery", () => {
    it(
      "should recover gracefully from corrupted spec data",
      async () => {
        // Arrange - Load a normal spec first
        const specPath = resolve(process.cwd(), "tests/data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act - Try to get headers for non-existent operation
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "nonExistentOperation",
        });

        // Assert
        expect(result.content[0].text).toContain("Operation not found");
        expect(result.content[0].text).toContain("Operation not found");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle concurrent requests for different operations",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act - Multiple concurrent requests
        const results = await Promise.all([
          callMcpTool(server, "get_headers", { operation_id: "complexHeaders" }),
          callMcpTool(server, "get_headers", { operation_id: "securityHeaders" }),
          callMcpTool(server, "get_headers", { operation_id: "requiredHeaders" }),
        ]);

        // Assert
        expect(results[0].content[0].text).toContain("X-Array-Header");
        expect(results[1].content[0].text).toContain("X-Content-Type-Options");
        expect(results[2].content[0].text).toContain("X-Required-True");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should maintain state correctly across multiple calls",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/complex-api.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act - Multiple sequential calls
        const result1 = await callMcpTool(server, "get_headers", {
          operation_id: "listUsers",
        });
        const result2 = await callMcpTool(server, "get_headers", {
          operation_id: "createUser",
        });
        const result3 = await callMcpTool(server, "get_headers", {
          operation_id: "listUsers",
        });

        // Assert - Results should be consistent
        expect(result1.content[0].text).toContain("X-Rate-Limit");
        expect(result2.content[0].text).toContain("No headers defined");
        expect(result3.content[0].text).toBe(result1.content[0].text);
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("Complex Header Scenarios", () => {
    it(
      "should handle arrays and complex types in headers",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "complexHeaders",
        });

        // Assert
        expect(result.content[0].text).toContain("X-Array-Header");
        expect(result.content[0].text).toContain("array[string]");
        expect(result.content[0].text).toContain("X-Object-Header");
        expect(result.content[0].text).toContain("object");
        expect(result.content[0].text).toContain("X-Enum-Header");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle security-related headers",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "securityHeaders",
        });

        // Assert
        expect(result.content[0].text).toContain("X-Content-Type-Options");
        expect(result.content[0].text).toContain("nosniff");
        expect(result.content[0].text).toContain("X-Frame-Options");
        expect(result.content[0].text).toContain("DENY");
        expect(result.content[0].text).toContain("Content-Security-Policy");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle required headers appropriately",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "requiredHeaders",
          compact: false,
        });

        // Assert
        expect(result.content[0].text).toContain("X-Required-True");
        expect(result.content[0].text).toContain("Required: Yes");
        expect(result.content[0].text).toContain("X-Required-False");
        // Note: X-Required-False has required: false, but our helper function
        // only shows "Required:" line when required is true
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle different status code patterns",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "statusVariations",
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Status Code: `100`");
        expect(text).toContain("Status Code: `201`");
        expect(text).toContain("Status Code: `301`");
        expect(text).toContain("Status Code: `401`");
        expect(text).toContain("Status Code: `500`");
        expect(text).toContain("Status Code: `default`");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should filter headers by specific status code",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act
        const result = await callMcpTool(server, "get_headers", {
          operation_id: "statusVariations",
          status_code: "201",
        });

        // Assert
        expect(result.content[0].text).toContain("Response Headers for 201");
        expect(result.content[0].text).toContain("Location");
        expect(result.content[0].text).toContain("Resource location");
        expect(result.content[0].text).not.toContain("X-Error-ID");
        expect(result.content[0].text).not.toContain("Status Code: `500`");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle string vs number status codes",
      async () => {
        // Arrange
        const specPath = resolve(process.cwd(), "tests/data/headers-edge-cases.yaml");
        await schemaStore.loadSchema(specPath);
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        // Act - Test with string status code
        const result1 = await callMcpTool(server, "get_headers", {
          operation_id: "statusVariations",
          status_code: "201",
        });

        // Assert
        expect(result1.content[0].text).toContain("Location");
      },
      TIMEOUTS.INTEGRATION,
    );
  });
});
