import { describe, it, expect } from "vitest";
import {
  simplifySchema,
  formatCompactSchema,
  deduplicateExamples,
  extractRequiredFields,
  summarizeParameters,
  summarizeResponses,
  summarizeAuth,
} from "@/utils/schema-formatter.js";

describe("Schema Formatter", () => {
  describe("simplifySchema", () => {
    it("should handle null/undefined schemas", () => {
      expect(simplifySchema(null)).toBeNull();
      expect(simplifySchema(undefined)).toBeUndefined();
    });

    it("should collapse allOf patterns", () => {
      const schema = {
        allOf: [
          { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          { type: "object", properties: { age: { type: "number" } }, required: ["age"] },
        ],
      };

      const result = simplifySchema(schema);

      expect(result.type).toBe("object");
      expect(result.properties.name).toEqual({ type: "string" });
      expect(result.properties.age).toEqual({ type: "number" });
      expect(result.required).toEqual(["name", "age"]);
      expect(result.allOf).toBeUndefined();
    });

    it("should simplify UUID patterns", () => {
      const schema = {
        type: "string",
        format: "uuid",
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
      };

      const result = simplifySchema(schema);

      expect(result.type).toBe("string");
      expect(result.format).toBe("uuid");
      expect(result.pattern).toBeUndefined();
    });

    it("should limit examples when specified", () => {
      const schema = {
        type: "string",
        examples: ["example1", "example2", "example3"],
      };

      const result = simplifySchema(schema, { maxExamples: 2 });

      expect(result.examples).toHaveLength(2);
      expect(result.examples).toEqual(["example1", "example2"]);
    });

    it("should remove examples when includeExamples is false", () => {
      const schema = {
        type: "string",
        examples: ["example1", "example2"],
      };

      const result = simplifySchema(schema, { includeExamples: false });

      expect(result.examples).toBeUndefined();
    });

    it("should remove descriptions when includeDescriptions is false", () => {
      const schema = {
        type: "string",
        description: "A string field",
      };

      const result = simplifySchema(schema, { includeDescriptions: false });

      expect(result.description).toBeUndefined();
    });

    it("should handle nested properties recursively", () => {
      const schema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
              },
            },
          },
        },
      };

      const result = simplifySchema(schema);

      expect(result.properties.user.properties.id.format).toBe("uuid");
      expect(result.properties.user.properties.id.pattern).toBeUndefined();
    });
  });

  describe("formatCompactSchema", () => {
    it("should format primitive types", () => {
      expect(formatCompactSchema({ type: "string" })).toBe("string");
      expect(formatCompactSchema({ type: "number" })).toBe("number");
      expect(formatCompactSchema({ type: "boolean" })).toBe("boolean");
    });

    it("should format string with format", () => {
      expect(formatCompactSchema({ type: "string", format: "uuid" })).toBe("string (uuid)");
      expect(formatCompactSchema({ type: "string", format: "date-time" })).toBe("string (date-time)");
    });

    it("should format string with enum", () => {
      expect(
        formatCompactSchema({
          type: "string",
          enum: ["active", "inactive"],
        }),
      ).toBe("string [active, inactive]");
    });

    it("should format numbers with ranges", () => {
      expect(
        formatCompactSchema({
          type: "number",
          minimum: 0,
          maximum: 100,
        }),
      ).toBe("number (0-100)");

      expect(
        formatCompactSchema({
          type: "integer",
          minimum: 1,
        }),
      ).toBe("integer (1-*)");
    });

    it("should format arrays", () => {
      expect(
        formatCompactSchema({
          type: "array",
          items: { type: "string" },
        }),
      ).toBe("string[]");
    });

    it("should format simple objects", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("object { name: string, age?: number }");
    });

    it("should truncate complex objects", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
          email: { type: "string" },
          address: { type: "string" },
          phone: { type: "string" },
        },
        required: ["name", "email"],
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("object { name: string, age?: number, email: string, ... }");
    });

    it("should handle empty objects", () => {
      expect(formatCompactSchema({ type: "object" })).toBe("object");
      expect(formatCompactSchema({ type: "object", properties: {} })).toBe("object");
    });
  });

  describe("deduplicateExamples", () => {
    it("should handle null/undefined examples", () => {
      expect(deduplicateExamples(null as any)).toBeNull();
      expect(deduplicateExamples(undefined as any)).toBeUndefined();
    });

    it("should remove duplicate examples based on content", () => {
      const examples = {
        example1: { value: { name: "John", age: 30 } },
        example2: { value: { name: "Jane", age: 25 } },
        example3: { value: { name: "John", age: 30 } }, // Duplicate of example1
        example4: { value: { name: "Bob", age: 35 } },
      };

      const result = deduplicateExamples(examples);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result.example1).toBeDefined();
      expect(result.example2).toBeDefined();
      expect(result.example4).toBeDefined();
      expect(result.example3).toBeUndefined();
    });

    it("should handle examples without value property", () => {
      const examples = {
        example1: { name: "John", age: 30 },
        example2: { name: "Jane", age: 25 },
        example3: { name: "John", age: 30 }, // Duplicate
      };

      const result = deduplicateExamples(examples);

      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe("extractRequiredFields", () => {
    it("should return empty array for null/undefined schema", () => {
      expect(extractRequiredFields(null)).toEqual([]);
      expect(extractRequiredFields(undefined)).toEqual([]);
    });

    it("should return empty array for schema without required field", () => {
      expect(extractRequiredFields({})).toEqual([]);
      expect(extractRequiredFields({ type: "object" })).toEqual([]);
    });

    it("should return required fields", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "email"],
      };

      expect(extractRequiredFields(schema)).toEqual(["name", "email"]);
    });

    it("should handle non-array required field", () => {
      const schema = {
        type: "object",
        required: "invalid", // Should be array
      };

      expect(extractRequiredFields(schema)).toEqual([]);
    });
  });

  describe("summarizeParameters", () => {
    it("should handle empty parameters", () => {
      expect(summarizeParameters([])).toBe("none");
      expect(summarizeParameters(undefined as any)).toBe("none");
    });

    it("should group parameters by location", () => {
      const parameters = [
        { name: "id", in: "path", required: true },
        { name: "limit", in: "query", required: false },
        { name: "offset", in: "query", required: false },
        { name: "Authorization", in: "header", required: true },
      ];

      const result = summarizeParameters(parameters);
      expect(result).toBe("path: {id}, query: {limit?, offset?}, header: {Authorization}");
    });

    it("should include request body info", () => {
      const parameters = [{ name: "id", in: "path", required: true }];
      const requestBody = { required: true };

      const result = summarizeParameters(parameters, requestBody);
      expect(result).toBe("path: {id}, body: required");
    });

    it("should handle optional request body", () => {
      const requestBody = { required: false };

      const result = summarizeParameters([], requestBody);
      expect(result).toBe("body: optional");
    });
  });

  describe("summarizeResponses", () => {
    it("should summarize response status codes and types", () => {
      const responses = {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        "400": {
          description: "Bad Request",
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        "404": {
          description: "Not Found",
        },
      };

      const result = summarizeResponses(responses);
      expect(result).toBe("200: object, 400: object, 404: unknown");
    });

    it("should handle responses without content", () => {
      const responses = {
        "204": {
          description: "No Content",
        },
      };

      const result = summarizeResponses(responses);
      expect(result).toBe("204: unknown");
    });
  });

  describe("summarizeAuth", () => {
    it("should return 'none' for no security", () => {
      expect(summarizeAuth()).toBe("none");
      expect(summarizeAuth([])).toBe("none");
    });

    it("should summarize single auth method", () => {
      const security = [{ api_key: [] }];

      const result = summarizeAuth(security);
      expect(result).toBe("api_key");
    });

    it("should summarize multiple auth methods with OR", () => {
      const security = [{ api_key: [] }, { oauth2: ["read", "write"] }];

      const result = summarizeAuth(security);
      expect(result).toBe("api_key OR oauth2");
    });

    it("should summarize combined auth methods with +", () => {
      const security = [{ api_key: [], oauth2: ["read"] }];

      const result = summarizeAuth(security);
      expect(result).toBe("api_key + oauth2");
    });
  });
});
