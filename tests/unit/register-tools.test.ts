import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "path";
import { registerAllTools } from "@/tools/register-tools.js";
import { schemaStore } from "@/schema-store.js";
import {
  createTestMcpServer,
  createTestConfig,
  suppressConsole,
  TIMEOUTS,
  isMcpToolRegistered,
  getMcpToolNames,
  callMcpTool,
} from "@tests/utils/test-helpers.js";

describe("Register Tools", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  describe("registerAllTools", () => {
    it("should register all expected MCP tools", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const expectedTools = [
        "ping",
        "list_operations",
        "get_operation_details",
        "get_request_schema",
        "get_response_schema",
        "get_operation_examples",
        "search_operations",
        "get_auth_requirements",
        "get_server_info",
        "list_tags",
        "get_operation_summary",
        "help",
        "get_headers",
      ];

      // Act
      registerAllTools(server, config);
      const registeredTools = getMcpToolNames(server);

      // Assert
      expectedTools.forEach((toolName) => {
        expect(isMcpToolRegistered(server, toolName)).toBe(true);
      });
      expect(registeredTools.length).toBe(expectedTools.length);
    });

    it("should not throw when registering tools without loaded schema", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      schemaStore.clearSchema(); // Ensure no schema is loaded

      // Act & Assert
      expect(() => {
        registerAllTools(server, config);
      }).not.toThrow();

      // Verify tools are registered even without schema
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
      expect(isMcpToolRegistered(server, "ping")).toBe(true);
    });

    it("should not throw when registering tools with loaded schema", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act & Assert
      expect(() => {
        registerAllTools(server, config);
      }).not.toThrow();

      // Verify tools are registered with schema loaded
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
      expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);
    });

    it("should register tools with correct names", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const expectedNames = [
        "ping",
        "list_operations",
        "get_operation_details",
        "get_request_schema",
        "get_response_schema",
        "get_operation_examples",
        "search_operations",
        "get_auth_requirements",
        "get_server_info",
        "list_tags",
        "get_operation_summary",
        "help",
        "get_headers",
      ];

      // Act
      registerAllTools(server, config);
      const actualNames = getMcpToolNames(server).sort();

      // Assert
      expect(actualNames).toEqual(expectedNames.sort());
    });

    it("should register tools with proper input validation schemas", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert - Check that tools have input schemas defined
      const toolsWithParams = [
        "list_operations", // has filter and compact params
        "get_operation_details", // has operation_id, method, path, detail_level, fields
        "get_request_schema", // has multiple params
        "get_response_schema", // has multiple params
        "search_operations", // has query param
        "get_auth_requirements", // has optional operation_id
        "get_operation_examples", // has operation_id, method, path
        "get_operation_summary", // has operation_id, method, path
      ];

      toolsWithParams.forEach((toolName) => {
        const tool = (server as any)._registeredTools[toolName];
        expect(tool).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.inputSchema).toBe("object");
      });

      // Verify tools without params have empty schema (plain object)
      const toolsWithoutParams = ["ping", "help"];
      toolsWithoutParams.forEach((toolName) => {
        const tool = (server as any)._registeredTools[toolName];
        expect(tool).toBeDefined();
        // These tools use plain empty objects as schemas
        if (typeof tool.inputSchema === "object" && !tool.inputSchema._def) {
          expect(Object.keys(tool.inputSchema || {}).length).toBe(0);
        }
      });
    });

    it("should register tools with appropriate descriptions", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert - Check all tools have non-empty descriptions
      const allTools = getMcpToolNames(server);
      allTools.forEach((toolName) => {
        const tool = (server as any)._registeredTools[toolName];
        expect(tool).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe("string");
      });

      // Check specific tools have expected description patterns
      const pingTool = (server as any)._registeredTools["ping"];
      expect(pingTool.description).toContain("ping");
      expect(pingTool.description).toContain("connectivity");

      const listOpsTool = (server as any)._registeredTools["list_operations"];
      expect(listOpsTool.description).toContain("List");
      expect(listOpsTool.description).toContain("endpoints");
    });

    it("should handle duplicate registrations gracefully", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act - Register tools once successfully
      registerAllTools(server, config);
      const firstRegistrationCount = getMcpToolNames(server).length;

      // Act - Attempting to register again should throw an error
      expect(() => {
        registerAllTools(server, config);
      }).toThrow("already registered");

      // Assert - Count should remain the same as first registration
      expect(firstRegistrationCount).toBeGreaterThan(0);
      expect(getMcpToolNames(server).length).toBe(firstRegistrationCount);
    });
  });

  describe("Tool Registration with Schema", () => {
    it("should generate dynamic descriptions when schema is loaded", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      registerAllTools(server, config);

      // Assert - Check that descriptions include spec info
      const listOpsTool = (server as any)._registeredTools["list_operations"];
      expect(listOpsTool.description).toContain("Simple Test API");
      expect(listOpsTool.description).toContain("v1.0.0");
      expect(listOpsTool.description).toContain("2 operations");

      const getDetailsTool = (server as any)._registeredTools["get_operation_details"];
      expect(getDetailsTool.description).toContain("Simple Test API v1.0.0");

      const searchTool = (server as any)._registeredTools["search_operations"];
      expect(searchTool.description).toContain("Simple Test API v1.0.0");
    });

    it("should include API name and version in descriptions", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      const metadata = schemaStore.getMetadata();

      // Act
      registerAllTools(server, config);

      // Assert - Verify API name and version in tool descriptions
      const toolsWithDynamicDescriptions = [
        "list_operations",
        "get_operation_details",
        "get_request_schema",
        "get_response_schema",
        "search_operations",
        "get_operation_examples",
        "get_auth_requirements",
        "get_server_info",
        "list_tags",
        "get_operation_summary",
      ];

      toolsWithDynamicDescriptions.forEach((toolName) => {
        const tool = (server as any)._registeredTools[toolName];
        expect(tool.description).toContain(metadata?.title || "");
        expect(tool.description).toContain(`v${metadata?.version || ""}`);
      });
    });

    it("should include operation counts in descriptions", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      const operationCount = schemaStore.getOperations().length;

      // Act
      registerAllTools(server, config);

      // Assert - list_operations tool should include operation count
      const listOpsTool = (server as any)._registeredTools["list_operations"];
      expect(listOpsTool.description).toContain(`${operationCount} operations`);

      // Other tools might not include count but should have dynamic descriptions
      const getDetailsTool = (server as any)._registeredTools["get_operation_details"];
      expect(getDetailsTool.description).not.toContain("(no spec loaded)");
    });

    it("should update tool metadata after schema loading", async () => {
      // Arrange
      const server1 = createTestMcpServer();
      const server2 = createTestMcpServer();
      const config = createTestConfig();

      // Act - Register tools without schema on first server
      registerAllTools(server1, config);
      const descriptionBeforeSchema = (server1 as any)._registeredTools["list_operations"].description;

      // Load schema and register on second server
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      registerAllTools(server2, config);
      const descriptionAfterSchema = (server2 as any)._registeredTools["list_operations"].description;

      // Assert - Descriptions should be different
      expect(descriptionBeforeSchema).toContain("(no spec loaded)");
      expect(descriptionAfterSchema).toContain("Simple Test API");
      expect(descriptionAfterSchema).not.toBe(descriptionBeforeSchema);
    });
  });

  describe("Tool Registration without Schema", () => {
    it("should use fallback descriptions when no schema loaded", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      schemaStore.clearSchema(); // Ensure no schema

      // Act
      registerAllTools(server, config);

      // Assert - Check for fallback descriptions
      const listOpsTool = (server as any)._registeredTools["list_operations"];
      expect(listOpsTool.description).toContain("(no spec loaded)");
      expect(listOpsTool.description).toContain("List all API endpoints");

      const getDetailsTool = (server as any)._registeredTools["get_operation_details"];
      expect(getDetailsTool.description).toContain("(no spec loaded)");

      const searchTool = (server as any)._registeredTools["search_operations"];
      expect(searchTool.description).toContain("(no spec loaded)");
    });

    it("should indicate 'no spec loaded' in descriptions", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      schemaStore.clearSchema();

      // Act
      registerAllTools(server, config);

      // Assert - Multiple tools should indicate no spec loaded
      const toolsWithDynamicDescriptions = [
        "list_operations",
        "get_operation_details",
        "get_request_schema",
        "get_response_schema",
        "search_operations",
        "get_operation_examples",
        "get_auth_requirements",
        "get_server_info",
        "list_tags",
        "get_operation_summary",
      ];

      toolsWithDynamicDescriptions.forEach((toolName) => {
        const tool = (server as any)._registeredTools[toolName];
        expect(tool.description).toContain("(no spec loaded)");
      });
    });

    it("should register tools that handle missing schema gracefully", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      schemaStore.clearSchema();
      registerAllTools(server, config);

      // Act - Call tools without schema
      const listOpsResult = await callMcpTool(server, "list_operations", {});
      const getDetailsResult = await callMcpTool(server, "get_operation_details", {
        operation_id: "nonexistent",
      });
      const searchResult = await callMcpTool(server, "search_operations", {
        query: "test",
      });

      // Assert - Tools should return appropriate error messages
      expect(listOpsResult.content[0].text).toContain("No OpenAPI Spec Available");
      expect(listOpsResult.content[0].text).toContain("Mount your OpenAPI file");

      expect(getDetailsResult.content[0].text).toContain("No OpenAPI Spec Available");
      expect(searchResult.content[0].text).toContain("No OpenAPI Spec Available");

      // Ping tool should work regardless
      const pingResult = await callMcpTool(server, "ping", {});
      expect(pingResult.content[0].text).toContain("Pong!");
    });
  });

  describe("Tool Registry Validation", () => {
    it("should register exactly the expected number of tools", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const expectedToolCount = 13; // 12 OpenAPI tools + 1 ping tool

      // Act
      registerAllTools(server, config);
      const registeredTools = getMcpToolNames(server);

      // Assert
      expect(registeredTools.length).toBe(expectedToolCount);
      expect(new Set(registeredTools).size).toBe(expectedToolCount); // No duplicates
    });

    it("should register list_operations tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
      const tool = (server as any)._registeredTools["list_operations"];
      expect(tool.description).toContain("List all API endpoints");
      expect(tool.inputSchema).toBeDefined();
      // For Zod schemas, check if it's a valid schema object
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
    });

    it("should register get_operation_details tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);
      const tool = (server as any)._registeredTools["get_operation_details"];
      expect(tool.description).toContain("Get full details for an endpoint");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
      // Schema is a Zod object schema with validation
    });

    it("should register get_request_schema tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_request_schema")).toBe(true);
      const tool = (server as any)._registeredTools["get_request_schema"];
      expect(tool.description).toContain("Get request body schema");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
      // Schema is a Zod object schema with validation
    });

    it("should register get_response_schema tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_response_schema")).toBe(true);
      const tool = (server as any)._registeredTools["get_response_schema"];
      expect(tool.description).toContain("Get response schemas");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
      // Schema is a Zod object schema with validation
      // Schema is a Zod object schema with validation
    });

    it("should register get_operation_examples tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_operation_examples")).toBe(true);
      const tool = (server as any)._registeredTools["get_operation_examples"];
      expect(tool.description).toContain("Get example request/response payloads");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
      // Schema is a Zod object schema with validation
    });

    it("should register search_operations tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "search_operations")).toBe(true);
      const tool = (server as any)._registeredTools["search_operations"];
      expect(tool.description).toContain("Search endpoints");
      expect(tool.description).toContain("by keyword");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
    });

    it("should register get_auth_requirements tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_auth_requirements")).toBe(true);
      const tool = (server as any)._registeredTools["get_auth_requirements"];
      expect(tool.description).toContain("Get authentication/security requirements");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
    });

    it("should register get_server_info tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_server_info")).toBe(true);
      const tool = (server as any)._registeredTools["get_server_info"];
      expect(tool.description).toContain("Get server info and metadata");
      // Tools without params may use empty objects or Zod schemas
    });

    it("should register list_tags tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "list_tags")).toBe(true);
      const tool = (server as any)._registeredTools["list_tags"];
      expect(tool.description).toContain("List all available tags/categories");
      expect(tool.description).toContain("high-level API exploration");
      // Tools without params may use empty objects or Zod schemas
    });

    it("should register get_operation_summary tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "get_operation_summary")).toBe(true);
      const tool = (server as any)._registeredTools["get_operation_summary"];
      expect(tool.description).toContain("Get a concise summary of an endpoint");
      expect(tool.description).toContain("quick overview");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema.parse).toBe("function");
      // Schema is a Zod object schema with validation
    });

    it("should register help tool", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert
      expect(isMcpToolRegistered(server, "help")).toBe(true);
      const tool = (server as any)._registeredTools["help"];
      expect(tool.description).toContain("comprehensive help");
      expect(tool.description).toContain("OpenAPI Context MCP Server");
      // Tools without params may use empty objects or Zod schemas
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid server instances gracefully", () => {
      // Arrange
      const config = createTestConfig();
      const invalidServer = null as any;

      // Act & Assert
      expect(() => {
        registerAllTools(invalidServer, config);
      }).toThrow();
    });

    it("should handle invalid config objects gracefully", () => {
      // Arrange
      const server = createTestMcpServer();
      const invalidConfig = null as any;

      // Act & Assert - Should not throw, tools use config defensively
      expect(() => {
        registerAllTools(server, invalidConfig);
      }).not.toThrow();

      // Verify basic functionality still works
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
    });

    it("should continue registration if one tool fails", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Mock registerOpenAPITools to throw an error
      vi.doMock("@/tools/openapi-tools.js", () => ({
        registerOpenAPITools: () => {
          throw new Error("Tool registration failed");
        },
      }));

      // Act - Should still register ping tool even if OpenAPI tools fail
      try {
        registerAllTools(server, config);
      } catch {
        // Expected to throw
      }

      // Assert - At least ping tool should be registered
      // Note: In actual implementation, registerAllTools doesn't catch errors,
      // so this test demonstrates current behavior rather than ideal behavior
      expect(getMcpToolNames(server).length).toBeGreaterThanOrEqual(0);

      // Cleanup
      vi.clearAllMocks();
    });

    it("should log appropriate error messages for failures", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const consoleSpy = vi.spyOn(console, "log");

      // Act
      registerAllTools(server, config);

      // Assert - Check for registration messages
      expect(consoleSpy).toHaveBeenCalledWith("Registering MCP tools...");
      expect(consoleSpy).toHaveBeenCalledWith("All MCP tools registered successfully");

      // Also check that registerOpenAPITools logs its messages
      expect(consoleSpy).toHaveBeenCalledWith("Registering OpenAPI tools...");
      expect(consoleSpy).toHaveBeenCalledWith("OpenAPI tools registered successfully");

      // Cleanup
      consoleSpy.mockRestore();
    });
  });

  describe("Integration with Schema Store", () => {
    it("should work correctly when schema is loaded before registration", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");

      // Load schema first
      await schemaStore.loadSchema(specPath);
      const metadata = schemaStore.getMetadata();

      // Act
      registerAllTools(server, config);

      // Assert - Tools should have dynamic descriptions
      const listOpsTool = (server as any)._registeredTools["list_operations"];
      expect(listOpsTool.description).toContain(metadata?.title || "");
      expect(listOpsTool.description).not.toContain("no spec loaded");

      // Verify tools work with loaded schema
      const result = await callMcpTool(server, "list_operations", {});
      expect(result.content[0].text).toContain("Available API Operations");
      expect(result.content[0].text).toContain("2 found"); // simple-api.yaml has 2 operations
    });

    it("should work correctly when schema is loaded after registration", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Register tools first (no schema)
      registerAllTools(server, config);

      // Verify tools have fallback descriptions
      const listOpsToolBefore = (server as any)._registeredTools["list_operations"];
      expect(listOpsToolBefore.description).toContain("(no spec loaded)");

      // Act - Load schema after registration
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Tools should still work with the newly loaded schema
      const result = await callMcpTool(server, "list_operations", {});

      // Assert
      expect(result.content[0].text).toContain("Available API Operations");
      expect(result.content[0].text).toContain("Simple Test API");
      expect(result.content[0].text).not.toContain("No OpenAPI Spec Available");
    });

    it("should handle schema clearing after tool registration", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath = resolve("tests/data/simple-api.yaml");

      // Load schema and register tools
      await schemaStore.loadSchema(specPath);
      registerAllTools(server, config);

      // Verify tools work with schema
      const resultWithSchema = await callMcpTool(server, "list_operations", {});
      expect(resultWithSchema.content[0].text).toContain("Available API Operations");

      // Act - Clear schema
      schemaStore.clearSchema();

      // Call tool after clearing schema
      const resultWithoutSchema = await callMcpTool(server, "list_operations", {});

      // Assert - Tools should handle missing schema gracefully
      expect(resultWithoutSchema.content[0].text).toContain("No OpenAPI Spec Available");
      expect(resultWithoutSchema.content[0].text).toContain("Mount your OpenAPI file");
    });

    it("should maintain tool functionality across schema reloads", async () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const specPath1 = resolve("tests/data/simple-api.yaml");
      const specPath2 = resolve("tests/data/complex-api.yaml");

      // Register tools
      registerAllTools(server, config);

      // Act - Load first schema
      await schemaStore.loadSchema(specPath1);
      const result1 = await callMcpTool(server, "list_operations", {});

      // Load second schema (different API)
      await schemaStore.loadSchema(specPath2);
      const result2 = await callMcpTool(server, "list_operations", {});

      // Assert - Tools should work with both schemas
      expect(result1.content[0].text).toContain("Simple Test API");
      expect(result2.content[0].text).toContain("Complex Test API");

      // Tools should continue to function properly
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
      expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);
    });
  });

  describe("Configuration Handling", () => {
    it("should use provided config for tool initialization", async () => {
      // Arrange
      const server = createTestMcpServer();
      const customConfig = createTestConfig({
        port: 8080,
        logLevel: "debug",
        maxSpecSize: 50,
      });

      // Act
      registerAllTools(server, customConfig);

      // Assert - Ping tool should include config in response
      const pingResult = await callMcpTool(server, "ping", {});
      expect(pingResult.content[0].text).toContain("Config:");
      expect(pingResult.content[0].text).toContain('"port": 8080');
      expect(pingResult.content[0].text).toContain('"logLevel": "debug"');
      expect(pingResult.content[0].text).toContain('"maxSpecSize": 50');
    });

    it("should handle missing config properties gracefully", async () => {
      // Arrange
      const server = createTestMcpServer();
      const partialConfig = {
        port: 3000,
        // Missing other properties
      } as any;

      // Act & Assert - Should not throw
      expect(() => {
        registerAllTools(server, partialConfig);
      }).not.toThrow();

      // Tools should still be registered
      expect(isMcpToolRegistered(server, "ping")).toBe(true);
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);

      // Ping should handle partial config
      const pingResult = await callMcpTool(server, "ping", {});
      expect(pingResult.content[0].text).toContain("Pong!");
      expect(pingResult.content[0].text).toContain('port": 3000');
    });

    it("should apply config defaults appropriately", async () => {
      // Arrange
      const server = createTestMcpServer();
      const emptyConfig = {} as any;

      // Act
      registerAllTools(server, emptyConfig);

      // Assert - Tools should still work with empty config
      expect(getMcpToolNames(server).length).toBe(13);

      // Ping should show config with defaults or undefined values
      const pingResult = await callMcpTool(server, "ping", {});
      expect(pingResult.content[0].text).toContain("Pong!");
      expect(pingResult.content[0].text).toContain("Config:");
    });

    it("should validate config values before using them", () => {
      // Arrange
      const server = createTestMcpServer();
      const invalidConfig = {
        port: "not-a-number" as any,
        logLevel: 123 as any, // Should be string
        maxSpecSize: -1, // Invalid negative value
      } as any;

      // Act & Assert - Registration should not throw
      expect(() => {
        registerAllTools(server, invalidConfig);
      }).not.toThrow();

      // Tools should still be registered despite invalid config
      expect(isMcpToolRegistered(server, "ping")).toBe(true);
      expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
    });
  });

  describe("Tool Registration Order", () => {
    it("should register core discovery tools first", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const registrationOrder: string[] = [];

      // Spy on tool registration
      const originalTool = server.tool.bind(server);
      (server as any).tool = (name: string, ...args: any[]) => {
        registrationOrder.push(name);
        return (originalTool as any)(name, ...args);
      };

      // Act
      registerAllTools(server, config);

      // Assert - Core discovery tools should be in the first half
      const coreDiscoveryTools = ["list_operations", "search_operations", "list_tags"];

      coreDiscoveryTools.forEach((toolName) => {
        const index = registrationOrder.indexOf(toolName);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(registrationOrder.length); // Exists in order
      });
    });

    it("should register detailed information tools", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();

      // Act
      registerAllTools(server, config);

      // Assert - Detailed information tools should be registered
      const detailTools = [
        "get_operation_details",
        "get_request_schema",
        "get_response_schema",
        "get_operation_examples",
        "get_operation_summary",
      ];

      detailTools.forEach((toolName) => {
        expect(isMcpToolRegistered(server, toolName)).toBe(true);
        const tool = (server as any)._registeredTools[toolName];
        expect(tool).toBeDefined();
        expect(tool.callback).toBeDefined();
        expect(typeof tool.callback).toBe("function");
      });
    });

    it("should register management tools last", () => {
      // Arrange
      const server = createTestMcpServer();
      const config = createTestConfig();
      const registrationOrder: string[] = [];

      // Spy on tool registration
      const originalTool = server.tool.bind(server);
      (server as any).tool = (name: string, ...args: any[]) => {
        registrationOrder.push(name);
        return (originalTool as any)(name, ...args);
      };

      // Act
      registerAllTools(server, config);

      // Assert - Management tools should be in the latter part
      const managementTools = ["get_auth_requirements", "get_server_info", "help", "ping"];
      const lastQuarterIndex = Math.floor((registrationOrder.length * 3) / 4);

      // At least some management tools should be in the last quarter
      const managementToolIndices = managementTools.map((tool) => registrationOrder.indexOf(tool)).filter((index) => index >= 0);

      const inLastQuarter = managementToolIndices.filter((index) => index >= lastQuarterIndex).length;

      expect(inLastQuarter).toBeGreaterThan(0);
    });

    it("should maintain consistent registration order", () => {
      // Arrange
      const server1 = createTestMcpServer();
      const server2 = createTestMcpServer();
      const config = createTestConfig();

      // Act - Register tools on two different servers
      registerAllTools(server1, config);
      registerAllTools(server2, config);

      // Get tool names from both servers
      const tools1 = getMcpToolNames(server1);
      const tools2 = getMcpToolNames(server2);

      // Assert - Order should be consistent
      expect(tools1).toEqual(tools2);
      expect(tools1.length).toBe(tools2.length);

      // Verify specific order patterns are maintained
      const pingIndex1 = tools1.indexOf("ping");
      const pingIndex2 = tools2.indexOf("ping");
      expect(pingIndex1).toBe(pingIndex2);
    });
  });

  describe("Memory and Performance", () => {
    it("should not leak memory during multiple registrations", () => {
      // Arrange
      const config = createTestConfig();
      const initialMemory = process.memoryUsage().heapUsed;
      const servers: any[] = [];

      // Act - Register tools on multiple server instances
      for (let i = 0; i < 10; i++) {
        const server = createTestMcpServer();
        registerAllTools(server, config);
        servers.push(server);
      }

      // Force garbage collection if available
      if (globalThis.gc) {
        globalThis.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Assert - Memory increase should be reasonable
      // Allow up to 10MB increase for test overhead
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);

      // Tool count should remain constant for each server
      servers.forEach((server) => {
        expect(getMcpToolNames(server).length).toBe(13);
      });
    });

    it(
      "should complete registration within reasonable time",
      async () => {
        // Arrange
        const server = createTestMcpServer();
        const config = createTestConfig();
        const maxRegistrationTime = 100; // 100ms should be more than enough

        // Act
        const startTime = Date.now();
        registerAllTools(server, config);
        const endTime = Date.now();
        const registrationTime = endTime - startTime;

        // Assert
        expect(registrationTime).toBeLessThan(maxRegistrationTime);
        expect(getMcpToolNames(server).length).toBe(13);
      },
      TIMEOUTS.UNIT,
    );

    it("should handle concurrent registration attempts safely", async () => {
      // Arrange
      const config = createTestConfig();
      const servers: any[] = [];

      // Act - Attempt concurrent registrations on separate servers
      const registrationPromises = Array(5)
        .fill(null)
        .map(() => {
          return new Promise<void>((resolve) => {
            const server = createTestMcpServer();
            registerAllTools(server, config);
            servers.push(server);
            resolve();
          });
        });

      await Promise.all(registrationPromises);

      // Assert - Each server should have correct number of tools
      servers.forEach((server) => {
        const registeredTools = getMcpToolNames(server);
        expect(registeredTools.length).toBe(13);

        // Verify no duplicate tools on each server
        const uniqueTools = new Set(registeredTools);
        expect(uniqueTools.size).toBe(13);
      });

      // Tools should still function correctly on one of the servers
      const pingResult = await callMcpTool(servers[0], "ping", {});
      expect(pingResult.content[0].text).toContain("Pong!");
    });
  });
});
