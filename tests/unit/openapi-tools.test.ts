import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";
import { schemaStore } from "@/schema-store.js";
import {
  createTestMcpServer,
  createTestConfig,
  suppressConsole,
  TIMEOUTS,
  isMcpToolRegistered,
  callMcpTool,
} from "@tests/utils/test-helpers.js";

describe("OpenAPI Tools", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe("Tool Registration", () => {
    it("should register all OpenAPI tools without errors", () => {
      const server = createTestMcpServer();
      const config = createTestConfig();

      expect(() => {
        registerOpenAPITools(server, config);
      }).not.toThrow();
    });
  });

  describe("list_operations tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should list all operations without filter",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "list_operations")).toBe(true);

        const result = await callMcpTool(server, "list_operations", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Available API Operations");
        expect(result.content[0].text).toContain("GET /health");
        expect(result.content[0].text).toContain("POST /echo");
        expect(result.content[0].text).toContain("getHealth");
        expect(result.content[0].text).toContain("postEcho");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should filter operations by method",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "list_operations")).toBe(true);

        const result = await callMcpTool(server, "list_operations", { filter: "GET" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("GET /health");
        expect(result.content[0].text).not.toContain("POST /echo");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle no schema loaded",
      async () => {
        // Clear schema store to simulate no loaded spec
        schemaStore.clearSchema();
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "list_operations")).toBe(true);

        const result = await callMcpTool(server, "list_operations", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No OpenAPI Spec Available");
        expect(result.content[0].text).toContain("Mount your OpenAPI file to `/app/spec`");
        expect(result.content[0].text).toContain("No OpenAPI Spec Available");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("get_operation_details tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should get operation details by operation ID",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);

        const result = await callMcpTool(server, "get_operation_details", { operation_id: "getHealth" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Operation: GET /health");
        expect(result.content[0].text).toContain("**Operation ID:** `getHealth`");
        expect(result.content[0].text).toContain("**Summary:** Health check");
        expect(result.content[0].text).toContain("Response Schemas:");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should get operation details by method and path",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);

        const result = await callMcpTool(server, "get_operation_details", { method: "POST", path: "/echo" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Operation: POST /echo");
        expect(result.content[0].text).toContain("**Operation ID:** `postEcho`");
        expect(result.content[0].text).toContain("Request Body Schemas:");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle operation not found",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_operation_details")).toBe(true);

        const result = await callMcpTool(server, "get_operation_details", { operation_id: "nonexistent" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Operation not found: nonexistent");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("get_request_schema tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should get request schema for operation with request body",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_request_schema")).toBe(true);

        const result = await callMcpTool(server, "get_request_schema", { operation_id: "postEcho" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Request Body Schema for POST /echo");
        expect(result.content[0].text).toContain("Content-Type: `application/json`");
        expect(result.content[0].text).toContain('"type": "object"');
        expect(result.content[0].text).toContain('"message"');
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle operation without request body",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_request_schema")).toBe(true);

        const result = await callMcpTool(server, "get_request_schema", { operation_id: "getHealth" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No Request Body");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("get_response_schema tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should get response schemas for operation",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_response_schema")).toBe(true);

        const result = await callMcpTool(server, "get_response_schema", { operation_id: "getHealth" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Schemas for GET /health");
        expect(result.content[0].text).toContain("Status Code: `200`");
        expect(result.content[0].text).toContain("Content-Type: `application/json`");
        expect(result.content[0].text).toContain('"status"');
        expect(result.content[0].text).toContain('"timestamp"');
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should filter by status code",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_response_schema")).toBe(true);

        const result = await callMcpTool(server, "get_response_schema", {
          operation_id: "getHealth",
          status_code: "200",
        });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Status Code: `200`");
        expect(result.content[0].text).not.toContain("Status Code: `400`");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("search_operations tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should search operations by query",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "search_operations")).toBe(true);

        const result = await callMcpTool(server, "search_operations", { query: "health" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Search Results");
        expect(result.content[0].text).toContain("GET /health");
        expect(result.content[0].text).toContain("getHealth");
        expect(result.content[0].text).not.toContain("POST /echo");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should return no results for non-matching query",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "search_operations")).toBe(true);

        const result = await callMcpTool(server, "search_operations", { query: "nonexistent" });

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No Operations Found");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("get_server_info tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any existing schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    afterEach(() => {
      // Clean up schema store
      schemaStore.clearSchema();
    });

    it(
      "should get server information",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_server_info")).toBe(true);

        const result = await callMcpTool(server, "get_server_info", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("API Server Information");
        expect(result.content[0].text).toContain("**API:** Simple Test API v1.0.0");
        expect(result.content[0].text).toContain("- Operations: 2");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle no loaded schema",
      async () => {
        // Clear schema store to simulate no loaded spec
        schemaStore.clearSchema();
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);

        expect(isMcpToolRegistered(server, "get_server_info")).toBe(true);

        const result = await callMcpTool(server, "get_server_info", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No OpenAPI Spec Available");
        expect(result.content[0].text).toContain("Call the `help()` tool");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("Error Handling", () => {
    it(
      "should handle missing schema gracefully",
      async () => {
        // Clear schema store to simulate no loaded spec
        schemaStore.clearSchema();
        const server = createTestMcpServer();
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        expect(isMcpToolRegistered(server, "list_operations")).toBe(true);

        const result = await callMcpTool(server, "list_operations", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No OpenAPI Spec Available");
        expect(result.content[0].text).toContain("Call the `help()` tool");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("help tool", () => {
    it(
      "should provide comprehensive help when spec is loaded",
      async () => {
        // Load a test spec first
        const specPath = resolve(__dirname, "../data/simple-api.yaml");
        await schemaStore.loadSchema(specPath);

        const server = createTestMcpServer();
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        expect(isMcpToolRegistered(server, "help")).toBe(true);

        const result = await callMcpTool(server, "help", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("OpenAPI Context MCP Server Help");
        expect(result.content[0].text).toContain("Currently Loaded:");
        expect(result.content[0].text).toContain("Simple Test API");
        expect(result.content[0].text).toContain("Available Tools");
        expect(result.content[0].text).toContain("Context-Efficient Usage Patterns");
        expect(result.content[0].text).toContain("Pro Tips");

        // Should not show setup instructions when spec is loaded
        expect(result.content[0].text).not.toContain("Setup Instructions (No Spec Loaded)");

        // Clean up
        schemaStore.clearSchema();
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should provide setup instructions when no spec is loaded",
      async () => {
        // Ensure no schema is loaded
        schemaStore.clearSchema();

        const server = createTestMcpServer();
        const config = createTestConfig();
        registerOpenAPITools(server, config);

        expect(isMcpToolRegistered(server, "help")).toBe(true);

        const result = await callMcpTool(server, "help", {});

        expect(result.content).toBeDefined();
        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("OpenAPI Context MCP Server Help");
        expect(result.content[0].text).toContain("⚠️ No OpenAPI Spec Currently Loaded");
        expect(result.content[0].text).toContain("Setup Instructions (No Spec Loaded)");
        expect(result.content[0].text).toContain("MCP Client Configuration");
        expect(result.content[0].text).toContain("/app/spec:ro");
        expect(result.content[0].text).toContain("djankies/openapi-context:latest");
        expect(result.content[0].text).toContain("Troubleshooting:");
        expect(result.content[0].text).toContain("Example Paths:");
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("get_headers tool", () => {
    let testConfig: any;

    beforeEach(async () => {
      // Clear any previous schema
      schemaStore.clearSchema();
      // Create test config
      testConfig = createTestConfig();
      // Load a test spec into schema store
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    it(
      "should return headers for operation by operationId",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        expect(isMcpToolRegistered(server, "get_headers")).toBe(true);

        const result = await callMcpTool(server, "get_headers", {
          operation_id: "listUsers",
        });

        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Response Headers for GET /users");
        expect(result.content[0].text).toContain("X-Rate-Limit");
        expect(result.content[0].text).toContain("X-Request-ID");
        expect(result.content[0].text).toContain("X-Total-Count");
        expect(result.content[0].text).toContain("API rate limit remaining");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should return headers in compact format",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        expect(isMcpToolRegistered(server, "get_headers")).toBe(true);

        const result = await callMcpTool(server, "get_headers", {
          operation_id: "listUsers",
          compact: true,
        });

        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("**X-Rate-Limit** (integer): API rate limit remaining");
        expect(result.content[0].text).toContain("**X-Request-ID** (string, uuid): Unique request identifier");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle operation not found",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        expect(isMcpToolRegistered(server, "get_headers")).toBe(true);

        const result = await callMcpTool(server, "get_headers", {
          operation_id: "nonExistentOperation",
        });

        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("Operation Not Found");
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should handle no headers scenario",
      async () => {
        const server = createTestMcpServer();
        registerOpenAPITools(server, testConfig);
        expect(isMcpToolRegistered(server, "get_headers")).toBe(true);

        const result = await callMcpTool(server, "get_headers", {
          operation_id: "getUser",
        });

        expect(result.content[0].type).toBe("text");
        expect(result.content[0].text).toContain("No headers defined");
      },
      TIMEOUTS.UNIT,
    );
  });
});
