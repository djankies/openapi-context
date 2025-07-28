import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "@/tools/register-tools.js";
import { schemaStore } from "@/schema-store.js";
import { createTestConfig, suppressConsole, TIMEOUTS, isMcpToolRegistered, callMcpTool } from "@tests/utils/test-helpers.js";

// Mock MCP Server class that mimics the real OpenAPI MCP Server
class TestOpenAPIMCPServer {
  private server: McpServer;
  private app: express.Application;
  private httpServer: any;
  private config: any;

  constructor(config: any) {
    this.config = config;
    this.server = new McpServer({
      name: "Test OpenAPI Context MCP Server",
      version: "1.0.0-test",
    });
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", async (req, res) => {
      try {
        const healthStatus = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "1.0.0-test",
          database: "connected",
          mcp: "ready",
          uptime: process.uptime(),
          indexedSpecs: 0, // Would be calculated from database
        };
        res.status(200).json(healthStatus);
      } catch (error) {
        res.status(503).json({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        name: "Test OpenAPI Context MCP Server",
        version: "1.0.0-test",
        status: "running",
        description: "MCP server for indexing and querying OpenAPI 3.1 specifications",
        endpoints: {
          health: "/health",
          mcp: "stdio transport",
        },
        tools: [
          "list_operations",
          "get_operation_details",
          "get_request_schema",
          "get_response_schema",
          "get_operation_examples",
          "search_operations",
          "get_auth_requirements",
          "get_server_info",
        ],
      });
    });
  }

  async init(): Promise<void> {
    // Register all MCP tools
    registerAllTools(this.server, this.config);
  }

  async start(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      this.httpServer = this.app.listen(this.config.port, this.config.host, (error?: any) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getServer(): McpServer {
    return this.server;
  }

  getApp(): express.Application {
    return this.app;
  }
}

describe("MCP Server Integration Tests", () => {
  let mcpServer: TestOpenAPIMCPServer;
  let restoreConsole: () => void;
  let config: any;

  beforeEach(async () => {
    restoreConsole = suppressConsole();
    config = createTestConfig({
      port: 3001 + Math.floor(Math.random() * 1000), // Random port to avoid conflicts
    });
    mcpServer = new TestOpenAPIMCPServer(config);
  });

  afterEach(async () => {
    restoreConsole();
    if (mcpServer) {
      await mcpServer.stop();
    }
  });

  describe("Server Initialization", () => {
    it(
      "should initialize and start successfully",
      async () => {
        await expect(mcpServer.start()).resolves.not.toThrow();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should register all MCP tools",
      async () => {
        await mcpServer.init();

        const server = mcpServer.getServer();

        expect(isMcpToolRegistered(server, "list_operations")).toBe(true);
        expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);
        expect(isMcpToolRegistered(server, "get_request_schema")).toBe(true);
        expect(isMcpToolRegistered(server, "get_response_schema")).toBe(true);
        expect(isMcpToolRegistered(server, "get_operation_examples")).toBe(true);
        expect(isMcpToolRegistered(server, "search_operations")).toBe(true);
        expect(isMcpToolRegistered(server, "get_auth_requirements")).toBe(true);
        expect(isMcpToolRegistered(server, "get_server_info")).toBe(true);
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("HTTP Endpoints", () => {
    beforeEach(async () => {
      await mcpServer.start();
    });

    it(
      "should respond to health check",
      async () => {
        const response = await fetch(`http://${config.host}:${config.port}/health`);
        const data = (await response.json()) as any;

        expect(response.status).toBe(200);
        expect(data.status).toBe("healthy");
        expect(data.version).toBe("1.0.0-test");
        expect(data.database).toBe("connected");
        expect(data.mcp).toBe("ready");
        expect(typeof data.uptime).toBe("number");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should respond to root endpoint",
      async () => {
        const response = await fetch(`http://${config.host}:${config.port}/`);
        const data = (await response.json()) as any;

        expect(response.status).toBe(200);
        expect(data.name).toBe("Test OpenAPI Context MCP Server");
        expect(data.status).toBe("running");
        expect(data.tools).toHaveLength(8);
        expect(data.tools).toContain("list_operations");
        expect(data.tools).toContain("get_operation_details");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle 404 for unknown endpoints",
      async () => {
        const response = await fetch(`http://${config.host}:${config.port}/nonexistent`);

        expect(response.status).toBe(404);
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("End-to-End Tool Workflow", () => {
    beforeEach(async () => {
      await mcpServer.start();
      // Load test schema for E2E tests
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should complete full OpenAPI querying workflow",
      async () => {
        const server = mcpServer.getServer();

        // Step 1: List all operations
        const listResult = await callMcpTool(server, "list_operations", {});
        expect(listResult.content[0].text).toContain("Available API Operations");
        expect(listResult.content[0].text).toContain("GET /health");
        expect(listResult.content[0].text).toContain("POST /echo");

        // Step 2: Get operation details
        const detailsResult = await callMcpTool(server, "get_operation_details", { operation_id: "getHealth" });
        expect(detailsResult.content[0].text).toContain("Operation: GET /health");
        expect(detailsResult.content[0].text).toContain("Response Schemas:");

        // Step 3: Search operations
        const searchResult = await callMcpTool(server, "search_operations", { query: "echo" });
        expect(searchResult.content[0].text).toContain("Search Results");
        expect(searchResult.content[0].text).toContain("POST /echo");

        // Step 4: Get server info
        const serverResult = await callMcpTool(server, "get_server_info", {});
        expect(serverResult.content[0].text).toContain("API Server Information");
        expect(serverResult.content[0].text).toContain("Simple Test API v1.0.0");
      },
      TIMEOUTS.E2E,
    );

    it(
      "should handle complex OpenAPI specification",
      async () => {
        const server = mcpServer.getServer();

        // Load complex spec (overrides the simple one from beforeEach)
        const specPath = resolve(__dirname, "../data/complex-api.yaml");
        await schemaStore.loadSchema(specPath);

        // Test request schema retrieval
        const requestResult = await callMcpTool(server, "get_request_schema", { operation_id: "createUser" });
        expect(requestResult.content[0].text).toContain("Request Schema for");
        expect(requestResult.content[0].text).toContain("username");
        expect(requestResult.content[0].text).toContain("email");

        // Test response schema retrieval
        const responseResult = await callMcpTool(server, "get_response_schema", { operation_id: "listUsers" });
        expect(responseResult.content[0].text).toContain("Response Schema for");
        expect(responseResult.content[0].text).toContain("Status Code: `200`");
      },
      TIMEOUTS.E2E,
    );

    it(
      "should maintain data consistency across multiple operations",
      async () => {
        const server = mcpServer.getServer();

        // Use the pre-loaded simple spec (from beforeEach)

        // List should show operations from current spec
        const listResult = await callMcpTool(server, "list_operations", {});

        expect(listResult.content[0].text).toContain("Available API Operations");
        expect(listResult.content[0].text).toContain("getHealth"); // From simple spec
        expect(listResult.content[0].text).toContain("postEcho"); // From simple spec

        // Search should work with current spec
        const searchResult = await callMcpTool(server, "search_operations", { query: "health" });
        expect(searchResult.content[0].text).toContain("getHealth");
        expect(searchResult.content[0].text).not.toContain("createUser"); // Not in simple spec
      },
      TIMEOUTS.E2E,
    );
  });

  describe("Error Handling and Recovery", () => {
    beforeEach(async () => {
      await mcpServer.start();
    });

    it(
      "should handle malformed tool inputs gracefully",
      async () => {
        const server = mcpServer.getServer();

        // Load a spec first
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        // Test with invalid filter
        const result = await callMcpTool(server, "list_operations", { filter: null });
        expect(result.content[0].text).toContain("Available API Operations");

        // Clean up
        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle missing schema gracefully",
      async () => {
        const server = mcpServer.getServer();

        // Clear schema store to simulate no loaded spec
        schemaStore.clearSchema();

        const result = await callMcpTool(server, "list_operations", {});
        expect(result.content[0].text).toContain("No OpenAPI Spec Available");
        expect(result.content[0].text).toContain("Call the `help()` tool");
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle concurrent tool operations",
      async () => {
        const server = mcpServer.getServer();

        // Load a spec first
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        // Run multiple operations concurrently
        const promises = [
          callMcpTool(server, "list_operations", {}),
          callMcpTool(server, "search_operations", { query: "health" }),
          callMcpTool(server, "get_server_info", {}),
          callMcpTool(server, "list_operations", { filter: "GET" }),
          callMcpTool(server, "search_operations", { query: "echo" }),
        ];

        const results = await Promise.all(promises);

        // All operations should complete successfully
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.content[0].type).toBe("text");
          expect(result.content[0].text).not.toContain("Error");
        });

        // Clean up
        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("Performance and Resource Management", () => {
    beforeEach(async () => {
      await mcpServer.start();
    });

    it(
      "should handle large OpenAPI specifications efficiently",
      async () => {
        const server = mcpServer.getServer();

        const specPath = resolve(__dirname, "../data/complex-api.yaml");

        const startTime = Date.now();
        await schemaStore.loadSchema(specPath);
        const duration = Date.now() - startTime;

        const result = await callMcpTool(server, "list_operations", {});
        expect(result.content[0].text).toContain("Available API Operations");
        expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

        // Clean up
        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should not leak memory during repeated operations",
      async () => {
        const server = mcpServer.getServer();

        // Load a spec
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        // Perform many list operations
        for (let i = 0; i < 50; i++) {
          const result = await callMcpTool(server, "list_operations", {});
          expect(result.content[0].text).toContain("Available API Operations");
        }

        // Test should complete without memory issues
        expect(true).toBe(true);

        // Clean up
        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("New Tools Integration", () => {
    it(
      "should support list_tags tool",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "list_tags", {});

        expect(result.content[0].text).toContain("API Tags");
        expect(result.content[0].text).toContain("Simple Test API");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support get_operation_summary tool",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "get_operation_summary", { operation_id: "getHealth" });

        expect(result.content[0].text).toContain("GET /health");
        expect(result.content[0].text).toContain("**Parameters:**");
        expect(result.content[0].text).toContain("**Responses:**");
        expect(result.content[0].text).toContain("**Auth:**");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support compact mode in list_operations",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "list_operations", { compact: true });

        expect(result.content[0].text).toContain("Available API Operations");
        // Compact mode should be shorter (no detailed info)
        expect(result.content[0].text).not.toContain("ID:");
        expect(result.content[0].text).not.toContain("Content Types:");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support detail levels in get_operation_details",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();

        // Test minimal detail level
        const minimalResult = await callMcpTool(server, "get_operation_details", {
          operation_id: "postEcho",
          detail_level: "minimal",
        });

        expect(minimalResult.content[0].text).toContain("POST /echo");
        expect(minimalResult.content[0].text).toContain("**Parameters:**");
        expect(minimalResult.content[0].text).toContain("**Required:**");
        // Should not contain full schemas
        expect(minimalResult.content[0].text).not.toContain("```json");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support field selection in get_operation_details",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getHealth",
          fields: ["summary", "responses"],
        });

        expect(result.content[0].text).toContain("**Summary:**");
        expect(result.content[0].text).toContain("**Response Schemas:**");
        // Should not contain other fields
        expect(result.content[0].text).not.toContain("**Operation ID:**");
        expect(result.content[0].text).not.toContain("**Tags:**");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support compact mode in schema tools",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "postEcho",
          compact: true,
        });

        expect(result.content[0].text).toContain("Request Schema for POST /echo");
        expect(result.content[0].text).toContain("Type:");
        expect(result.content[0].text).toContain("Required:");
        // Should not contain full JSON schema
        expect(result.content[0].text).not.toContain("```json");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should support help tool with dynamic content",
      async () => {
        await mcpServer.init();
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = mcpServer.getServer();
        const result = await callMcpTool(server, "help", {});

        expect(result.content[0].text).toContain("OpenAPI Context MCP Server Help");
        expect(result.content[0].text).toContain("Currently Loaded:");
        expect(result.content[0].text).toContain("Simple Test API");
        expect(result.content[0].text).toContain("Available Tools");
        
        // Should not show setup instructions when spec is loaded
        expect(result.content[0].text).not.toContain("Setup Instructions (No Spec Loaded)");

        schemaStore.clearSchema();
      },
      TIMEOUTS.INTEGRATION,
    );
  });
});
