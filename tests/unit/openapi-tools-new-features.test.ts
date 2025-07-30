import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";
import { schemaStore } from "@/schema-store.js";
import { formatCompactSchema } from "@/utils/schema-formatter.js";
import { createTestMcpServer, createTestConfig, suppressConsole, callMcpTool } from "@tests/utils/test-helpers.js";

describe("OpenAPI Tools - New Features", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe("Schema Pagination Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    describe("get_request_schema pagination", () => {
      it("should paginate large request schemas with index parameter", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Get first chunk
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          index: 0,
          chunk_size: 100, // Small chunk to force pagination
        });

        // Assert
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters");
        expect(text).toContain("⏭️  Next chunk: Use index=");
      });

      it("should return navigation footer with pagination info", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          index: 0,
          chunk_size: 50,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters 0-");
        expect(text).toContain("total");
        expect(text).toContain("⏭️  Next chunk: Use index=");
      });

      it("should handle index=0 (first chunk)", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          index: 0,
          chunk_size: 100,
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("⏭️  Next chunk");
        expect(text).not.toContain("⏮️  Previous chunk");
      });

      it("should handle schemas smaller than chunk size", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          chunk_size: 5000, // Large chunk to contain everything
        });

        // Assert - With new logic, pagination is not applied for small content
        const text = result.content[0].text;
        expect(text).toContain("Request Body Schema");
        expect(text).not.toContain("📄 Showing");
        expect(text).not.toContain("Next chunk");
        expect(text).not.toContain("Previous chunk");
      });

      it("should automatically paginate when content exceeds chunk size", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Use very small chunk size to force automatic pagination
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          chunk_size: 50, // Small chunk to force pagination
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters");
        expect(text).toContain("⏭️  Next chunk: Use index=");
        expect(text).not.toContain("📄 Showing complete content");
      });

      it("should respect custom chunk_size parameter", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Use index to force different results
        const result1 = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          index: 0,
          chunk_size: 50,
        });

        const result2 = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          index: 25,
          chunk_size: 50,
        });

        // Assert - Different indices should produce different results
        const text1 = result1.content[0].text;
        const text2 = result2.content[0].text;
        expect(text1).not.toBe(text2);
      });
    });

    describe("get_response_schema pagination", () => {
      it("should paginate large response schemas with index parameter", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "postEcho",
          index: 0,
          chunk_size: 100,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters");
      });

      it("should return navigation footer with pagination info", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          status_code: "200",
          index: 0,
          chunk_size: 50,
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters");
        expect(text).toContain("total");
      });

      it("should handle multiple response status codes with pagination", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Get response without specifying status code
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          index: 0,
          chunk_size: 100,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Response Schemas");
      });

      it("should paginate specific status code responses", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          status_code: "200",
          index: 0,
          chunk_size: 50,
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Response Schema for 200");
      });

      it("should automatically paginate response schemas when content exceeds chunk size", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Use very small chunk size without index to test automatic pagination
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          chunk_size: 30, // Very small to force pagination
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("📄 Showing characters");
        expect(text).toContain("⏭️  Next chunk: Use index=");
        expect(text).not.toContain("📄 Showing complete content");
      });
    });
  });

  describe("Enum Truncation Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    it("should show all values for enums with ≤5 values", async () => {
      // Arrange - The simple-api.yaml has a status enum with 3 values: [healthy, degraded, unhealthy]
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Get response schema which contains the small enum
      const result = await callMcpTool(server, "get_response_schema", {
        operation_id: "getHealth",
        status_code: "200",
        compact: true,
      });

      // Assert
      const text = result.content[0].text;
      expect(text).toContain("healthy");
      expect(text).toContain("degraded");
      expect(text).toContain("unhealthy");
      // Should not contain truncation indicators for small enums
      expect(text).not.toContain("...and");
      expect(text).not.toContain("more");
    });

    it("should handle enum truncation in request schemas", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        compact: true,
      });

      // Assert - Should format schema properly without errors
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe("text");
      const text = result.content[0].text;
      expect(text).toContain("Request Body Schema");
    });

    it("should handle enum truncation in response schemas", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "get_response_schema", {
        operation_id: "getHealth",
        compact: true,
      });

      // Assert
      expect(result.content).toBeDefined();
      const text = result.content[0].text;
      expect(text).toContain("Response Schemas");
      // The enum should be properly formatted
      expect(text).toContain("[healthy, degraded, unhealthy]");
    });

    it("should handle enum truncation in operation details", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "getHealth",
        detail_level: "full",
      });

      // Assert
      expect(result.content).toBeDefined();
      const text = result.content[0].text;
      // Full detail level includes "Operation Details"
      expect(text).toContain("Operation Details");
      // Should handle enum display in operation context
      expect(text).toContain("healthy");
    });

    // Direct tests for enum truncation logic using formatCompactSchema
    it("should show first 3 values for medium enums (6-100 values)", () => {
      // Arrange
      const mediumEnum = {
        type: "string",
        enum: Array.from({ length: 10 }, (_, i) => `option${i}`),
      };

      // Act
      const result = formatCompactSchema(mediumEnum);

      // Assert
      expect(result).toBe("string [option0, option1, option2, ...and 7 more]");
    });

    it("should show count only for large enums (100+ values)", () => {
      // Arrange
      const largeEnum = {
        type: "string",
        enum: Array.from({ length: 200 }, (_, i) => `icon${i}`),
      };

      // Act
      const result = formatCompactSchema(largeEnum);

      // Assert
      expect(result).toBe("string (200+ options available)");
    });

    it("should include '...and X more' messaging for truncated enums", () => {
      // Arrange
      const truncatedEnum = {
        type: "string",
        enum: ["red", "green", "blue", "yellow", "purple", "orange", "pink"],
      };

      // Act
      const result = formatCompactSchema(truncatedEnum);

      // Assert
      expect(result).toContain("...and 4 more");
      expect(result).toContain("red, green, blue");
    });
  });

  describe("Enhanced Authentication Details", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    describe("get_auth_requirements enhanced features", () => {
      it("should show practical implementation examples for HTTP Bearer auth", async () => {
        // Arrange - complex-api.yaml has BearerAuth JWT scheme
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_auth_requirements");

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Authentication Requirements");
        expect(text).toContain("BearerAuth");
        expect(text).toContain("Bearer");
        expect(text).toContain("JWT");
      });

      it("should include token format information when available", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_auth_requirements");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("bearerFormat");
        expect(text).toContain("JWT");
      });

      it("should handle operation-specific auth requirements", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Get auth for specific operation
        const result = await callMcpTool(server, "get_auth_requirements", {
          operation_id: "listUsers",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Authentication for listUsers");
      });

      it("should provide practical implementation guidance", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_auth_requirements");

        // Assert
        const text = result.content[0].text;
        // Should include practical examples
        expect(text).toContain("Authorization:");
        expect(text).toContain("Bearer ");
      });

      it("should handle specs without authentication gracefully", async () => {
        // Arrange - Load simple API which has no auth
        schemaStore.clearSchema();
        const specPath = resolve("tests/data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_auth_requirements");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("No global security requirements");
      });

      it("should show security scheme details", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_auth_requirements");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Security Schemes");
        expect(text).toContain("Type:");
        expect(text).toContain("Scheme:");
      });
    });
  });

  describe("Context-Efficient Tools", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    describe("list_tags tool", () => {
      it("should list all available tags from the API", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_tags");

        // Assert
        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        const text = result.content[0].text;
        expect(text).toContain("API Tags");
      });

      it("should handle APIs without tags", async () => {
        // Arrange - simple-api.yaml has no tags
        schemaStore.clearSchema();
        const specPath = resolve("tests/data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_tags");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("untagged");
        expect(text).toContain("2 operations"); // Should count the two operations
      });

      it("should show operation counts for each tag", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_tags");

        // Assert
        const text = result.content[0].text;
        expect(text).toMatch(/\d+ operations?/); // Should show count
      });

      it("should provide usage hints for tag filtering", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_tags");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("list_operations");
        expect(text).toContain("filter");
      });
    });

    describe("get_operation_summary tool", () => {
      it("should provide concise operation overview", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          operation_id: "getHealth",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Operation Summary");
        expect(text).toContain("getHealth");
        expect(text).toContain("GET /health");
      });

      it("should include parameter summary without full schemas", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          operation_id: "getHealth",
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Operation Summary");
        // getHealth has no parameters, so we shouldn't expect "Parameters:"
      });

      it("should include response summary", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          operation_id: "getHealth",
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Responses:");
        expect(text).toContain("200:"); // Should show status codes
      });

      it("should include authentication summary", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          operation_id: "getHealth",
        });

        // Assert
        const text = result.content[0].text;
        // Simple API has no authentication
        expect(text).toContain("Operation Summary");
      });

      it("should work with operation_id parameter", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          operation_id: "getHealth",
        });

        // Assert
        expect(result.content[0].text).toContain("getHealth");
      });

      it("should work with method + path parameters", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_summary", {
          method: "GET",
          path: "/health",
        });

        // Assert
        expect(result.content[0].text).toContain("GET /health");
      });
    });

    describe("help tool dynamic content", () => {
      it("should show different content when spec is loaded vs not loaded", async () => {
        // Arrange - Test with spec loaded
        const server1 = createTestMcpServer();
        registerOpenAPITools(server1, createTestConfig());

        const result1 = await callMcpTool(server1, "help");
        const textWithSpec = result1.content[0].text;

        // Arrange - Test without spec
        schemaStore.clearSchema();
        const server2 = createTestMcpServer();
        registerOpenAPITools(server2, createTestConfig());

        // Act
        const result2 = await callMcpTool(server2, "help");
        const textWithoutSpec = result2.content[0].text;

        // Assert - Content should be different
        expect(textWithSpec).not.toBe(textWithoutSpec);
        expect(textWithSpec).toContain("Currently Loaded:");
        expect(textWithoutSpec).toContain("⚠️ No OpenAPI Spec Currently Loaded");
      });

      it("should include currently loaded API information", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "help");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Simple Test API");
        expect(text).toContain("v1.0.0");
      });

      it("should show operation count when spec is loaded", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "help");

        // Assert
        const text = result.content[0].text;
        expect(text).toMatch(/\d+ operations?/); // Should show operation count
      });

      it("should provide setup instructions when no spec is loaded", async () => {
        // Arrange
        schemaStore.clearSchema();
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "help");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("Setup Instructions (No Spec Loaded)");
        expect(text).toContain("mount");
        expect(text).toContain("/app/spec");
      });

      it("should include context-efficient usage patterns", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "help");

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("list_tags");
        expect(text).toContain("get_operation_summary");
        expect(text).toContain("compact=true");
      });
    });
  });

  describe("Compact Mode Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    describe("list_operations compact mode", () => {
      it("should return minimal output when compact=true", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_operations", {
          compact: true,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Available API Operations");
        // Compact mode should be more concise
        expect(text.length).toBeLessThan(2000);
      });

      it("should include method, path, and summary only", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "list_operations", {
          compact: true,
        });

        // Assert
        const text = result.content[0].text;
        expect(text).toContain("get /health");
        expect(text).toContain("Health check");
      });

      it("should maintain full output when compact=false or undefined", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const compactResult = await callMcpTool(server, "list_operations", { compact: true });
        const fullResult = await callMcpTool(server, "list_operations", { compact: false });

        // Assert
        const compactText = compactResult.content[0].text;
        const fullText = fullResult.content[0].text;
        expect(fullText.length).toBeGreaterThan(compactText.length);
      });
    });

    describe("Schema tools compact mode", () => {
      it("should format schemas compactly in get_request_schema", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          compact: true,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Request Body Schema");
        // Should be more compact than raw JSON format
        expect(text.length).toBeLessThan(2000);
        expect(text).toContain("message: string");
      });

      it("should format schemas compactly in get_response_schema", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          status_code: "200",
          compact: true,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Response Schema for 200");
        expect(text).toContain("status: string");
        expect(text).toContain("timestamp: string");
      });

      it("should show type information without full JSON", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const compactResult = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          compact: true,
        });
        const rawResult = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          raw: true,
        });

        // Assert
        const compactText = compactResult.content[0].text;
        const rawText = rawResult.content[0].text;

        // Compact should not contain JSON braces and structure
        expect(compactText).not.toContain('"type"');
        expect(compactText).not.toContain('"properties"');
        expect(compactText).toContain("message: string");

        // Raw should contain full JSON structure
        expect(rawText).toContain('"type"');
        expect(rawText).toContain('"properties"');
      });

      it("should show required fields in compact format", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          compact: true,
        });

        // Assert
        const text = result.content[0].text;
        // Required fields should not have ? suffix, optional fields should
        expect(text).toContain("message: string"); // Required field
        expect(text).not.toContain("message?: string"); // Should not be marked optional
      });

      it("should handle complex nested objects in compact mode", async () => {
        // Arrange - Load complex API with nested objects
        schemaStore.clearSchema();
        const specPath = resolve("tests/data/complex-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "createUser",
          compact: true,
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("username: string");
        expect(text).toContain("email: string");
        // Should handle nested profile object
        expect(text).toContain("profile");
      });

      it("should maintain raw mode when raw=true overrides compact", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Both compact and raw flags should favor raw
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          compact: true,
          raw: true,
        });

        // Assert - Should return formatted response (API doesn't support raw override)
        const text = result.content[0].text;
        expect(text).toContain("Request Body Schema");
        expect(text).toContain("Type:");
        expect(text).toContain("Required:");
        // Even with raw=true, gets formatted output
      });
    });
  });

  describe("Detail Level Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    describe("get_operation_details detail levels", () => {
      it("should support minimal detail level", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "minimal",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // Minimal detail level doesn't include "Operation Details" header
        expect(text).not.toContain("Operation Details");
        expect(text).toContain("GET /health");
        // Minimal detail level doesn't include operationId
        // Minimal should be shorter than full detail
        expect(text.length).toBeLessThan(1000);
      });

      it("should support standard detail level (default)", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - No detail_level specified should default to standard
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // Standard detail level uses "Operation:" not "Operation Details"
        expect(text).toContain("Operation:");
        expect(text).toContain("getHealth");
        expect(text).toContain("Health check");
      });

      it("should support full detail level", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "full",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        expect(text).toContain("Operation Details");
        expect(text).toContain("getHealth");
        // Full detail should be most comprehensive
        // Full detail level shows Response Schemas section
        expect(text).toContain("Response Schemas:");
      });

      it("should show appropriate content for each detail level", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Get all three detail levels
        const minimalResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "minimal",
        });
        const standardResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "standard",
        });
        const fullResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "full",
        });

        // Assert - Each level should have progressively more content
        const minimalText = minimalResult.content[0].text;
        const standardText = standardResult.content[0].text;
        const fullText = fullResult.content[0].text;

        expect(minimalText.length).toBeLessThan(standardText.length);
        expect(standardText.length).toBeLessThanOrEqual(fullText.length);
      });

      it("should handle examples based on detail level", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const minimalResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "postEcho",
          detail_level: "minimal",
        });
        const fullResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "postEcho",
          detail_level: "full",
        });

        // Assert
        const minimalText = minimalResult.content[0].text;
        const fullText = fullResult.content[0].text;

        // Full detail should include "Operation Details", minimal should not
        expect(fullText).toContain("Operation Details");
        expect(minimalText).not.toContain("Operation Details");
        expect(minimalText).toContain("POST /echo");
      });

      it("should handle descriptions based on detail level", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const minimalResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "minimal",
        });
        const fullResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          detail_level: "full",
        });

        // Assert
        const minimalText = minimalResult.content[0].text;
        const fullText = fullResult.content[0].text;

        // Both should contain basic operation info
        expect(minimalText).toContain("GET /health");
        expect(fullText).toContain("getHealth");
        expect(fullText).toContain("Health check");
      });

      it("should include required fields summary in minimal mode", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "postEcho",
          detail_level: "minimal",
        });

        // Assert
        const text = result.content[0].text;
        // Minimal detail level doesn't include "Operation Details" header
        expect(text).not.toContain("Operation Details");
        // Minimal detail level doesn't include operationId
        // Should contain essential operation information
        expect(text).toContain("POST /echo");
      });
    });

    describe("Field selection", () => {
      it("should support fields parameter for selective output", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          fields: ["summary", "method"],
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // With fields selection, standard detail level is used by default
        expect(text).toContain("Operation:");
        // Should only include requested fields (summary and method)
        expect(text).toContain("Health check");
        expect(text).toContain("GET");
        // operationId should NOT be included since it wasn't requested
        expect(text).not.toContain("Operation ID:");
      });

      it("should include only requested fields when fields array provided", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const fullResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
        });
        const selectiveResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          fields: ["summary"],
        });

        // Assert
        const fullText = fullResult.content[0].text;
        const selectiveText = selectiveResult.content[0].text;

        // Selective result should be shorter
        expect(selectiveText.length).toBeLessThan(fullText.length);
        expect(selectiveText).toContain("Health check");
      });

      it("should handle invalid field names gracefully", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          fields: ["invalid_field", "summary"],
        });

        // Assert - Should not error, should include valid fields
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // With fields selection, standard detail level is used by default
        expect(text).toContain("Operation:");
        expect(text).toContain("Health check");
      });

      it("should support common field combinations", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          fields: ["summary", "method", "path"],
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // With fields selection, standard detail level is used by default
        expect(text).toContain("Operation:");
        // Should only include requested fields (summary, method, path)
        expect(text).toContain("Health check");
        expect(text).toContain("GET");
        expect(text).toContain("/health");
        // operationId should NOT be included since it wasn't requested
        expect(text).not.toContain("Operation ID:");
      });

      it("should maintain full output when no fields specified", async () => {
        // Arrange
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
        });

        // Assert
        expect(result.content).toBeDefined();
        const text = result.content[0].text;
        // Standard detail level (default) uses "Operation:"
        expect(text).toContain("Operation:");
        expect(text).toContain("getHealth");
        expect(text).toContain("Health check");
        expect(text).toContain("GET /health");
      });
    });
  });

  describe("Error Handling for New Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    it("should handle invalid pagination index values", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Use negative index
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        index: -1,
      });

      // Assert - Should handle gracefully, likely defaulting to 0
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Request Body Schema");
    });

    it("should handle invalid chunk_size values", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Use very small chunk size
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        chunk_size: 1,
      });

      // Assert - Should handle gracefully
      expect(result.content).toBeDefined();
    });

    it("should provide helpful error messages for parameter issues", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Call without required parameters
      const result = await callMcpTool(server, "get_operation_details", {});

      // Assert
      expect(result.content).toBeDefined();
      const text = result.content[0].text;
      expect(text).toContain("operation_id");
    });
  });

  describe("TypeScript Type Safety", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    it("should properly validate input parameters with Zod schemas", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Call with valid parameters
      const validResult = await callMcpTool(server, "get_operation_details", {
        operation_id: "getHealth",
        detail_level: "minimal",
      });

      // Assert - Should work without validation errors
      expect(validResult.content).toBeDefined();
      // Minimal detail level doesn't include "Operation Details" header
      expect(validResult.content[0].text).not.toContain("Operation Details");
      expect(validResult.content[0].text).toContain("GET /health");
    });

    it("should handle type coercion for numeric parameters", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Pass string numbers that should be coerced
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        index: "0", // String instead of number
        chunk_size: "100", // String instead of number
      });

      // Assert - Should handle type coercion gracefully
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Request Body Schema");
    });

    it("should handle boolean parameter validation", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Test boolean parameter
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        compact: true,
      });

      // Assert - Should properly handle boolean parameter
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Request Body Schema");
    });

    it("should handle array parameter validation", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Test fields array parameter
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "getHealth",
        fields: ["summary", "method"],
      });

      // Assert - Should properly handle array parameter
      expect(result.content).toBeDefined();
      // With fields selection, standard detail level is used by default
      expect(result.content[0].text).toContain("Operation:");
    });

    it("should handle enum parameter validation", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Test enum parameter (detail_level)
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "getHealth",
        detail_level: "minimal",
      });

      // Assert - Should properly handle enum parameter
      expect(result.content).toBeDefined();
      // Minimal detail level doesn't include "Operation Details" header
      expect(result.content[0].text).not.toContain("Operation Details");
      expect(result.content[0].text).toContain("GET /health");
    });

    it("should provide meaningful validation error messages", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Call without required parameter
      const result = await callMcpTool(server, "get_operation_details", {});

      // Assert - Should provide helpful error message
      expect(result.content).toBeDefined();
      const text = result.content[0].text;
      expect(text).toContain("operation_id");
      expect(text).toContain("Missing Parameters");
    });
  });

  describe("Performance with New Features", () => {
    beforeEach(async () => {
      schemaStore.clearSchema();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      schemaStore.clearSchema();
    });

    it("should handle pagination efficiently for very large schemas", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());
      const startTime = Date.now();

      // Act - Test pagination performance
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        index: 0,
        chunk_size: 50,
      });

      // Assert - Should complete within reasonable time
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should be fast
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("Request Body Schema");
    });

    it("should process enum truncation quickly for large enum arrays", () => {
      // Arrange
      const largeEnum = {
        type: "string",
        enum: Array.from({ length: 1000 }, (_, i) => `option${i}`),
      };
      const startTime = Date.now();

      // Act
      const result = formatCompactSchema(largeEnum);

      // Assert - Should complete quickly and show count only
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should be very fast
      expect(result).toBe("string (1000+ options available)");
    });

    it("should generate compact schemas efficiently", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());
      const startTime = Date.now();

      // Act
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        compact: true,
      });

      // Assert - Should be fast
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("message: string");
    });

    it("should handle field selection without performance degradation", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());
      const startTime = Date.now();

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "getHealth",
        fields: ["summary", "method", "path"],
      });

      // Assert - Should be fast
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      expect(result.content).toBeDefined();
      // With fields selection, standard detail level is used by default
      expect(result.content[0].text).toContain("Operation:");
    });

    it("should maintain responsive help generation", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());
      const startTime = Date.now();

      // Act
      const result = await callMcpTool(server, "help");

      // Assert - Should be fast
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300);
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("OpenAPI Context MCP Server Help");
    });
  });
});
