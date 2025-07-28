import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve } from "path";
import { parseOpenAPISpec, computeSpecHash, resolveComposedSchema, extractOperations, extractContentTypes } from "@/openapi-parser.js";
import { suppressConsole, TIMEOUTS } from "@tests/utils/test-helpers.js";

describe("OpenAPI Parser", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
  });

  afterEach(() => {
    restoreConsole();
  });

  describe("parseOpenAPISpec", () => {
    it(
      "should parse a simple OpenAPI specification",
      async () => {
        const specPath = resolve(__dirname, "../data/simple-api.yaml");

        const result = await parseOpenAPISpec(specPath);

        expect(result).toBeDefined();
        expect(result.openapi).toBe("3.1.0");
        expect(result.info.title).toBe("Simple Test API");
        expect(result.info.version).toBe("1.0.0");
        expect(result.paths).toBeDefined();
        expect(result.paths["/health"]).toBeDefined();
        expect(result.paths["/echo"]).toBeDefined();
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should parse a complex OpenAPI specification with refs",
      async () => {
        const specPath = resolve(__dirname, "../data/complex-api.yaml");

        const result = await parseOpenAPISpec(specPath);

        expect(result).toBeDefined();
        expect(result.openapi).toBe("3.1.0");
        expect(result.info.title).toBe("Complex Test API");
        expect(result.components).toBeDefined();
        expect(result.components.schemas.User).toBeDefined();

        // Should resolve $ref in paths
        const createUserOp = result.paths["/users"].post;
        expect(createUserOp.requestBody.content["application/json"].schema).toBeDefined();
      },
      TIMEOUTS.UNIT,
    );

    it(
      "should throw error for invalid OpenAPI spec",
      async () => {
        const invalidSpecPath = resolve(__dirname, "../data/nonexistent.yaml");

        await expect(parseOpenAPISpec(invalidSpecPath)).rejects.toThrow();
      },
      TIMEOUTS.UNIT,
    );
  });

  describe("computeSpecHash", () => {
    it("should compute consistent hash for the same file", () => {
      const specPath = resolve(__dirname, "../data/simple-api.yaml");

      const hash1 = computeSpecHash(specPath);
      const hash2 = computeSpecHash(specPath);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });

    it("should compute different hashes for different files", () => {
      const simpleSpecPath = resolve(__dirname, "../data/simple-api.yaml");
      const complexSpecPath = resolve(__dirname, "../data/complex-api.yaml");

      const hash1 = computeSpecHash(simpleSpecPath);
      const hash2 = computeSpecHash(complexSpecPath);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("resolveComposedSchema", () => {
    it("should resolve allOf schemas", () => {
      const schema = {
        allOf: [
          {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
            },
            required: ["id"],
          },
          {
            type: "object",
            properties: {
              email: { type: "string" },
              name: { type: "string" }, // Should be merged
            },
            required: ["email"],
          },
        ],
      };

      const resolved = resolveComposedSchema(schema);

      expect(resolved.type).toBe("object");
      expect(resolved.properties).toEqual({
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
      });
      expect(resolved.required).toEqual(["id", "email"]);
    });

    it("should preserve oneOf schemas", () => {
      const schema = {
        oneOf: [{ type: "string" }, { type: "number" }],
      };

      const resolved = resolveComposedSchema(schema);

      expect(resolved.oneOf).toHaveLength(2);
      expect(resolved.oneOf[0]).toEqual({ type: "string" });
      expect(resolved.oneOf[1]).toEqual({ type: "number" });
    });

    it("should handle nested object properties", () => {
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              profile: {
                allOf: [
                  { type: "object", properties: { name: { type: "string" } } },
                  { type: "object", properties: { age: { type: "number" } } },
                ],
              },
            },
          },
        },
      };

      const resolved = resolveComposedSchema(schema);

      expect(resolved.properties.user.properties.profile.type).toBe("object");
      expect(resolved.properties.user.properties.profile.properties).toEqual({
        name: { type: "string" },
        age: { type: "number" },
      });
    });

    it("should handle array items", () => {
      const schema = {
        type: "array",
        items: {
          allOf: [
            { type: "object", properties: { id: { type: "string" } } },
            { type: "object", properties: { name: { type: "string" } } },
          ],
        },
      };

      const resolved = resolveComposedSchema(schema);

      expect(resolved.type).toBe("array");
      expect(resolved.items.type).toBe("object");
      expect(resolved.items.properties).toEqual({
        id: { type: "string" },
        name: { type: "string" },
      });
    });

    it("should return unchanged schema for non-composed schemas", () => {
      const schema = {
        type: "string",
        maxLength: 100,
      };

      const resolved = resolveComposedSchema(schema);

      expect(resolved).toEqual(schema);
    });
  });

  describe("extractOperations", () => {
    it("should extract operations from simple API", async () => {
      const specPath = resolve(__dirname, "../data/simple-api.yaml");
      const api = await parseOpenAPISpec(specPath);

      const operations = extractOperations(api);

      expect(operations).toHaveLength(2);

      const healthOp = operations.find((op) => op.operationId === "getHealth");
      expect(healthOp).toBeDefined();
      expect(healthOp?.method).toBe("GET");
      expect(healthOp?.path).toBe("/health");
      expect(healthOp?.summary).toBe("Health check");

      const echoOp = operations.find((op) => op.operationId === "postEcho");
      expect(echoOp).toBeDefined();
      expect(echoOp?.method).toBe("POST");
      expect(echoOp?.path).toBe("/echo");
      expect(echoOp?.requestBody).toBeDefined();
    });

    it("should extract operations from complex API", async () => {
      const specPath = resolve(__dirname, "../data/complex-api.yaml");
      const api = await parseOpenAPISpec(specPath);

      const operations = extractOperations(api);

      expect(operations).toHaveLength(4);

      const listUsersOp = operations.find((op) => op.operationId === "listUsers");
      expect(listUsersOp).toBeDefined();
      expect(listUsersOp?.method).toBe("GET");
      expect(listUsersOp?.path).toBe("/users");
      expect(listUsersOp?.parameters).toBeDefined();
      expect(listUsersOp?.security).toBeDefined();

      const createUserOp = operations.find((op) => op.operationId === "createUser");
      expect(createUserOp).toBeDefined();
      expect(createUserOp?.method).toBe("POST");
      expect(createUserOp?.requestBody).toBeDefined();
    });

    it("should generate operation IDs for operations without explicit IDs", async () => {
      // Create a test spec without operation IDs
      const apiWithoutIds = {
        openapi: "3.1.0",
        info: { title: "Test", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              summary: "Test endpoint",
            },
          },
        },
      };

      const operations = extractOperations(apiWithoutIds);

      expect(operations).toHaveLength(1);
      expect(operations[0].operationId).toBe("get_/test");
      expect(operations[0].method).toBe("GET");
    });
  });

  describe("extractContentTypes", () => {
    it("should extract content types from responses", () => {
      const responses = {
        "200": {
          content: {
            "application/json": { schema: { type: "object" } },
            "text/plain": { schema: { type: "string" } },
          },
        },
        "400": {
          content: {
            "application/json": { schema: { type: "object" } },
          },
        },
      };

      const contentTypes = extractContentTypes(responses);

      expect(contentTypes).toEqual(expect.arrayContaining(["application/json", "text/plain"]));
      expect(contentTypes).toHaveLength(2);
    });

    it("should return empty array for responses without content", () => {
      const responses = {
        "204": {
          description: "No content",
        },
      };

      const contentTypes = extractContentTypes(responses);

      expect(contentTypes).toEqual([]);
    });

    it("should handle empty responses object", () => {
      const contentTypes = extractContentTypes({});

      expect(contentTypes).toEqual([]);
    });
  });
});
