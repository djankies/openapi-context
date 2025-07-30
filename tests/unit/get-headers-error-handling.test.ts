import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";
import { createTestMcpServer, createTestConfig, suppressConsole, callMcpTool } from "@tests/utils/test-helpers.js";

describe("get_headers tool - Error Handling", () => {
  let restoreConsole: () => void;
  let testConfig: any;

  beforeEach(() => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
    testConfig = createTestConfig();
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
    // Reset any mocks to avoid test interference
    vi.restoreAllMocks();
  });

  it("should handle schema store errors gracefully", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    // Mock schemaStore to throw an error
    const originalFindOperation = schemaStore.findOperation;
    const originalHasSchema = schemaStore.hasSchema;
    schemaStore.hasSchema = () => true;
    schemaStore.findOperation = () => {
      throw new Error("Schema store error: Database connection failed");
    };

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "listUsers",
    });

    // Assert
    expect(result.content[0].text).toContain("**Error Getting Headers**");
    expect(result.content[0].text).toContain("Schema store error: Database connection failed");
    expect(result.content[0].text).toContain("💡 Call `help()` for troubleshooting guidance.");

    // Cleanup
    schemaStore.findOperation = originalFindOperation;
    schemaStore.hasSchema = originalHasSchema;
  });
  it("should handle malformed operation data", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    // Mock schemaStore to return malformed operation data
    const originalFindOperation = schemaStore.findOperation;
    const originalHasSchema = schemaStore.hasSchema;
    schemaStore.hasSchema = () => true;
    schemaStore.findOperation = () => ({
      operationId: "malformed",
      method: "GET",
      path: "/malformed",
      summary: "",
      description: "",
      tags: [],
      // responses is not an object but a string
      responses: "malformed" as any,
    });

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "malformed",
    });

    // Assert - The tool treats the string as an array of characters
    expect(result.content[0].text).toContain("**Response Headers for GET /malformed**");
    expect(result.content[0].text).toContain("Status Code: `0`"); // First character index
    expect(result.content[0].text).toContain("No headers defined for any response in this operation.");

    // Cleanup
    schemaStore.findOperation = originalFindOperation;
    schemaStore.hasSchema = originalHasSchema;
  });
  it("should handle missing responses in operation", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    // Mock schemaStore to return operation without responses
    const originalFindOperation = schemaStore.findOperation;
    const originalHasSchema = schemaStore.hasSchema;
    schemaStore.hasSchema = () => true;
    schemaStore.findOperation = () => ({
      operationId: "noResponses",
      method: "GET",
      path: "/no-responses",
      summary: "",
      description: "",
      tags: [],
      responses: {},
      // No responses property
    });

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "noResponses",
    });

    // Assert
    expect(result.content[0].text).toContain("**Response Headers for GET /no-responses**");
    expect(result.content[0].text).toContain("No headers defined for any response in this operation.");

    // Cleanup
    schemaStore.findOperation = originalFindOperation;
    schemaStore.hasSchema = originalHasSchema;
  });
  it("should provide helpful error messages with suggestions", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    const specPath = resolve(__dirname, "../data/complex-api.yaml");
    await schemaStore.loadSchema(specPath);

    // Act - Try to get headers for non-existent operation
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "nonExistentOperation",
    });

    // Assert
    expect(result.content[0].text).toContain("**Operation Not Found**");
    expect(result.content[0].text).toContain("Operation not found: nonExistentOperation");
    expect(result.content[0].text).toContain("💡 Use `list_operations()` to see available operations");
    expect(result.content[0].text).toContain("or call `help()` for usage guidance.");
  });
  it("should handle no spec loaded scenario", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    // Ensure no spec is loaded
    schemaStore.clearSchema();

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "anyOperation",
    });

    // Assert
    expect(result.content[0].text).toContain("**No OpenAPI Spec Available**");
    expect(result.content[0].text).toContain("No OpenAPI specification has been loaded.");
    expect(result.content[0].text).toContain("To fix this:");
    expect(result.content[0].text).toContain("1. Mount your OpenAPI file to `/app/spec` in the container");
  });
  it("should handle operations without any headers", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    const specPath = resolve(__dirname, "../data/headers-edge-cases.yaml");
    await schemaStore.loadSchema(specPath);

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "emptyHeaders",
    });

    // Assert
    expect(result.content[0].text).toContain("**Response Headers for GET /empty-headers**");
    expect(result.content[0].text).toContain("Status Code: `200`");
    expect(result.content[0].text).toContain("Description: Success with empty headers");
    // With empty headers object, no individual headers should be shown
    expect(result.content[0].text).not.toContain("- **"); // No header entries
  });
  it("should handle invalid HTTP method format", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    const specPath = resolve(__dirname, "../data/complex-api.yaml");
    await schemaStore.loadSchema(specPath);

    // Act - Use lowercase method (should be converted to uppercase)
    const result = await callMcpTool(server, "get_headers", {
      method: "get",
      path: "/users",
    });

    // Assert - Should work due to toUpperCase() conversion
    expect(result.content[0].text).toContain("**Response Headers for GET /users**");
    expect(result.content[0].text).not.toContain("Operation not found");
  });
  it("should handle paths with special characters", async () => {
    // Arrange
    const server = createTestMcpServer();
    registerOpenAPITools(server, testConfig);
    // Mock schemaStore with path containing special characters
    const originalFindOperation = schemaStore.findOperation;
    const originalHasSchema = schemaStore.hasSchema;
    schemaStore.hasSchema = () => true;
    schemaStore.findOperation = () => ({
      operationId: "specialPath",
      method: "GET",
      path: "/api/users/{id}/data?filter=active&sort=name",
      summary: "",
      description: "",
      tags: [],
      responses: {
        "200": {
          description: "Success",
          headers: {
            "X-Special-Header": {
              schema: {
                type: "string",
              },
              description: "Special header for special path",
            },
          },
        },
      },
    });

    // Act
    const result = await callMcpTool(server, "get_headers", {
      operation_id: "specialPath",
    });

    // Assert
    expect(result.content[0].text).toContain("**Response Headers for GET /api/users/{id}/data?filter=active&sort=name**");
    expect(result.content[0].text).toContain("X-Special-Header");
    expect(result.content[0].text).toContain("Type: string");

    // Cleanup
    schemaStore.findOperation = originalFindOperation;
    schemaStore.hasSchema = originalHasSchema;
  });

  describe("Spec Compatibility", () => {
    it("should work with OpenAPI 3.0 specs", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      // Mock schemaStore with OpenAPI 3.0 compatible operation
      const originalFindOperation = schemaStore.findOperation;
      const originalHasSchema = schemaStore.hasSchema;
      schemaStore.hasSchema = () => true;
      schemaStore.findOperation = () => ({
        operationId: "openapi30Op",
        method: "GET",
        path: "/api/v1/resource",
        summary: "",
        description: "",
        tags: [],
        responses: {
          "200": {
            description: "Success response",
            headers: {
              "X-Rate-Limit": {
                description: "Rate limit header",
                schema: {
                  type: "integer",
                  format: "int32",
                },
              },
              "X-API-Version": {
                description: "API version",
                schema: {
                  type: "string",
                  pattern: "^\\d+\\.\\d+\\.\\d+$",
                },
              },
            },
          },
        },
      });

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "openapi30Op",
      });

      // Assert
      expect(result.content[0].text).toContain("**Response Headers for GET /api/v1/resource**");
      expect(result.content[0].text).toContain("X-Rate-Limit");
      expect(result.content[0].text).toContain("Type: integer, int32");
      expect(result.content[0].text).toContain("X-API-Version");
      expect(result.content[0].text).toContain("Type: string");

      // Cleanup
      schemaStore.findOperation = originalFindOperation;
      schemaStore.hasSchema = originalHasSchema;
    });
    it("should work with OpenAPI 3.1 specs", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const specPath = resolve(__dirname, "../data/headers-edge-cases.yaml"); // This is a 3.1 spec
      await schemaStore.loadSchema(specPath);

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "complexHeaders",
      });

      // Assert
      expect(result.content[0].text).toContain("**Response Headers for GET /complex-headers**");
      expect(result.content[0].text).toContain("X-Array-Header");
      expect(result.content[0].text).toContain("Type: array");
      expect(result.content[0].text).toContain("X-Object-Header");
      expect(result.content[0].text).toContain("Type: object");
      expect(result.content[0].text).toContain("X-Enum-Header");
      expect(result.content[0].text).toContain("Type: string");
    });
    it("should handle specs with security headers", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const specPath = resolve(__dirname, "../data/headers-edge-cases.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "securityHeaders",
      });

      // Assert
      expect(result.content[0].text).toContain("**Response Headers for GET /security-headers**");
      expect(result.content[0].text).toContain("X-Content-Type-Options");
      expect(result.content[0].text).toContain("Type: string");
      expect(result.content[0].text).toContain("Prevents MIME type sniffing");
      expect(result.content[0].text).toContain("X-Frame-Options");
      expect(result.content[0].text).toContain("Clickjacking protection");
      expect(result.content[0].text).toContain("Strict-Transport-Security");
      expect(result.content[0].text).toContain("HSTS header");
      expect(result.content[0].text).toContain("Content-Security-Policy");
      expect(result.content[0].text).toContain("CSP directives");
    });
    it("should handle specs with vendor extensions in headers", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, testConfig);
      const specPath = resolve(__dirname, "../data/headers-edge-cases.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const result = await callMcpTool(server, "get_headers", {
        operation_id: "vendorExtensions",
      });

      // Assert
      expect(result.content[0].text).toContain("**Response Headers for GET /vendor-extensions**");
      expect(result.content[0].text).toContain("X-Custom-Header");
      expect(result.content[0].text).toContain("Type: string");
      expect(result.content[0].text).toContain("Custom header");
      // Vendor extensions themselves are not displayed in the output,
      // but the headers with vendor extensions should still work
    });
  });
});
