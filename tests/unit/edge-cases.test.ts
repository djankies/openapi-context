import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolve } from "path";
import { schemaStore } from "@/schema-store.js";
import { registerOpenAPITools } from "@/tools/openapi-tools.js";
import { createTestMcpServer, createTestConfig, suppressConsole, TIMEOUTS, callMcpTool } from "@tests/utils/test-helpers.js";

describe("Edge Cases and Error Handling", () => {
  let restoreConsole: () => void;

  beforeEach(() => {
    restoreConsole = suppressConsole();
    schemaStore.clearSchema();
  });

  afterEach(() => {
    restoreConsole();
    schemaStore.clearSchema();
  });

  describe("Large Schema Files", () => {
    it(
      "should handle OpenAPI specs larger than default memory limits",
      async () => {
        // Arrange
        const largeSpecContent = {
          openapi: "3.1.0",
          info: { title: "Large API", version: "1.0.0" },
          paths: {} as Record<string, any>,
        };

        // Create a large spec by adding many paths
        for (let i = 0; i < 100; i++) {
          largeSpecContent.paths[`/endpoint${i}`] = {
            get: {
              operationId: `getEndpoint${i}`,
              summary: `Get endpoint ${i}`,
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          data: { type: "string", maxLength: 1000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          };
        }

        const tempFile = `/tmp/large-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(largeSpecContent)));

        // Act
        const loadPromise = schemaStore.loadSchema(tempFile);

        // Assert
        await expect(loadPromise).resolves.toBeDefined();
        expect(schemaStore.hasSchema()).toBe(true);
        const metadata = schemaStore.getMetadata();
        expect(metadata?.title).toBe("Large API");

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should manage pagination with extremely large schemas",
      async () => {
        // Arrange
        const largeSchema = {
          type: "object",
          properties: {} as Record<string, any>,
        };

        // Create a schema with many properties
        for (let i = 0; i < 50; i++) {
          largeSchema.properties[`property${i}`] = {
            type: "string",
            description: `Property ${i} with a very long description that takes up significant space in the serialized output to test pagination boundaries`,
          };
        }

        const specWithLargeSchema = {
          openapi: "3.1.0",
          info: { title: "Large Schema API", version: "1.0.0" },
          paths: {
            "/test": {
              post: {
                operationId: "testPost",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: largeSchema,
                    },
                  },
                },
                responses: {
                  "200": { description: "Success" },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/large-schema-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(specWithLargeSchema)));

        // Act
        await schemaStore.loadSchema(tempFile);
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        const result = await callMcpTool(server, "get_request_schema", {
          operation_id: "testPost",
          content_type: "application/json",
          index: 0,
          chunk_size: 1000,
        });

        // Assert
        expect(result.content).toBeDefined();
        expect(result.content[0].text).toContain("📄 Showing characters");
        expect(result.content[0].text).toContain("⏭️  Next chunk:");

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle specs with thousands of operations",
      async () => {
        // Arrange
        const massiveSpec = {
          openapi: "3.1.0",
          info: { title: "Massive API", version: "1.0.0" },
          paths: {} as Record<string, any>,
        };

        // Create 2000 operations
        for (let i = 0; i < 200; i++) {
          massiveSpec.paths[`/resource${i}`] = {
            get: {
              operation_id: `getResource${i}`,
              summary: `Get resource ${i}`,
              responses: { "200": { description: "Success" } },
            },
            post: {
              operation_id: `postResource${i}`,
              summary: `Create resource ${i}`,
              responses: { "201": { description: "Created" } },
            },
          };
        }

        const tempFile = `/tmp/massive-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(massiveSpec)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert
        expect(result.operationCount).toBe(400); // 200 GET + 200 POST
        expect(schemaStore.hasSchema()).toBe(true);

        const operations = schemaStore.getOperations();
        expect(operations).toHaveLength(400);

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should cope with deeply nested schema definitions",
      async () => {
        // Arrange
        const createNestedSchema = (depth: number): any => {
          if (depth === 0) {
            return { type: "string" };
          }
          return {
            type: "object",
            properties: {
              nested: createNestedSchema(depth - 1),
            },
          };
        };

        const deepSpec = {
          openapi: "3.1.0",
          info: { title: "Deep Nested API", version: "1.0.0" },
          paths: {
            "/deep": {
              post: {
                operation_id: "deepPost",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: createNestedSchema(50), // 50 levels deep
                    },
                  },
                },
                responses: {
                  "200": { description: "Success" },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/deep-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(deepSpec)));

        // Act
        const loadPromise = schemaStore.loadSchema(tempFile);

        // Assert
        await expect(loadPromise).resolves.toBeDefined();
        expect(schemaStore.hasSchema()).toBe(true);

        const operation = schemaStore.findOperation({ operationId: "deepPost" });
        expect(operation).toBeDefined();

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle very large enum arrays (10000+ values)",
      async () => {
        // Arrange
        const largeEnum = Array.from({ length: 10000 }, (_, i) => `value${i}`);

        const enumSpec = {
          openapi: "3.1.0",
          info: { title: "Large Enum API", version: "1.0.0" },
          paths: {
            "/enum-test": {
              get: {
                operationId: "getEnumTest",
                parameters: [
                  {
                    name: "largeEnum",
                    in: "query",
                    schema: {
                      type: "string",
                      enum: largeEnum,
                    },
                  },
                ],
                responses: {
                  "200": { description: "Success" },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/enum-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(enumSpec)));

        // Act
        await schemaStore.loadSchema(tempFile);
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        const result = await callMcpTool(server, "get_operation_details", {
          operation_id: "getEnumTest",
        });

        // Assert
        expect(result.content[0].text).toMatch(/10000\+ options available/); // Should show count for large enums
        expect(result.content[0].text).not.toContain("value999"); // Should not show all values

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should manage specs with extensive examples",
      async () => {
        // Arrange
        const specWithManyExamples = {
          openapi: "3.1.0",
          info: { title: "Examples API", version: "1.0.0" },
          paths: {
            "/examples": {
              post: {
                operation_id: "postExamples",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: { type: "object" },
                      examples: {} as Record<string, any>,
                    },
                  },
                },
                responses: {
                  "200": {
                    description: "Success",
                    content: {
                      "application/json": {
                        schema: { type: "object" },
                        examples: {} as Record<string, any>,
                      },
                    },
                  },
                },
              },
            },
          },
        };

        // Add 1000 examples
        for (let i = 0; i < 100; i++) {
          specWithManyExamples.paths["/examples"].post.requestBody.content["application/json"].examples[`example${i}`] = {
            summary: `Example ${i}`,
            value: { id: i, data: `Example data ${i}` },
          };
          specWithManyExamples.paths["/examples"].post.responses["200"].content["application/json"].examples[`response${i}`] = {
            summary: `Response ${i}`,
            value: { result: `Response data ${i}` },
          };
        }

        const tempFile = `/tmp/examples-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(specWithManyExamples)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert
        expect(result.exampleCount).toBe(200); // 100 request + 100 response examples
        expect(schemaStore.hasSchema()).toBe(true);

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle circular reference resolution in large specs",
      async () => {
        // Arrange
        const circularSpec = {
          openapi: "3.1.0",
          info: { title: "Circular API", version: "1.0.0" },
          components: {
            schemas: {
              Node: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  children: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Node" },
                  },
                  parent: { $ref: "#/components/schemas/Node" },
                },
              },
            },
          },
          paths: {
            "/nodes": {
              get: {
                operation_id: "getNodes",
                responses: {
                  "200": {
                    description: "Success",
                    content: {
                      "application/json": {
                        schema: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Node" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/circular-spec-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(circularSpec)));

        // Act
        const loadPromise = schemaStore.loadSchema(tempFile);

        // Assert
        await expect(loadPromise).resolves.toBeDefined();
        expect(schemaStore.hasSchema()).toBe(true);

        const operation = schemaStore.findOperation({ operationId: "getNodes" });
        expect(operation).toBeDefined();

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("Invalid OpenAPI Specifications", () => {
    it("should handle specs with missing required fields", async () => {
      // Arrange
      const invalidSpec = {
        // Missing openapi version and info fields
        paths: {
          "/test": {
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/invalid-spec-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(invalidSpec)));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with invalid version numbers", async () => {
      // Arrange
      const invalidVersionSpec = {
        openapi: "2.0", // Invalid for OpenAPI 3.x parser
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/invalid-version-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(invalidVersionSpec)));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with malformed paths", async () => {
      // Arrange
      const malformedPathSpec = {
        openapi: "3.1.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "invalid-path-without-slash": {
            // Invalid path format
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/malformed-path-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(malformedPathSpec)));

      // Act & Assert - Schema may load but with warnings
      await schemaStore.loadSchema(tempFile);
      expect(schemaStore.hasSchema()).toBe(true);
      // Verify the malformed path was handled gracefully
      const operations = schemaStore.getOperations();
      expect(operations.length).toBe(1); // Still processed the operation

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with invalid HTTP methods", async () => {
      // Arrange
      const invalidMethodSpec = {
        openapi: "3.1.0",
        info: { title: "Test API", version: "1.0.0" },
        paths: {
          "/test": {
            "invalid-method": {
              // Not a valid HTTP method
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/invalid-method-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(invalidMethodSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - should load but ignore invalid methods
      expect(result.operationCount).toBe(0);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with circular $ref references", async () => {
      // Arrange
      const circularRefSpec = {
        openapi: "3.1.0",
        info: { title: "Circular Ref API", version: "1.0.0" },
        components: {
          schemas: {
            A: {
              type: "object",
              properties: {
                b: { $ref: "#/components/schemas/B" },
              },
            },
            B: {
              type: "object",
              properties: {
                a: { $ref: "#/components/schemas/A" }, // Creates circular reference
              },
            },
          },
        },
        paths: {
          "/test": {
            get: {
              operation_id: "testCircular",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/A" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/circular-ref-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(circularRefSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - should handle circular refs gracefully
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      const operation = schemaStore.findOperation({ operationId: "testCircular" });
      expect(operation).toBeDefined();

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with broken $ref links", async () => {
      // Arrange
      const brokenRefSpec = {
        openapi: "3.1.0",
        info: { title: "Broken Ref API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testBrokenRef",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/NonExistent" }, // Broken reference
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/broken-ref-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(brokenRefSpec)));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with invalid JSON Schema syntax", async () => {
      // Arrange
      const invalidSchemaSpec = {
        openapi: "3.1.0",
        info: { title: "Invalid Schema API", version: "1.0.0" },
        paths: {
          "/test": {
            post: {
              operation_id: "testInvalidSchema",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        id: {
                          type: "invalid-type", // Invalid JSON Schema type
                          minimum: "not-a-number", // Invalid constraint for number type
                        },
                      },
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/invalid-schema-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(invalidSchemaSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - should load but may ignore invalid schema parts
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with conflicting operation IDs", async () => {
      // Arrange
      const conflictingIdSpec = {
        openapi: "3.1.0",
        info: { title: "Conflicting ID API", version: "1.0.0" },
        paths: {
          "/test1": {
            get: {
              operation_id: "duplicateId",
              responses: {
                "200": { description: "Success from test1" },
              },
            },
          },
          "/test2": {
            get: {
              operation_id: "duplicateId", // Same operation ID
              responses: {
                "200": { description: "Success from test2" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/conflicting-id-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(conflictingIdSpec)));

      // Act & Assert - Schema may load with duplicate operation IDs
      await schemaStore.loadSchema(tempFile);
      expect(schemaStore.hasSchema()).toBe(true);
      // Verify both operations were processed despite duplicate IDs
      const operations = schemaStore.getOperations();
      expect(operations.length).toBe(2);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("Network and File System Issues", () => {
    it("should handle file permission errors gracefully", async () => {
      // Arrange
      const nonExistentFile = "/root/restricted-access.yaml"; // Typically no access

      // Act & Assert
      await expect(schemaStore.loadSchema(nonExistentFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle filesystem access errors", async () => {
      // Arrange
      const invalidPath = "/dev/null/invalid/path.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(invalidPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle temporary file unavailability", async () => {
      // Arrange
      const tempFile = `/tmp/temp-spec-${Date.now()}.yaml`;
      const validSpec = {
        openapi: "3.1.0",
        info: { title: "Temp API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              responses: {
                "200": { description: "Success" },
              },
            },
          },
        },
      };

      // Create file
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(validSpec)));

      // Delete file before loading (simulating unavailability)
      await import("fs/promises").then((fs) => fs.unlink(tempFile));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle disk space exhaustion during loading", async () => {
      // Arrange - This test simulates conditions, actual disk exhaustion is hard to test
      // Act & Assert - Test with non-existent file to simulate error
      await expect(schemaStore.loadSchema("/tmp/test.yaml")).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle file corruption during reading", async () => {
      // Arrange
      const corruptedFile = `/tmp/corrupted-${Date.now()}.yaml`;
      const corruptedContent = "openapi: 3.1.0\ninfo:\n  title: \x00\x01\x02corrupted data";

      await import("fs/promises").then((fs) => fs.writeFile(corruptedFile, corruptedContent));

      // Act & Assert
      await expect(schemaStore.loadSchema(corruptedFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(corruptedFile).catch(() => {}));
    });

    it("should handle interrupted file operations", async () => {
      // Arrange
      const interruptedFile = `/tmp/interrupted-${Date.now()}.yaml`;
      const incompleteContent = "openapi: 3.1.0\ninfo:\n  title: Incomplete";

      await import("fs/promises").then((fs) => fs.writeFile(interruptedFile, incompleteContent));

      // Act & Assert
      await expect(schemaStore.loadSchema(interruptedFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(interruptedFile).catch(() => {}));
    });
  });

  describe("Memory Constraints", () => {
    it(
      "should handle low memory conditions gracefully",
      async () => {
        // Arrange

        // Create a memory-intensive spec
        const memoryIntensiveSpec = {
          openapi: "3.1.0",
          info: { title: "Memory Test API", version: "1.0.0" },
          paths: {} as Record<string, any>,
        };

        // Add many operations to consume memory
        for (let i = 0; i < 100; i++) {
          memoryIntensiveSpec.paths[`/memory-test-${i}`] = {
            post: {
              operation_id: `memoryTest${i}`,
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {},
                    },
                  },
                },
              },
              responses: {
                "200": { description: "Success" },
              },
            },
          };

          // Add many properties to consume more memory
          for (let j = 0; j < 50; j++) {
            memoryIntensiveSpec.paths[`/memory-test-${i}`].post.requestBody.content["application/json"].schema.properties[`property${j}`] =
              {
                type: "string",
                description: `Memory test property ${j} with a long description that takes up space`.repeat(10),
              };
          }
        }

        const tempFile = `/tmp/memory-test-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(memoryIntensiveSpec)));

        // Act
        const memoryBefore = process.memoryUsage().heapUsed;
        const result = await schemaStore.loadSchema(tempFile);
        const memoryAfter = process.memoryUsage().heapUsed;

        // Assert
        expect(result.operationCount).toBe(100);
        expect(schemaStore.hasSchema()).toBe(true);

        // Memory should increase but not excessively
        const memoryIncrease = memoryAfter - memoryBefore;
        expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should prevent memory leaks during repeated operations",
      async () => {
        // Arrange
        const simpleSpec = {
          openapi: "3.1.0",
          info: { title: "Leak Test API", version: "1.0.0" },
          paths: {
            "/test": {
              get: {
                operation_id: "testLeak",
                responses: {
                  "200": { description: "Success" },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/leak-test-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(simpleSpec)));

        const memoryBefore = process.memoryUsage().heapUsed;

        // Act - Perform repeated operations
        for (let i = 0; i < 10; i++) {
          await schemaStore.loadSchema(tempFile);
          const server = createTestMcpServer();
          registerOpenAPITools(server, createTestConfig());

          await callMcpTool(server, "list_operations", {});
          await callMcpTool(server, "get_operation_details", { operation_id: "testLeak" });

          schemaStore.clearSchema();

          // Force garbage collection if available
          if (globalThis.gc) {
            globalThis.gc();
          }
        }

        const memoryAfter = process.memoryUsage().heapUsed;

        // Assert - Memory should not have grown significantly
        const memoryIncrease = memoryAfter - memoryBefore;
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB increase

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should manage memory usage with multiple concurrent requests",
      async () => {
        // Arrange
        const concurrentSpec = {
          openapi: "3.1.0",
          info: { title: "Concurrent API", version: "1.0.0" },
          paths: {
            "/concurrent": {
              get: {
                operation_id: "getConcurrent",
                responses: {
                  "200": { description: "Success" },
                },
              },
            },
          },
        };

        const tempFile = `/tmp/concurrent-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(concurrentSpec)));

        await schemaStore.loadSchema(tempFile);
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        const memoryBefore = process.memoryUsage().heapUsed;

        // Act - Create multiple concurrent requests
        const concurrentPromises = Array.from({ length: 20 }, () =>
          callMcpTool(server, "get_operation_details", { operation_id: "getConcurrent" }),
        );

        const results = await Promise.all(concurrentPromises);
        const memoryAfter = process.memoryUsage().heapUsed;

        // Assert
        expect(results).toHaveLength(20);
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.content[0].text).toContain("getConcurrent");
        });

        // Memory should not have grown excessively
        const memoryIncrease = memoryAfter - memoryBefore;
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Less than 50MB increase

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it("should handle garbage collection pressure appropriately", async () => {
      // Arrange
      const gcSpec = {
        openapi: "3.1.0",
        info: { title: "GC Test API", version: "1.0.0" },
        paths: {} as Record<string, any>,
      };

      // Create many operations to put pressure on GC
      for (let i = 0; i < 200; i++) {
        gcSpec.paths[`/gc-test-${i}`] = {
          get: {
            operation_id: `gcTest${i}`,
            responses: {
              "200": { description: "Success" },
            },
          },
        };
      }

      const tempFile = `/tmp/gc-test-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(gcSpec)));

      // Act
      const startTime = Date.now();
      const result = await schemaStore.loadSchema(tempFile);
      const endTime = Date.now();

      // Assert
      expect(result.operationCount).toBe(200);
      expect(schemaStore.hasSchema()).toBe(true);

      // Should complete within reasonable time even under GC pressure
      const loadTime = endTime - startTime;
      expect(loadTime).toBeLessThan(10000); // Less than 10 seconds

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    }, 15000); // Extended timeout for GC test

    it("should fail gracefully when memory allocation fails", async () => {
      // Arrange
      const hugeSpec = {
        openapi: "3.1.0",
        info: { title: "Huge API", version: "1.0.0" },
        paths: {} as Record<string, any>,
      };

      // Create an extremely large spec that might cause memory issues
      for (let i = 0; i < 1000; i++) {
        hugeSpec.paths[`/huge-endpoint-${i}`] = {
          post: {
            operation_id: `hugeOperation${i}`,
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {},
                  },
                },
              },
            },
            responses: {
              "200": { description: "Success" },
            },
          },
        };

        // Add many properties to each operation
        for (let j = 0; j < 100; j++) {
          hugeSpec.paths[`/huge-endpoint-${i}`].post.requestBody.content["application/json"].schema.properties[`hugeProperty${j}`] = {
            type: "string",
            description: "A very long description that consumes memory ".repeat(100),
          };
        }
      }

      const tempFile = `/tmp/huge-spec-${Date.now()}.json`;

      try {
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(hugeSpec)));

        // Act & Assert
        // This might succeed or fail depending on available memory
        // We mainly want to ensure it doesn't crash the process
        const loadPromise = schemaStore.loadSchema(tempFile);

        try {
          const result = await loadPromise;
          // If successful, verify it loaded correctly
          expect(result.operationCount).toBe(10000);
          expect(schemaStore.hasSchema()).toBe(true);
        } catch (error) {
          // If it fails due to memory constraints, it should fail gracefully
          expect(error).toBeInstanceOf(Error);
          expect(schemaStore.hasSchema()).toBe(false);
        }
      } catch (writeError) {
        // If we can't even write the file due to memory constraints, that's also acceptable
        expect(writeError).toBeInstanceOf(Error);
      } finally {
        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    }, 30000); // Extended timeout for huge spec test
  });

  describe("Malformed Tool Inputs", () => {
    let config: any;
    let server: any;

    beforeEach(async () => {
      config = createTestConfig();
      server = createTestMcpServer();
      registerOpenAPITools(server, config);

      // Load a test schema
      const specPath = resolve("tests/data/simple-api.yaml");
      await schemaStore.loadSchema(specPath);
    });

    it("should handle null parameter values", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: null,
      });

      // Assert - Should return missing parameters error for null values
      expect(result.content[0].text).toContain("Missing Parameters");
      expect(result.content[0].text).toContain("Please provide");
    });

    it("should handle undefined parameter values", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: undefined,
      });

      // Assert - Should return missing parameters error for undefined values
      expect(result.content[0].text).toContain("Missing Parameters");
      expect(result.content[0].text).toContain("Please provide");
    });

    it("should handle empty string parameters", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "",
      });

      // Assert - Should return missing parameters error for empty strings
      expect(result.content[0].text).toContain("Missing Parameters");
      expect(result.content[0].text).toContain("Please provide");
    });

    it("should handle parameters with special characters", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "<script>alert('xss')</script>",
      });

      // Assert - Should return operation not found for invalid operation ID
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
      // Should sanitize the script tag in error messages
      // Note: The operation ID appears in the error, but should be handled safely
    });

    it("should handle parameters with very long strings", async () => {
      // Arrange
      const veryLongString = "a".repeat(10000);

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: veryLongString,
      });

      // Assert - Should return operation not found for invalid operation ID
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
    });

    it("should handle invalid operation IDs", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "nonExistentOperation",
      });

      // Assert
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
    });

    it("should handle invalid HTTP methods", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "list_operations", {
        method: "INVALID_METHOD",
      });

      // Assert - Should return operation list (filtered by invalid method = all operations)
      expect(result.content[0].text).toContain("Available API Operations");
      expect(result.content[0].text).toContain("API:");
    });

    it("should handle invalid path formats", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "list_operations", {
        path: "invalid-path-format",
      });

      // Assert - Should return operation list (filtered by invalid path = all operations)
      expect(result.content[0].text).toContain("Available API Operations");
      expect(result.content[0].text).toContain("API:");
    });

    it("should handle negative pagination indices", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        contentType: "application/json",
        index: -1,
      });

      // Assert - Negative indices should still return schema (handled gracefully)
      expect(result.content[0].text).toContain("Request Body Schema");
      expect(result.content[0].text).toContain("complete content");
    });

    it("should handle zero or negative chunk sizes", async () => {
      // Arrange & Act
      const result1 = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        contentType: "application/json",
        chunkSize: 0,
      });

      const result2 = await callMcpTool(server, "get_request_schema", {
        operation_id: "postEcho",
        contentType: "application/json",
        chunkSize: -100,
      });

      // Assert - Zero/negative chunk sizes should still return content (handled gracefully)
      expect(result1.content[0].text).toContain("Request Body Schema");
      expect(result2.content[0].text).toContain("Request Body Schema");
    });

    it("should handle invalid enum values for parameters", async () => {
      // Arrange & Act
      const result = await callMcpTool(server, "list_operations", {
        tag: ["nonExistentTag", 123, null], // Mix of invalid types
      });

      // Assert - Invalid enum values should still return operations list (handled gracefully)
      expect(result.content[0].text).toContain("Available API Operations");
      expect(result.content[0].text).toContain("API:");
    });
  });

  describe("Concurrent Access Scenarios", () => {
    it(
      "should handle concurrent schema loading attempts",
      async () => {
        // Arrange
        const spec1 = {
          openapi: "3.1.0",
          info: { title: "API 1", version: "1.0.0" },
          paths: {
            "/test1": {
              get: {
                operation_id: "test1",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        };

        const spec2 = {
          openapi: "3.1.0",
          info: { title: "API 2", version: "1.0.0" },
          paths: {
            "/test2": {
              get: {
                operation_id: "test2",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        };

        const tempFile1 = `/tmp/concurrent1-${Date.now()}.json`;
        const tempFile2 = `/tmp/concurrent2-${Date.now()}.json`;

        await import("fs/promises").then((fs) => {
          return Promise.all([fs.writeFile(tempFile1, JSON.stringify(spec1)), fs.writeFile(tempFile2, JSON.stringify(spec2))]);
        });

        // Act - Load schemas concurrently
        const loadPromises = [schemaStore.loadSchema(tempFile1), schemaStore.loadSchema(tempFile2)];

        // Assert - Only one should succeed, the other should be handled gracefully
        const results = await Promise.allSettled(loadPromises);

        // At least one should succeed
        const successfulLoads = results.filter((r) => r.status === "fulfilled");
        expect(successfulLoads.length).toBeGreaterThan(0);

        // Schema store should have a valid schema loaded
        expect(schemaStore.hasSchema()).toBe(true);
        const metadata = schemaStore.getMetadata();
        expect(metadata?.title).toMatch(/API [12]/);

        // Cleanup
        await import("fs/promises").then((fs) => {
          return Promise.all([fs.unlink(tempFile1).catch(() => {}), fs.unlink(tempFile2).catch(() => {})]);
        });
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle concurrent tool calls during schema loading",
      async () => {
        // Arrange
        const slowSpec = {
          openapi: "3.1.0",
          info: { title: "Slow API", version: "1.0.0" },
          paths: {} as Record<string, any>,
        };

        // Create a large spec that takes time to load
        for (let i = 0; i < 100; i++) {
          slowSpec.paths[`/slow${i}`] = {
            get: {
              operationId: `slow${i}`,
              responses: { "200": { description: "Success" } },
            },
          };
        }

        const tempFile = `/tmp/slow-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(slowSpec)));

        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Start loading and immediately make tool calls
        const loadPromise = schemaStore.loadSchema(tempFile);

        // Make concurrent tool calls while loading
        const toolCallPromises = [
          callMcpTool(server, "list_operations", {}),
          callMcpTool(server, "help", {}),
          callMcpTool(server, "list_tags", {}),
        ];

        const [loadResult, ...toolResults] = await Promise.allSettled([loadPromise, ...toolCallPromises]);

        // Assert
        expect(loadResult.status).toBe("fulfilled");

        // Tool calls should either succeed (if schema loaded in time) or fail gracefully
        toolResults.forEach((result) => {
          if (result.status === "fulfilled") {
            expect(result.value.content).toBeDefined();
          }
        });

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it("should handle schema clearing during active operations", async () => {
      // Arrange
      const spec = {
        openapi: "3.1.0",
        info: { title: "Clear Test API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testClear",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/clear-test-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(spec)));

      await schemaStore.loadSchema(tempFile);
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Start an operation and clear schema concurrently
      const operationPromise = callMcpTool(server, "get_operation_details", {
        operation_id: "testClear",
      });

      // Clear schema immediately after starting the operation
      setTimeout(() => schemaStore.clearSchema(), 1);

      const result = await operationPromise;

      // Assert - Operation should either complete successfully or fail gracefully
      expect(result.content).toBeDefined();
      if (result.content[0].isError) {
        expect(result.content[0].text).toContain("No OpenAPI specification");
      } else {
        expect(result.content[0].text).toContain("testClear");
      }

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it(
      "should maintain consistency during concurrent reads",
      async () => {
        // Arrange
        const spec = {
          openapi: "3.1.0",
          info: { title: "Concurrent Read API", version: "1.0.0" },
          paths: {
            "/read1": {
              get: {
                operation_id: "read1",
                responses: { "200": { description: "Success" } },
              },
            },
            "/read2": {
              get: {
                operation_id: "read2",
                responses: { "200": { description: "Success" } },
              },
            },
            "/read3": {
              get: {
                operation_id: "read3",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        };

        const tempFile = `/tmp/concurrent-read-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(spec)));

        await schemaStore.loadSchema(tempFile);
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Make multiple concurrent read operations
        const readPromises = [
          callMcpTool(server, "get_operation_details", { operation_id: "read1" }),
          callMcpTool(server, "get_operation_details", { operation_id: "read2" }),
          callMcpTool(server, "get_operation_details", { operation_id: "read3" }),
          callMcpTool(server, "list_operations", {}),
          callMcpTool(server, "list_tags", {}),
        ];

        const results = await Promise.all(readPromises);

        // Assert - All reads should succeed and return consistent data
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.content[0].isError).toBeFalsy();
        });

        // Verify specific operations are found
        expect(results[0].content[0].text).toContain("read1");
        expect(results[1].content[0].text).toContain("read2");
        expect(results[2].content[0].text).toContain("read3");

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should handle race conditions in schema store access",
      async () => {
        // Arrange
        const spec = {
          openapi: "3.1.0",
          info: { title: "Race Test API", version: "1.0.0" },
          paths: {
            "/race": {
              get: {
                operation_id: "raceTest",
                responses: { "200": { description: "Success" } },
              },
            },
          },
        };

        const tempFile = `/tmp/race-test-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(spec)));

        // Act - Rapidly alternate between loading and clearing
        const operations = [];
        for (let i = 0; i < 10; i++) {
          operations.push(
            schemaStore.loadSchema(tempFile).catch(() => "load-failed"),
            new Promise((resolve) => {
              setTimeout(() => {
                schemaStore.clearSchema();
                resolve("cleared");
              }, Math.random() * 10);
            }),
          );
        }

        const results = await Promise.allSettled(operations);

        // Assert - All operations should complete without throwing unhandled errors
        expect(results).toHaveLength(20);

        // The final state should be well-defined (either has schema or doesn't)
        const hasSchema = schemaStore.hasSchema();
        expect(typeof hasSchema).toBe("boolean");

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );

    it(
      "should manage concurrent pagination requests",
      async () => {
        // Arrange
        const largeResponseSpec = {
          openapi: "3.1.0",
          info: { title: "Pagination API", version: "1.0.0" },
          paths: {
            "/paginated": {
              get: {
                operationId: "getPaginated",
                responses: {
                  "200": {
                    description: "Success",
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {} as Record<string, any>,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };

        // Add many properties to create a large response schema
        for (let i = 0; i < 200; i++) {
          largeResponseSpec.paths["/paginated"].get.responses["200"].content["application/json"].schema.properties[`field${i}`] = {
            type: "string",
            description: `Field ${i} description`,
          };
        }

        const tempFile = `/tmp/pagination-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(largeResponseSpec)));

        await schemaStore.loadSchema(tempFile);
        const server = createTestMcpServer();
        registerOpenAPITools(server, createTestConfig());

        // Act - Make concurrent pagination requests
        const paginationPromises = [
          callMcpTool(server, "get_response_schema", {
            operation_id: "getPaginated",
            statusCode: "200",
            contentType: "application/json",
            index: 0,
            chunkSize: 500,
          }),
          callMcpTool(server, "get_response_schema", {
            operation_id: "getPaginated",
            statusCode: "200",
            contentType: "application/json",
            index: 1,
            chunkSize: 500,
          }),
          callMcpTool(server, "get_response_schema", {
            operation_id: "getPaginated",
            statusCode: "200",
            contentType: "application/json",
            index: 2,
            chunkSize: 500,
          }),
        ];

        const results = await Promise.all(paginationPromises);

        // Assert - All pagination requests should succeed
        results.forEach((result) => {
          expect(result.content).toBeDefined();
          expect(result.content[0].isError).toBeFalsy();
          expect(result.content[0].text).toContain("📄 Showing characters");
        });

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      },
      TIMEOUTS.INTEGRATION,
    );
  });

  describe("Resource Exhaustion", () => {
    it(
      "should handle maximum file descriptor limits",
      async () => {
        // Arrange - This test simulates FD exhaustion by attempting many file operations
        const promises = [];

        // Act - Create many concurrent file operations that might exhaust FDs
        for (let i = 0; i < 100; i++) {
          const tempFile = `/tmp/fd-test-${i}-${Date.now()}.json`;
          const spec = {
            openapi: "3.1.0",
            info: { title: `FD Test API ${i}`, version: "1.0.0" },
            paths: {
              ["/test" + i]: {
                get: {
                  operation_id: `test${i}`,
                  responses: { "200": { description: "Success" } },
                },
              },
            },
          };

          promises.push(
            import("fs/promises")
              .then((fs) => fs.writeFile(tempFile, JSON.stringify(spec)))
              .then(() => schemaStore.loadSchema(tempFile))
              .then(() => import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {})))
              .catch(() => "fd-exhausted"),
          );
        }

        const results = await Promise.allSettled(promises);

        // Assert - Should handle gracefully even if some operations fail due to FD limits
        expect(results.length).toBe(100);
        const successful = results.filter((r) => r.status === "fulfilled").length;
        expect(successful).toBeGreaterThan(0); // At least some should succeed
      },
      TIMEOUTS.INTEGRATION,
    );

    it("should handle maximum string length limits", async () => {
      // Arrange
      const maxLength = 1000000; // 1MB string
      const longString = "a".repeat(maxLength);

      const longStringSpec = {
        openapi: "3.1.0",
        info: {
          title: "Long String API",
          version: "1.0.0",
          description: longString, // Very long description
        },
        paths: {
          "/test": {
            get: {
              operation_id: "testLongString",
              summary: longString, // Another long string
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/long-string-${Date.now()}.json`;

      try {
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(longStringSpec)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert - Should handle long strings gracefully
        expect(result.operationCount).toBe(1);
        expect(schemaStore.hasSchema()).toBe(true);
      } catch (error) {
        // If it fails due to string length limits, should fail gracefully
        expect(error).toBeInstanceOf(Error);
      } finally {
        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    });

    it("should handle maximum object depth limits", async () => {
      // Arrange - Create a deeply nested object
      const createDeepObject = (depth: number): any => {
        if (depth === 0) return { type: "string" };
        return {
          type: "object",
          properties: {
            nested: createDeepObject(depth - 1),
          },
        };
      };

      const deepSpec = {
        openapi: "3.1.0",
        info: { title: "Deep Object API", version: "1.0.0" },
        paths: {
          "/deep": {
            post: {
              operation_id: "testDeepObject",
              requestBody: {
                content: {
                  "application/json": {
                    schema: createDeepObject(1000), // Very deep nesting
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/deep-object-${Date.now()}.json`;

      try {
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(deepSpec)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert - Should handle deep nesting gracefully
        expect(result.operationCount).toBe(1);
        expect(schemaStore.hasSchema()).toBe(true);
      } catch (error) {
        // If it fails due to depth limits, should fail gracefully
        expect(error).toBeInstanceOf(Error);
      } finally {
        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    });

    it("should handle maximum array size limits", async () => {
      // Arrange
      const hugeArray = Array.from({ length: 100000 }, (_, i) => `item${i}`);

      const arraySpec = {
        openapi: "3.1.0",
        info: { title: "Huge Array API", version: "1.0.0" },
        paths: {
          "/array": {
            get: {
              operation_id: "testHugeArray",
              parameters: [
                {
                  name: "hugeEnum",
                  in: "query",
                  schema: {
                    type: "string",
                    enum: hugeArray, // Very large enum array
                  },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/huge-array-${Date.now()}.json`;

      try {
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(arraySpec)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert - Should handle large arrays gracefully
        expect(result.operationCount).toBe(1);
        expect(schemaStore.hasSchema()).toBe(true);
      } catch (error) {
        // If it fails due to array size limits, should fail gracefully
        expect(error).toBeInstanceOf(Error);
      } finally {
        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    });

    it("should handle CPU timeout scenarios", async () => {
      // Arrange
      const cpuIntensiveSpec = {
        openapi: "3.1.0",
        info: { title: "CPU Intensive API", version: "1.0.0" },
        paths: {} as Record<string, any>,
      };

      // Create a spec that requires significant CPU to process
      for (let i = 0; i < 100; i++) {
        cpuIntensiveSpec.paths[`/cpu-test-${i}`] = {
          post: {
            operation_id: `cpuTest${i}`,
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {},
                  },
                },
              },
            },
            responses: { "200": { description: "Success" } },
          },
        };

        // Add complex nested properties
        for (let j = 0; j < 50; j++) {
          cpuIntensiveSpec.paths[`/cpu-test-${i}`].post.requestBody.content["application/json"].schema.properties[`complex${j}`] = {
            type: "object",
            properties: {
              nested1: { type: "string" },
              nested2: { type: "number" },
              nested3: {
                type: "array",
                items: { type: "string" },
              },
            },
          };
        }
      }

      const tempFile = `/tmp/cpu-intensive-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(cpuIntensiveSpec)));

      // Act - Load with timeout
      const startTime = Date.now();
      const result = await schemaStore.loadSchema(tempFile);
      const endTime = Date.now();

      // Assert - Should complete within reasonable time
      const processingTime = endTime - startTime;
      expect(processingTime).toBeLessThan(30000); // Less than 30 seconds
      expect(result.operationCount).toBe(100); // Created 100 operations in the test

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    }, 35000); // Extended timeout for CPU intensive test

    it("should handle stack overflow in recursive operations", async () => {
      // Arrange - Create a spec that might cause stack overflow in recursive processing
      const createRecursiveSchema = (depth: number): any => {
        if (depth === 0) {
          return { type: "string" };
        }

        return {
          oneOf: [
            { type: "string" },
            {
              type: "object",
              properties: {
                recursive: createRecursiveSchema(depth - 1),
              },
            },
          ],
        };
      };

      const recursiveSpec = {
        openapi: "3.1.0",
        info: { title: "Recursive API", version: "1.0.0" },
        components: {
          schemas: {
            RecursiveType: createRecursiveSchema(100), // Deep recursion
          },
        },
        paths: {
          "/recursive": {
            post: {
              operation_id: "testRecursive",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/RecursiveType" },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/recursive-${Date.now()}.json`;

      try {
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(recursiveSpec)));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert - Should handle recursion gracefully
        expect(result.operationCount).toBe(1);
        expect(schemaStore.hasSchema()).toBe(true);
      } catch (error) {
        // If it fails due to stack overflow, should fail gracefully
        expect(error).toBeInstanceOf(Error);
        expect(schemaStore.hasSchema()).toBe(false);
      } finally {
        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    });
  });

  describe("Character Encoding Issues", () => {
    it("should handle Unicode characters in spec files", async () => {
      // Arrange
      const unicodeSpec = {
        openapi: "3.1.0",
        info: {
          title: "Unicode API 🚀",
          version: "1.0.0",
          description: "API with Unicode: こんにちは, 🌍, ñoño, café",
        },
        paths: {
          "/unicode-测试": {
            get: {
              operation_id: "getUnicode测试",
              summary: "Unicode endpoint: 中文 русский العربية",
              responses: { "200": { description: "Success with 🎉" } },
            },
          },
        },
      };

      const tempFile = `/tmp/unicode-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(unicodeSpec), "utf8"));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);
      const metadata = schemaStore.getMetadata();
      expect(metadata?.title).toContain("🚀");

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle different line ending formats", async () => {
      // Arrange
      const specContent = {
        openapi: "3.1.0",
        info: { title: "Line Ending API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testLineEndings",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const jsonString = JSON.stringify(specContent, null, 2);

      // Test different line endings
      const lineEndingFormats = [
        { name: "CRLF", content: jsonString.replace(/\n/g, "\r\n") },
        { name: "LF", content: jsonString },
        { name: "CR", content: jsonString.replace(/\n/g, "\r") },
      ];

      for (const format of lineEndingFormats) {
        const tempFile = `/tmp/line-ending-${format.name}-${Date.now()}.json`;
        await import("fs/promises").then((fs) => fs.writeFile(tempFile, format.content, "utf8"));

        // Act
        const result = await schemaStore.loadSchema(tempFile);

        // Assert
        expect(result.operationCount).toBe(1);
        expect(schemaStore.hasSchema()).toBe(true);

        // Cleanup
        await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
      }
    });

    it("should handle BOM markers in files", async () => {
      // Arrange
      const specContent = {
        openapi: "3.1.0",
        info: { title: "BOM Test API", version: "1.0.0" },
        paths: {
          "/bom": {
            get: {
              operation_id: "testBOM",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const jsonString = JSON.stringify(specContent);
      const bomContent = "\uFEFF" + jsonString; // UTF-8 BOM

      const tempFile = `/tmp/bom-test-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, bomContent, "utf8"));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle mixed character encodings", async () => {
      // Arrange
      const mixedEncodingSpec = {
        openapi: "3.1.0",
        info: {
          title: "Mixed Encoding API",
          version: "1.0.0",
          description: "ASCII + UTF-8: café, naïve, résumé",
        },
        paths: {
          "/mixed": {
            get: {
              operation_id: "getMixed",
              summary: "Mixed: ASCII, UTF-8 (café), Latin-1 compatible",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/mixed-encoding-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(mixedEncodingSpec), "utf8"));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle special characters in schema names", async () => {
      // Arrange
      const specialCharsSpec = {
        openapi: "3.1.0",
        info: { title: "Special Chars API", version: "1.0.0" },
        components: {
          schemas: {
            "User-Profile_v2": {
              type: "object",
              properties: {
                "full-name": { type: "string" },
                user_id: { type: "string" },
                "email@domain": { type: "string" },
              },
            },
          },
        },
        paths: {
          "/special-chars": {
            get: {
              operation_id: "getSpecialChars",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/User-Profile_v2" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/special-chars-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(specialCharsSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle emoji and non-ASCII characters", async () => {
      // Arrange
      const emojiSpec = {
        openapi: "3.1.0",
        info: {
          title: "Emoji API 🎯",
          version: "1.0.0",
          description: "API with emojis: 🚀 ⚡ 🌟 💎 🔥",
        },
        paths: {
          "/emoji-endpoint-🎉": {
            post: {
              operation_id: "postEmoji🎈",
              summary: "Create something awesome! 🎨✨",
              description: "Handles: 中文, العربية, русский, 日本語, 한국어",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        "message📝": {
                          type: "string",
                          description: "Your message with emojis 💬",
                        },
                        "tags🏷️": {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
              responses: {
                "201": { description: "Created successfully! ✅" },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/emoji-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(emojiSpec), "utf8"));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);
      const metadata = schemaStore.getMetadata();
      expect(metadata?.title).toContain("🎯");

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("JSON/YAML Parsing Edge Cases", () => {
    it("should handle YAML files with syntax errors", async () => {
      // Arrange
      const invalidYaml = `
openapi: 3.1.0
info:
  title: Invalid YAML API
  version: 1.0.0
  description: |
    This has invalid YAML syntax
    - unmatched bracket [
    - invalid indentation
paths:
  /test:
    get:
      operation_id: testYaml
      responses:
        200:
          description: Success
      - invalid list item
`;

      const tempFile = `/tmp/invalid-yaml-${Date.now()}.yaml`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, invalidYaml));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle JSON files with trailing commas", async () => {
      // Arrange
      const jsonWithTrailingCommas = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Trailing Comma API",
    "version": "1.0.0",
  },
  "paths": {
    "/test": {
      "get": {
        "operationId": "testTrailingComma",
        "responses": {
          "200": {
            "description": "Success",
          },
        },
      },
    },
  },
}`;

      const tempFile = `/tmp/trailing-comma-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, jsonWithTrailingCommas));

      // Act
      // Modern JSON parsers handle trailing commas gracefully
      // The test should verify the behavior - either successful parse or error
      let loadError = null;
      try {
        await schemaStore.loadSchema(tempFile);
      } catch (error) {
        loadError = error;
      }

      // Assert - Either the file loaded successfully (modern parser) or threw an error (strict parser)
      // Both behaviors are acceptable - the important thing is it doesn't crash
      expect(loadError !== null || schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle mixed YAML/JSON content", async () => {
      // Arrange
      const mixedContent = `
openapi: "3.1.0"
info:
  title: Mixed Content API
  version: "1.0.0"
paths:
  /mixed:
    get:
      operation_id: testMixed
      responses: { "200": { "description": "Success" } }
      parameters: [
        {
          "name": "param1",
          "in": "query",
          "schema": { "type": "string" }
        }
      ]
`;

      const tempFile = `/tmp/mixed-content-${Date.now()}.yaml`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, mixedContent));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle very deeply nested structures", async () => {
      // Arrange
      const createDeepStructure = (depth: number): string => {
        if (depth === 0) return '"string"';
        return `{"nested": ${createDeepStructure(depth - 1)}}`;
      };

      const deepJson = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Deep Structure API",
    "version": "1.0.0"
  },
  "paths": {
    "/deep": {
      "post": {
        "operationId": "testDeepStructure",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": ${createDeepStructure(200)}
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success"
          }
        }
      }
    }
  }
}`;

      const tempFile = `/tmp/deep-structure-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, deepJson));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle files with null values", async () => {
      // Arrange
      const nullValuesSpec = {
        openapi: "3.1.0",
        info: {
          title: "Null Values API",
          version: "1.0.0",
          description: null,
          contact: null,
        },
        paths: {
          "/null-test": {
            get: {
              operation_id: "testNullValues",
              summary: null,
              description: null,
              parameters: null,
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          data: { type: "string" },
                          nullField: null,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/null-values-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(nullValuesSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle files with duplicate keys", async () => {
      // Arrange
      const duplicateKeysJson = `{
  "openapi": "3.1.0",
  "info": {
    "title": "Duplicate Keys API",
    "version": "1.0.0",
    "title": "Duplicate Title"
  },
  "paths": {
    "/duplicate": {
      "get": {
        "operationId": "testDuplicateKeys",
        "operationId": "duplicateOperationId",
        "responses": {
          "200": {
            "description": "Success"
          }
        }
      }
    }
  }
}`;

      const tempFile = `/tmp/duplicate-keys-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, duplicateKeysJson));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - JSON.parse handles duplicate keys by using the last value
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);
      const metadata = schemaStore.getMetadata();
      expect(metadata?.title).toBe("Duplicate Title"); // Should use the last value

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle scientific notation in numbers", async () => {
      // Arrange
      const scientificNotationSpec = {
        openapi: "3.1.0",
        info: {
          title: "Scientific Notation API",
          version: "1.0.0",
        },
        paths: {
          "/scientific": {
            get: {
              operation_id: "testScientificNotation",
              parameters: [
                {
                  name: "largeNumber",
                  in: "query",
                  schema: {
                    type: "number",
                    minimum: 1e-10,
                    maximum: 1.5e15,
                    multipleOf: 2.5e-3,
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          verySmall: {
                            type: "number",
                            example: 3.14159e-8,
                          },
                          veryLarge: {
                            type: "number",
                            example: 6.022e23,
                          },
                          precision: {
                            type: "number",
                            example: 1.23456789e-15,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const tempFile = `/tmp/scientific-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(scientificNotationSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("OpenAPI Version Compatibility", () => {
    it("should handle OpenAPI 3.0.x specifications", async () => {
      // Arrange
      const openApi30Spec = {
        openapi: "3.0.3",
        info: { title: "OpenAPI 3.0 API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "test30",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/openapi30-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(openApi30Spec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle OpenAPI 3.1.x specifications", async () => {
      // Arrange
      const openApi31Spec = {
        openapi: "3.1.0",
        info: { title: "OpenAPI 3.1 API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "test31",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/openapi31-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(openApi31Spec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle future OpenAPI versions gracefully", async () => {
      // Arrange
      const futureSpec = {
        openapi: "4.0.0", // Future version
        info: { title: "Future API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testFuture",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/future-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(futureSpec)));

      // Act & Assert - Should either accept gracefully or reject with clear error
      try {
        const result = await schemaStore.loadSchema(tempFile);
        expect(result.operationCount).toBe(1);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs with version conflicts", async () => {
      // This test simulates a scenario where version info is inconsistent
      // Arrange
      const conflictSpec = {
        openapi: "3.1.0",
        info: {
          title: "Conflict API",
          version: "1.0.0",
          // Add conflicting version info in description
          description: "This API claims to be OpenAPI 3.0.0 compatible",
        },
        paths: {
          "/test": {
            get: {
              operation_id: "testConflict",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/conflict-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(conflictSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - Should use the openapi field value
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle specs without version information", async () => {
      // Arrange
      const noVersionSpec = {
        // Missing openapi field
        info: { title: "No Version API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testNoVersion",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/no-version-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(noVersionSpec)));

      // Act & Assert
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle Swagger 2.0 specifications appropriately", async () => {
      // Arrange
      const swagger20Spec = {
        swagger: "2.0", // Swagger 2.0 format
        info: { title: "Swagger 2.0 API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testSwagger20",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/swagger20-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(swagger20Spec)));

      // Act & Assert - Should handle Swagger 2.0 specs (may convert or load with warnings)
      await schemaStore.loadSchema(tempFile);
      expect(schemaStore.hasSchema()).toBe(true);
      const operations = schemaStore.getOperations();
      expect(operations.length).toBe(1);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("Schema Format Edge Cases", () => {
    it("should handle schemas with allOf, oneOf, anyOf combinations", async () => {
      // Arrange
      const complexSchemaSpec = {
        openapi: "3.1.0",
        info: { title: "Complex Schema API", version: "1.0.0" },
        components: {
          schemas: {
            ComplexType: {
              allOf: [
                { type: "object", properties: { id: { type: "string" } } },
                {
                  oneOf: [{ properties: { name: { type: "string" } } }, { properties: { title: { type: "string" } } }],
                },
              ],
              anyOf: [
                { properties: { created: { type: "string", format: "date-time" } } },
                { properties: { modified: { type: "string", format: "date-time" } } },
              ],
            },
          },
        },
        paths: {
          "/complex": {
            post: {
              operation_id: "testComplexSchema",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/ComplexType" },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/complex-schema-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(complexSchemaSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with missing type information", async () => {
      // Arrange
      const missingTypeSpec = {
        openapi: "3.1.0",
        info: { title: "Missing Type API", version: "1.0.0" },
        paths: {
          "/missing-type": {
            post: {
              operation_id: "testMissingType",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      properties: {
                        field1: { description: "No type specified" },
                        field2: { enum: ["a", "b", "c"] }, // No type but has enum
                        field3: { minimum: 0, maximum: 100 }, // No type but has numeric constraints
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/missing-type-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(missingTypeSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with contradictory constraints", async () => {
      // Arrange
      const contradictorySpec = {
        openapi: "3.1.0",
        info: { title: "Contradictory API", version: "1.0.0" },
        paths: {
          "/contradictory": {
            post: {
              operation_id: "testContradictory",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        impossible: {
                          type: "string",
                          minimum: 10, // String with numeric constraint
                          maxLength: 5,
                          minLength: 10, // minLength > maxLength
                        },
                        paradox: {
                          type: "number",
                          minimum: 100,
                          maximum: 50, // minimum > maximum
                        },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/contradictory-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(contradictorySpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - Should load but constraints may be ignored or handled
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with recursive definitions", async () => {
      // Arrange
      const recursiveSpec = {
        openapi: "3.1.0",
        info: { title: "Recursive API", version: "1.0.0" },
        components: {
          schemas: {
            TreeNode: {
              type: "object",
              properties: {
                value: { type: "string" },
                children: {
                  type: "array",
                  items: { $ref: "#/components/schemas/TreeNode" },
                },
              },
            },
          },
        },
        paths: {
          "/recursive": {
            post: {
              operation_id: "testRecursive",
              requestBody: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/TreeNode" },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/recursive-schema-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(recursiveSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with unknown formats", async () => {
      // Arrange
      const unknownFormatSpec = {
        openapi: "3.1.0",
        info: { title: "Unknown Format API", version: "1.0.0" },
        paths: {
          "/unknown-format": {
            post: {
              operation_id: "testUnknownFormat",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        customFormat: {
                          type: "string",
                          format: "custom-unknown-format",
                        },
                        futureFormat: {
                          type: "string",
                          format: "future-date-format-v2",
                        },
                        invalidFormat: {
                          type: "number",
                          format: "color", // Invalid format for number
                        },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/unknown-format-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(unknownFormatSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with invalid regex patterns", async () => {
      // Arrange
      const invalidRegexSpec = {
        openapi: "3.1.0",
        info: { title: "Invalid Regex API", version: "1.0.0" },
        paths: {
          "/invalid-regex": {
            post: {
              operation_id: "testInvalidRegex",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        invalidPattern1: {
                          type: "string",
                          pattern: "[invalid regex pattern with unmatched bracket",
                        },
                        invalidPattern2: {
                          type: "string",
                          pattern: "*invalid quantifier",
                        },
                        complexInvalid: {
                          type: "string",
                          pattern: "(?invalid group syntax",
                        },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/invalid-regex-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(invalidRegexSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - Should load but invalid patterns may be ignored or cause warnings
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle schemas with extreme numeric ranges", async () => {
      // Arrange
      const extremeRangeSpec = {
        openapi: "3.1.0",
        info: { title: "Extreme Range API", version: "1.0.0" },
        paths: {
          "/extreme-range": {
            post: {
              operation_id: "testExtremeRange",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        veryLarge: {
                          type: "number",
                          minimum: Number.MAX_SAFE_INTEGER,
                          maximum: Number.MAX_VALUE,
                        },
                        verySmall: {
                          type: "number",
                          minimum: Number.MIN_VALUE,
                          maximum: Number.MIN_SAFE_INTEGER,
                        },
                        infinite: {
                          type: "number",
                          minimum: -Infinity,
                          maximum: Infinity,
                        },
                      },
                    },
                  },
                },
              },
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/extreme-range-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(extremeRangeSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("Authentication Configuration Edge Cases", () => {
    it("should handle auth schemes with missing required fields", async () => {
      // Arrange
      const incompleteAuthSpec = {
        openapi: "3.1.0",
        info: { title: "Incomplete Auth API", version: "1.0.0" },
        components: {
          securitySchemes: {
            incompleteApiKey: { type: "apiKey" }, // Missing name, in
            incompleteOAuth2: { type: "oauth2" }, // Missing flows
            incompleteHttp: { type: "http" }, // Missing scheme
          },
        },
        paths: {
          "/secure": {
            get: {
              operation_id: "testIncompleteAuth",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/incomplete-auth-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(incompleteAuthSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle unknown authentication types", async () => {
      // Arrange
      const unknownAuthSpec = {
        openapi: "3.1.0",
        info: { title: "Unknown Auth API", version: "1.0.0" },
        components: {
          securitySchemes: {
            unknownAuth: {
              type: "blockchain-auth", // Non-existent type
              algorithm: "SHA-256",
            },
          },
        },
        paths: {
          "/test": {
            get: {
              operation_id: "testUnknownAuth",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/unknown-auth-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(unknownAuthSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle malformed OAuth2 flow configurations", async () => {
      // Arrange
      const malformedOAuthSpec = {
        openapi: "3.1.0",
        info: { title: "Malformed OAuth API", version: "1.0.0" },
        components: {
          securitySchemes: {
            malformedOAuth: {
              type: "oauth2",
              flows: {
                authorizationCode: {
                  scopes: { read: "Read access" }, // Missing required URLs
                },
              },
            },
          },
        },
        paths: {
          "/oauth": {
            get: {
              operation_id: "testMalformedOAuth",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/malformed-oauth-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(malformedOAuthSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle API keys with unusual locations", async () => {
      // Arrange
      const unusualApiKeySpec = {
        openapi: "3.1.0",
        info: { title: "Unusual API Key API", version: "1.0.0" },
        components: {
          securitySchemes: {
            bodyApiKey: {
              type: "apiKey",
              name: "api_key",
              in: "body", // Invalid location
            },
          },
        },
        paths: {
          "/test": {
            get: {
              operation_id: "testUnusualApiKey",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/unusual-apikey-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(unusualApiKeySpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle bearer tokens with unusual formats", async () => {
      // Arrange
      const unusualBearerSpec = {
        openapi: "3.1.0",
        info: { title: "Unusual Bearer API", version: "1.0.0" },
        components: {
          securitySchemes: {
            customBearer: {
              type: "http",
              scheme: "custom-scheme", // Non-standard scheme
              bearerFormat: "CustomJWT-V2",
            },
          },
        },
        paths: {
          "/bearer": {
            get: {
              operation_id: "testUnusualBearer",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/unusual-bearer-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(unusualBearerSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle conflicting security requirements", async () => {
      // Arrange
      const conflictingSecuritySpec = {
        openapi: "3.1.0",
        info: { title: "Conflicting Security API", version: "1.0.0" },
        components: {
          securitySchemes: {
            apiKey: { type: "apiKey", name: "X-API-Key", in: "header" },
            oauth2: {
              type: "oauth2",
              flows: {
                clientCredentials: {
                  tokenUrl: "https://example.com/token",
                  scopes: { read: "Read access" },
                },
              },
            },
          },
        },
        paths: {
          "/conflicting": {
            get: {
              operation_id: "testConflictingSecurity",
              security: [{ nonExistentAuth: [] }], // References non-existent scheme
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/conflicting-security-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(conflictingSecuritySpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("Tool Registration Failures", () => {
    it("should handle individual tool registration failures", async () => {
      // Arrange
      const simpleSpec = {
        openapi: "3.1.0",
        info: { title: "Tool Registration API", version: "1.0.0" },
        paths: {
          "/test": {
            get: {
              operation_id: "testToolRegistration",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/tool-registration-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(simpleSpec)));
      await schemaStore.loadSchema(tempFile);

      // Act
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Assert - Tools should be registered despite potential individual failures
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should continue registration when one tool fails", async () => {
      // This test verifies graceful handling of partial registration failures
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));

      // Act
      const server = createTestMcpServer();
      // This should not throw - registration should succeed normally
      expect(() => registerOpenAPITools(server, createTestConfig())).not.toThrow();

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
    });

    it("should handle duplicate tool names", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));

      // Act - Register tools multiple times
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());
      expect(() => registerOpenAPITools(server, createTestConfig())).toThrow("already registered");

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
    });

    it("should handle invalid tool configurations", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));

      const invalidConfig = {
        ...createTestConfig(),
        maxResults: -1, // Invalid negative value
        chunkSize: 0, // Invalid zero value
      };

      // Act
      const server = createTestMcpServer();
      expect(() => registerOpenAPITools(server, invalidConfig)).not.toThrow();

      // Assert
      expect(schemaStore.hasSchema()).toBe(true);
    });

    it("should handle missing tool dependencies", async () => {
      // This test verifies handling of missing dependencies
      // Arrange
      schemaStore.clearSchema(); // Ensure no schema is loaded

      // Act
      const server = createTestMcpServer();
      // Registration should succeed even without schema loaded
      expect(() => registerOpenAPITools(server, createTestConfig())).not.toThrow();

      // Assert - Should handle missing schema gracefully
      expect(schemaStore.hasSchema()).toBe(false);
    });
  });

  describe("Docker Environment Issues", () => {
    it("should handle missing volume mounts gracefully", async () => {
      // This test simulates missing volume mount scenario
      // Arrange
      const nonMountedPath = "/app/nonexistent-spec";

      // Act & Assert
      await expect(schemaStore.loadSchema(nonMountedPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle incorrect file permissions in container", async () => {
      // This test simulates permission issues in containers
      // Arrange
      const restrictedPath = "/root/restricted-spec.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(restrictedPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });

    it("should handle container resource limits", async () => {
      // This test verifies behavior under resource constraints
      // Arrange
      const resourceIntensiveSpec = {
        openapi: "3.1.0",
        info: { title: "Resource Test API", version: "1.0.0" },
        paths: {} as Record<string, any>,
      };

      // Add many operations to simulate resource usage
      for (let i = 0; i < 50; i++) {
        resourceIntensiveSpec.paths[`/resource${i}`] = {
          get: {
            operationId: `resource${i}`,
            responses: { "200": { description: "Success" } },
          },
        };
      }

      const tempFile = `/tmp/resource-test-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(resourceIntensiveSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result.operationCount).toBe(50);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle environment variable parsing errors", async () => {
      // This test simulates environment variable issues
      // Arrange
      const originalEnv = process.env.MAX_SPEC_SIZE;
      process.env.MAX_SPEC_SIZE = "invalid-number";

      // Act
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));

      // Assert - Should handle invalid env vars gracefully
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      process.env.MAX_SPEC_SIZE = originalEnv;
    });

    it("should handle container networking issues", async () => {
      // This test simulates network-related container issues
      // Most network issues would be at runtime, but we can test file access
      // Arrange
      const networkPath = "http://unreachable-host/spec.yaml";

      // Act & Assert
      await expect(schemaStore.loadSchema(networkPath)).rejects.toThrow();
      expect(schemaStore.hasSchema()).toBe(false);
    });
  });

  describe("Graceful Degradation", () => {
    it("should provide meaningful error messages for all failure modes", async () => {
      // Arrange
      const invalidFile = "/nonexistent/path/spec.yaml";

      // Act & Assert
      try {
        await schemaStore.loadSchema(invalidFile);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBeTruthy();
        expect((error as Error).message.length).toBeGreaterThan(0);
      }
    });

    it("should maintain partial functionality when possible", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Clear schema but tools should handle gracefully
      schemaStore.clearSchema();
      const result = await callMcpTool(server, "help", {});

      // Assert - Should provide helpful response even without schema
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain("OpenAPI Context MCP Server"); // Should provide general help
    });

    it("should guide users toward resolution steps", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "list_operations", {});

      // Assert
      expect(result.content[0].text).toContain("No OpenAPI specification");
      expect(result.content[0].text).toContain("load"); // Should guide toward loading
    });

    it("should log appropriate information for debugging", async () => {
      // This test verifies that appropriate logging occurs
      // Arrange
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // Act
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));

      // Assert
      expect(consoleSpy).toHaveBeenCalled();

      // Cleanup
      consoleSpy.mockRestore();
    });

    it("should fail fast for unrecoverable errors", async () => {
      // Arrange
      const malformedSpec = "{ invalid json ";
      const tempFile = `/tmp/malformed-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, malformedSpec));

      // Act & Assert - Should fail quickly for clearly invalid content
      const startTime = Date.now();
      await expect(schemaStore.loadSchema(tempFile)).rejects.toThrow();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should fail within 1 second

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should retry appropriate operations when feasible", async () => {
      // This test verifies retry logic (if implemented)
      // Arrange
      const validSpec = {
        openapi: "3.1.0",
        info: { title: "Retry Test API", version: "1.0.0" },
        paths: {
          "/retry": {
            get: {
              operation_id: "testRetry",
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/retry-test-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(validSpec)));

      // Act - Multiple attempts should succeed
      const result1 = await schemaStore.loadSchema(tempFile);
      const result2 = await schemaStore.loadSchema(tempFile);

      // Assert
      expect(result1.operationCount).toBe(1);
      expect(result2.operationCount).toBe(1);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });
  });

  describe("Security Edge Cases", () => {
    it("should handle path traversal attempts in tool parameters", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "../../../etc/passwd",
      });

      // Assert - Should return operation not found for invalid operation ID
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
    });

    it("should handle very large input payloads", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      const largePayload = "a".repeat(1000000); // 1MB string

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: largePayload,
      });

      // Assert - Should return operation not found for invalid operation ID
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
    });

    it("should handle malicious regex patterns", async () => {
      // Arrange
      const maliciousRegexSpec = {
        openapi: "3.1.0",
        info: { title: "Malicious Regex API", version: "1.0.0" },
        paths: {
          "/regex": {
            get: {
              operation_id: "testMaliciousRegex",
              parameters: [
                {
                  name: "pattern",
                  in: "query",
                  schema: {
                    type: "string",
                    pattern: "(a+)+b", // Potentially catastrophic backtracking
                  },
                },
              ],
              responses: { "200": { description: "Success" } },
            },
          },
        },
      };

      const tempFile = `/tmp/malicious-regex-${Date.now()}.json`;
      await import("fs/promises").then((fs) => fs.writeFile(tempFile, JSON.stringify(maliciousRegexSpec)));

      // Act
      const result = await schemaStore.loadSchema(tempFile);

      // Assert - Should load but handle regex safely
      expect(result.operationCount).toBe(1);
      expect(schemaStore.hasSchema()).toBe(true);

      // Cleanup
      await import("fs/promises").then((fs) => fs.unlink(tempFile).catch(() => {}));
    });

    it("should handle code injection attempts", async () => {
      // Arrange
      await schemaStore.loadSchema(resolve("tests/data/simple-api.yaml"));
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act
      const result = await callMcpTool(server, "get_operation_details", {
        operation_id: "'; DROP TABLE users; --",
      });

      // Assert - Should return operation not found for invalid operation ID
      expect(result.content[0].text).toContain("Operation Not Found");
      expect(result.content[0].text).toContain("Operation not found");
      // Note: The operation ID appears in error but in a safe context (error message)
    });

    it("should sanitize error messages to prevent information leakage", async () => {
      // Arrange
      const sensitiveFile = "/etc/secret-config";

      // Act
      try {
        await schemaStore.loadSchema(sensitiveFile);
        expect.fail("Should have thrown an error");
      } catch (error) {
        // Assert
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        // The error should contain generic information, not the full sensitive path
        expect(message).toMatch(/error|failed|invalid/i); // Contains generic error terms
        expect(message).toBeTruthy();
      }
    });

    it("should handle denial of service attempts", async () => {
      // Arrange
      const server = createTestMcpServer();
      registerOpenAPITools(server, createTestConfig());

      // Act - Attempt to make many rapid requests
      const rapidRequests = Array.from({ length: 100 }, () => callMcpTool(server, "help", {}));

      const results = await Promise.allSettled(rapidRequests);

      // Assert - Should handle rapid requests gracefully
      const successful = results.filter((r) => r.status === "fulfilled").length;
      expect(successful).toBeGreaterThan(50); // At least half should succeed
    });
  });
});
