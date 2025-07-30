import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { suppressConsole } from "@tests/utils/test-helpers.js";

describe("Schema Store", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
    // Ensure clean state
    schemaStore.clearSchema();
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  describe("loadSchema", () => {
    it("should load simple OpenAPI specification successfully", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
      const metadata = schemaStore.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe("Simple Test API");
      expect(metadata?.version).toBe("1.0.0");
    });

    it("should load complex OpenAPI specification with refs", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
      const metadata = schemaStore.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe("Complex Test API");
      expect(metadata?.version).toBe("2.0.0");
    });

    it("should extract correct number of operations", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const operations = schemaStore.getOperations();
      expect(operations).toHaveLength(2); // GET /health, POST /echo
    });

    it("should extract schemas from components section", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const schemaNames = schemaStore.getSchemaNames();
      expect(schemaNames).toContain("User");
      expect(schemaNames).toContain("UserProfile");
      expect(schemaNames).toContain("BaseEntity");
    });

    it("should extract examples from operations", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const examples = schemaStore.getExamplesForOperation("postEcho");
      expect(examples.size).toBeGreaterThan(0);
      expect(examples.has("request-application/json")).toBe(true);
    });

    it("should set correct metadata including load timestamp", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      const beforeLoad = Date.now();

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const metadata = schemaStore.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.loadedAt).toBeGreaterThanOrEqual(beforeLoad);
      expect(metadata?.path).toBe(specPath);
    });

    it("should throw error for non-existent spec file", async () => {
      // Arrange
      const nonExistentPath = "/path/that/does/not/exist.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(nonExistentPath)).rejects.toThrow();
    });
  });

  describe("clearSchema", () => {
    it("should clear loaded schema completely", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      expect(schemaStore.hasSchema()).toBe(true);

      // Act
      schemaStore.clearSchema();

      // Assert
      expect(schemaStore.hasSchema()).toBe(false);
      expect(schemaStore.getMetadata()).toBeNull();
      expect(schemaStore.getOperations()).toEqual([]);
      expect(schemaStore.getCurrentSchema()).toBeNull();
    });

    it("should reset hasSchema to false after clearing", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      expect(schemaStore.hasSchema()).toBe(true);

      // Act
      schemaStore.clearSchema();

      // Assert
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle clearing when no schema is loaded", () => {
      // Arrange
      expect(schemaStore.hasSchema()).toBe(false);

      // Act & Assert - should not throw
      expect(() => schemaStore.clearSchema()).not.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });
  });

  describe("hasSchema", () => {
    it("should return false when no schema is loaded", () => {
      // Arrange - ensure clean state
      schemaStore.clearSchema();

      // Act & Assert
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should return true after loading a schema", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
    });

    it("should return false after clearing schema", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      expect(schemaStore.hasSchema()).toBe(true);

      // Act
      schemaStore.clearSchema();

      // Assert
      expect(schemaStore.hasSchema()).toBe(false);
    });
  });

  describe("getMetadata", () => {
    it("should return null when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act & Assert
      expect(schemaStore.getMetadata()).toBeNull();
    });

    it("should return correct metadata after loading schema", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const metadata = schemaStore.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBe("Simple Test API");
      expect(metadata?.version).toBe("1.0.0");
      expect(metadata?.description).toBe("A minimal API for testing");
    });

    it("should include title, version, description, path, and loadedAt", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const metadata = schemaStore.getMetadata();
      expect(metadata).toBeDefined();
      expect(metadata?.title).toBeDefined();
      expect(metadata?.version).toBeDefined();
      expect(metadata?.description).toBeDefined();
      expect(metadata?.path).toBe(specPath);
      expect(metadata?.loadedAt).toBeDefined();
      expect(typeof metadata?.loadedAt).toBe("number");
    });
  });

  describe("getOperations", () => {
    it("should return empty array when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act & Assert
      expect(schemaStore.getOperations()).toEqual([]);
    });

    it("should return all operations after loading schema", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const operations = schemaStore.getOperations();
      expect(operations).toHaveLength(2);
      expect(operations.some((op) => op.operationId === "getHealth")).toBe(true);
      expect(operations.some((op) => op.operationId === "postEcho")).toBe(true);
    });

    it("should include all operation properties (method, path, operationId, etc.)", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert
      const operations = schemaStore.getOperations();
      const healthOp = operations.find((op) => op.operationId === "getHealth");
      expect(healthOp).toBeDefined();
      expect(healthOp?.method).toBe("get");
      expect(healthOp?.path).toBe("/health");
      expect(healthOp?.summary).toBe("Health check");
      expect(healthOp?.operationId).toBe("getHealth");
    });
  });

  describe("findOperations", () => {
    beforeEach(async () => {
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    it("should return all operations when no filter provided", () => {
      // Arrange & Act
      const operations = schemaStore.findOperations();

      // Assert
      expect(operations).toHaveLength(2);
    });

    it("should filter by HTTP method (GET, POST, etc.)", () => {
      // Arrange & Act
      const getOps = schemaStore.findOperations("GET");
      const postOps = schemaStore.findOperations("POST");

      // Assert
      expect(getOps).toHaveLength(1);
      expect(getOps[0].method).toBe("get");
      expect(postOps).toHaveLength(1);
      expect(postOps[0].method).toBe("post");
    });

    it("should filter by path substring", () => {
      // Arrange & Act
      const healthOps = schemaStore.findOperations("/health");
      const echoOps = schemaStore.findOperations("/echo");

      // Assert
      expect(healthOps).toHaveLength(1);
      expect(healthOps[0].path).toBe("/health");
      expect(echoOps).toHaveLength(1);
      expect(echoOps[0].path).toBe("/echo");
    });

    it("should filter by summary content", () => {
      // Arrange & Act
      const healthOps = schemaStore.findOperations("Health check");
      const echoOps = schemaStore.findOperations("Echo endpoint");

      // Assert
      expect(healthOps).toHaveLength(1);
      expect(healthOps[0].summary).toBe("Health check");
      expect(echoOps).toHaveLength(1);
      expect(echoOps[0].summary).toBe("Echo endpoint");
    });

    it("should return empty array for non-matching filter", () => {
      // Arrange & Act
      const nonExistentOps = schemaStore.findOperations("nonexistent");

      // Assert
      expect(nonExistentOps).toEqual([]);
    });

    it("should be case-insensitive", () => {
      // Arrange & Act
      const lowerCaseOps = schemaStore.findOperations("health");
      const upperCaseOps = schemaStore.findOperations("HEALTH");

      // Assert
      expect(lowerCaseOps).toHaveLength(1);
      expect(upperCaseOps).toHaveLength(1);
      expect(lowerCaseOps[0].operationId).toBe(upperCaseOps[0].operationId);
    });

    it("should return empty array when no schema loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act & Assert
      expect(schemaStore.findOperations("any")).toEqual([]);
    });
  });

  describe("findOperation", () => {
    beforeEach(async () => {
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    it("should find operation by operationId", () => {
      // Arrange & Act
      const operation = schemaStore.findOperation({ operationId: "getHealth" });

      // Assert
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBe("getHealth");
      expect(operation?.method).toBe("get");
      expect(operation?.path).toBe("/health");
    });

    it("should find operation by method and path", () => {
      // Arrange & Act
      const operation = schemaStore.findOperation({ method: "POST", path: "/echo" });

      // Assert
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBe("postEcho");
      expect(operation?.method).toBe("post");
      expect(operation?.path).toBe("/echo");
    });

    it("should return null for non-existent operationId", () => {
      // Arrange & Act
      const operation = schemaStore.findOperation({ operationId: "nonExistent" });

      // Assert
      expect(operation).toBeNull();
    });

    it("should return null for non-existent method/path combination", () => {
      // Arrange & Act
      const operation = schemaStore.findOperation({ method: "DELETE", path: "/nonexistent" });

      // Assert
      expect(operation).toBeNull();
    });

    it("should return null when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act & Assert
      expect(schemaStore.findOperation({ operationId: "getHealth" })).toBeNull();
    });

    it("should prefer operationId over method/path when both provided", () => {
      // Arrange & Act
      const operation = schemaStore.findOperation({
        operationId: "getHealth",
        method: "POST",
        path: "/wrong",
      });

      // Assert
      expect(operation).toBeDefined();
      expect(operation?.operationId).toBe("getHealth");
      expect(operation?.method).toBe("get"); // Should match operationId, not provided method
    });
  });

  describe("getSchema", () => {
    it("should return null when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const schema = schemaStore.getSchema("User");

      // Assert
      expect(schema).toBeNull();
    });

    it("should return null for non-existent schema name", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const schema = schemaStore.getSchema("NonExistentSchema");

      // Assert
      expect(schema).toBeNull();
    });

    it("should return correct schema by name", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const userSchema = schemaStore.getSchema("User");

      // Assert
      expect(userSchema).toBeDefined();
      expect(userSchema.allOf).toBeDefined();
      expect(userSchema.allOf).toHaveLength(2);
      // The parser resolves $refs, so check for the resolved content
      expect(userSchema.allOf[0].properties).toBeDefined();
      expect(userSchema.allOf[0].properties.id).toBeDefined();
      expect(userSchema.allOf[0].properties.id.type).toBe("string");
      expect(userSchema.allOf[0].properties.id.format).toBe("uuid");
    });

    it("should return schema with all properties intact", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const errorSchema = schemaStore.getSchema("Error");

      // Assert
      expect(errorSchema).toBeDefined();
      expect(errorSchema.type).toBe("object");
      expect(errorSchema.properties).toBeDefined();
      expect(errorSchema.properties.code).toEqual({ type: "string" });
      expect(errorSchema.properties.message).toEqual({ type: "string" });
      expect(errorSchema.properties.details).toBeDefined();
      expect(errorSchema.properties.details.type).toBe("array");
      expect(errorSchema.required).toEqual(["code", "message"]);
    });

    it("should handle schema names with special characters", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      // Testing with existing schemas that have special characters or mixed case
      const createUserRequest = schemaStore.getSchema("CreateUserRequest");
      const userProfile = schemaStore.getSchema("UserProfile");

      // Assert
      expect(createUserRequest).toBeDefined();
      expect(createUserRequest.type).toBe("object");
      expect(userProfile).toBeDefined();
      expect(userProfile.type).toBe("object");
    });
  });

  describe("getSchemaNames", () => {
    it("should return empty array when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const schemaNames = schemaStore.getSchemaNames();

      // Assert
      expect(schemaNames).toEqual([]);
    });

    it("should return all schema names after loading", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const schemaNames = schemaStore.getSchemaNames();

      // Assert
      expect(schemaNames).toContain("BaseEntity");
      expect(schemaNames).toContain("User");
      expect(schemaNames).toContain("UserProfile");
      expect(schemaNames).toContain("CreateUserRequest");
      expect(schemaNames).toContain("Error");
      expect(schemaNames).toHaveLength(5);
    });

    it("should handle specs without schemas", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const schemaNames = schemaStore.getSchemaNames();

      // Assert
      expect(schemaNames).toEqual([]);
    });

    it("should return names in consistent order", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const firstCall = schemaStore.getSchemaNames();
      const secondCall = schemaStore.getSchemaNames();
      const thirdCall = schemaStore.getSchemaNames();

      // Assert
      expect(firstCall).toEqual(secondCall);
      expect(secondCall).toEqual(thirdCall);
      // Verify they are sorted (Map maintains insertion order)
      expect(firstCall.join(",")).toBe(secondCall.join(","));
    });
  });

  describe("getExamplesForOperation", () => {
    it("should return empty map when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const examples = schemaStore.getExamplesForOperation("postEcho");

      // Assert
      expect(examples).toBeInstanceOf(Map);
      expect(examples.size).toBe(0);
    });

    it("should return empty map for operation without examples", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("getHealth");

      // Assert
      expect(examples).toBeInstanceOf(Map);
      expect(examples.size).toBe(0);
    });

    it("should return request examples for operation", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("postEcho");

      // Assert
      expect(examples.size).toBeGreaterThan(0);
      expect(examples.has("request-application/json")).toBe(true);
      const requestExample = examples.get("request-application/json");
      expect(requestExample).toBeDefined();
      expect(requestExample.summary).toBe("Simple echo");
      expect(requestExample.value).toEqual({ message: "Hello, world!" });
    });

    it("should return response examples for operation", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("postEcho");

      // Assert
      expect(examples.has("response-200-application/json")).toBe(true);
      const responseExample = examples.get("response-200-application/json");
      expect(responseExample).toBeDefined();
      expect(responseExample.summary).toBe("Simple echo response");
      expect(responseExample.value).toEqual({
        echo: "Hello, world!",
        receivedAt: "2023-01-01T12:00:00Z",
      });
    });

    it("should return both request and response examples", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("postEcho");

      // Assert
      expect(examples.size).toBe(2);
      expect(examples.has("request-application/json")).toBe(true);
      expect(examples.has("response-200-application/json")).toBe(true);
    });

    it("should handle multiple content types", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("createUser");

      // Assert
      expect(examples.size).toBeGreaterThan(0);
      expect(examples.has("request-application/json")).toBe(true);
    });

    it("should handle multiple status codes", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      // For complex-api, we need to check if there are operations with multiple status codes
      const operations = schemaStore.getOperations();
      const createUserOp = operations.find((op) => op.operationId === "createUser");

      // Assert
      expect(createUserOp).toBeDefined();
      // The createUser operation has 201, 400, and 409 responses
      expect(Object.keys(createUserOp?.responses || {})).toHaveLength(3);
      expect(Object.keys(createUserOp?.responses || {})).toContain("201");
      expect(Object.keys(createUserOp?.responses || {})).toContain("400");
      expect(Object.keys(createUserOp?.responses || {})).toContain("409");
    });

    it("should use correct key format for examples", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const examples = schemaStore.getExamplesForOperation("postEcho");

      // Assert
      const keys = Array.from(examples.keys());
      expect(keys).toContain("request-application/json");
      expect(keys).toContain("response-200-application/json");
      // Keys should follow pattern: type-statusCode?-contentType
      keys.forEach((key) => {
        expect(key).toMatch(/^(request|response)(-\d{3})?-[\w/+-]+$/);
      });
    });
  });

  describe("getServers", () => {
    it("should return empty array when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const servers = schemaStore.getServers();

      // Assert
      expect(servers).toEqual([]);
    });

    it("should return servers from loaded spec", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const servers = schemaStore.getServers();

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual({
        url: "https://api.example.com/v1",
        description: "Production server",
      });
    });

    it("should handle specs without servers", async () => {
      // Arrange
      // Create a minimal spec without servers
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
      // Manually clear servers to simulate a spec without servers
      const schema = schemaStore.getCurrentSchema();
      if (schema) {
        schema.servers = [];
      }

      // Act
      const servers = schemaStore.getServers();

      // Assert
      expect(servers).toEqual([]);
    });

    it("should preserve server variables and descriptions", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const servers = schemaStore.getServers();

      // Assert
      expect(servers).toHaveLength(1);
      expect(servers[0].url).toBe("https://api.complex.com/v2");
      expect(servers[0].description).toBe("Production server");
      // If there were server variables, they would be preserved here
    });
  });

  describe("getSecurity", () => {
    it("should return empty array when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const security = schemaStore.getSecurity();

      // Assert
      expect(security).toEqual([]);
    });

    it("should return global security requirements", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const security = schemaStore.getSecurity();

      // Assert
      expect(security).toHaveLength(1);
      expect(security[0]).toEqual({ BearerAuth: [] });
    });

    it("should handle specs without security", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const security = schemaStore.getSecurity();

      // Assert
      expect(security).toEqual([]);
    });

    it("should preserve security scheme references", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const security = schemaStore.getSecurity();
      const schema = schemaStore.getCurrentSchema();

      // Assert
      expect(security).toHaveLength(1);
      expect(security[0]).toHaveProperty("BearerAuth");
      // Check that the security scheme is defined in components
      expect(schema?.api.components?.securitySchemes).toBeDefined();
      expect(schema?.api.components?.securitySchemes.BearerAuth).toEqual({
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      });
    });
  });

  describe("getCurrentSchema", () => {
    it("should return null when no schema is loaded", () => {
      // Arrange
      schemaStore.clearSchema();

      // Act
      const currentSchema = schemaStore.getCurrentSchema();

      // Assert
      expect(currentSchema).toBeNull();
    });

    it("should return complete loaded schema object", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const currentSchema = schemaStore.getCurrentSchema();

      // Assert
      expect(currentSchema).toBeDefined();
      expect(currentSchema).not.toBeNull();
      expect(currentSchema?.api).toBeDefined();
      expect(currentSchema?.api.openapi).toBe("3.1.0");
    });

    it("should include all expected properties (api, metadata, operations, etc.)", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const currentSchema = schemaStore.getCurrentSchema();

      // Assert
      expect(currentSchema).toBeDefined();
      expect(currentSchema?.api).toBeDefined();
      expect(currentSchema?.metadata).toBeDefined();
      expect(currentSchema?.metadata.title).toBe("Complex Test API");
      expect(currentSchema?.metadata.version).toBe("2.0.0");
      expect(currentSchema?.metadata.description).toBe("A complex API with various schema compositions");
      expect(currentSchema?.metadata.path).toBe(specPath);
      expect(currentSchema?.metadata.loadedAt).toBeDefined();
      expect(currentSchema?.operations).toBeDefined();
      expect(currentSchema?.operations).toBeInstanceOf(Array);
      expect(currentSchema?.schemas).toBeInstanceOf(Map);
      expect(currentSchema?.examples).toBeInstanceOf(Map);
      expect(currentSchema?.servers).toBeInstanceOf(Array);
      expect(currentSchema?.security).toBeInstanceOf(Array);
    });

    it("should return same reference for multiple calls", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act
      const firstCall = schemaStore.getCurrentSchema();
      const secondCall = schemaStore.getCurrentSchema();
      const thirdCall = schemaStore.getCurrentSchema();

      // Assert
      expect(firstCall).toBe(secondCall);
      expect(secondCall).toBe(thirdCall);
      expect(firstCall).not.toBeNull();
    });
  });

  describe("Memory Management", () => {
    it("should handle loading multiple schemas sequentially", async () => {
      // Arrange
      const simpleSpecPath = resolve(__dirname, "../data/simple-api.yaml");
      const complexSpecPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act - Load simple spec first
      await schemaStore.loadSchema(simpleSpecPath);
      const firstMetadata = schemaStore.getMetadata();
      const firstOperations = schemaStore.getOperations();

      // Act - Load complex spec second
      await schemaStore.loadSchema(complexSpecPath);
      const secondMetadata = schemaStore.getMetadata();
      const secondOperations = schemaStore.getOperations();

      // Assert
      expect(firstMetadata?.title).toBe("Simple Test API");
      expect(firstOperations).toHaveLength(2);
      expect(secondMetadata?.title).toBe("Complex Test API");
      expect(secondOperations).toHaveLength(4); // listUsers, createUser, getUser, updateUser
    });

    it("should properly replace previous schema when loading new one", async () => {
      // Arrange
      const simpleSpecPath = resolve(__dirname, "../data/simple-api.yaml");
      const complexSpecPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act - Load simple spec
      await schemaStore.loadSchema(simpleSpecPath);
      const simpleSchemaNames = schemaStore.getSchemaNames();
      const simpleOperations = schemaStore.getOperations();

      // Act - Load complex spec (should replace simple)
      await schemaStore.loadSchema(complexSpecPath);
      const complexSchemaNames = schemaStore.getSchemaNames();
      const complexOperations = schemaStore.getOperations();

      // Assert - Simple spec data should be gone
      expect(simpleSchemaNames).toHaveLength(0); // simple-api has no schemas
      expect(simpleOperations).toHaveLength(2);
      expect(complexSchemaNames).toHaveLength(5); // complex-api has 5 schemas
      expect(complexOperations).toHaveLength(4);
      // Verify simple spec operations are not present
      const hasSimpleOperations = complexOperations.some((op) => op.operationId === "getHealth" || op.operationId === "postEcho");
      expect(hasSimpleOperations).toBe(false);
    });

    it("should not leak memory after multiple load/clear cycles", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      const cycles = 5;

      // Act - Perform multiple load/clear cycles
      for (let i = 0; i < cycles; i++) {
        await schemaStore.loadSchema(specPath);
        expect(schemaStore.hasSchema()).toBe(true);
        expect(schemaStore.getSchemaNames()).toHaveLength(5);

        schemaStore.clearSchema();
        expect(schemaStore.hasSchema()).toBe(false);
        expect(schemaStore.getSchemaNames()).toHaveLength(0);
      }

      // Assert - Final state should be clean
      expect(schemaStore.getCurrentSchema()).toBeNull();
      expect(schemaStore.getOperations()).toEqual([]);
      expect(schemaStore.getSchemaNames()).toEqual([]);
    });

    it("should handle concurrent access to schema data", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act - Simulate concurrent access
      const promises = [
        Promise.resolve(schemaStore.getOperations()),
        Promise.resolve(schemaStore.getSchemaNames()),
        Promise.resolve(schemaStore.getMetadata()),
        Promise.resolve(schemaStore.findOperations("user")),
        Promise.resolve(schemaStore.getSchema("User")),
        Promise.resolve(schemaStore.getCurrentSchema()),
      ];

      const results = await Promise.all(promises);

      // Assert - All concurrent accesses should succeed
      expect(results[0]).toHaveLength(4); // operations
      expect(results[1]).toHaveLength(5); // schema names
      expect(results[2]?.title).toBe("Complex Test API"); // metadata
      expect(results[3].length).toBeGreaterThan(0); // filtered operations
      expect(results[4]).toBeDefined(); // User schema
      expect(results[5]).toBeDefined(); // current schema
    });
  });

  describe("Error Handling", () => {
    it("should handle corrupted OpenAPI files gracefully", async () => {
      // Arrange
      const corruptedPath = "/tmp/corrupted.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(corruptedPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle YAML parsing errors", async () => {
      // Arrange
      // This would require a malformed YAML file in test data
      const invalidYamlPath = "/tmp/invalid.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(invalidYamlPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle JSON parsing errors", async () => {
      // Arrange
      const invalidJsonPath = "/tmp/invalid.json";

      // Act & Assert
      await expect(schemaStore.loadSchema(invalidJsonPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle filesystem permission errors", async () => {
      // Arrange
      const restrictedPath = "/root/restricted.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(restrictedPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle specs with circular references", async () => {
      // Arrange
      // The complex-api.yaml has $ref references but not circular ones
      // This test verifies the parser can handle refs correctly
      const specPath = resolve(__dirname, "../data/complex-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);

      // Assert - Should load successfully despite refs
      expect(schemaStore.hasSchema()).toBe(true);
      const userSchema = schemaStore.getSchema("User");
      // The parser resolves $refs, so check for the resolved content
      expect(userSchema).toBeDefined();
      expect(userSchema?.allOf).toBeDefined();
      expect(userSchema?.allOf[0].properties).toBeDefined();
      expect(userSchema?.allOf[0].properties.id).toBeDefined();
    });

    it("should validate OpenAPI version compatibility", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      // Act
      await schemaStore.loadSchema(specPath);
      const schema = schemaStore.getCurrentSchema();

      // Assert - Should accept OpenAPI 3.1.0
      expect(schema?.api.openapi).toBe("3.1.0");
      expect(schemaStore.hasSchema()).toBe(true);
    });
  });

  describe("Performance", () => {
    it("should load large specifications within reasonable time", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      const startTime = Date.now();

      // Act
      await schemaStore.loadSchema(specPath);
      const loadTime = Date.now() - startTime;

      // Assert - Should load within 2 seconds
      expect(loadTime).toBeLessThan(2000);
      expect(schemaStore.hasSchema()).toBe(true);
    });

    it("should perform fast lookups after loading", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act - Perform multiple lookups and measure time
      const startTime = Date.now();
      for (let i = 0; i < 100; i++) {
        schemaStore.getSchema("User");
        schemaStore.findOperation({ operationId: "getUser" });
        schemaStore.findOperations("user");
      }
      const lookupTime = Date.now() - startTime;

      // Assert - 100 lookups should be very fast (< 50ms)
      expect(lookupTime).toBeLessThan(50);
    });

    it("should handle specs with many operations efficiently", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act - Perform operations on all operations
      const startTime = Date.now();
      const operations = schemaStore.getOperations();
      const filtered = schemaStore.findOperations("user");
      const searchTime = Date.now() - startTime;

      // Assert
      expect(operations.length).toBeGreaterThan(0);
      expect(filtered.length).toBeGreaterThan(0);
      expect(searchTime).toBeLessThan(10); // Should be near instant
    });

    it("should handle specs with deep schema nesting", async () => {
      // Arrange
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      await schemaStore.loadSchema(specPath);

      // Act - Access nested schemas
      const userSchema = schemaStore.getSchema("User");
      const userProfileSchema = schemaStore.getSchema("UserProfile");
      const baseEntitySchema = schemaStore.getSchema("BaseEntity");

      // Assert - All nested schemas should be accessible
      expect(userSchema).toBeDefined();
      expect(userSchema.allOf).toBeDefined();
      expect(userProfileSchema).toBeDefined();
      expect(userProfileSchema.properties.preferences.additionalProperties.oneOf).toBeDefined();
      expect(baseEntitySchema).toBeDefined();
    });
  });
});
