import { describe, it, expect } from "vitest";
import {
  simplifySchema,
  formatCompactSchema,
  deduplicateExamples,
  extractRequiredFields,
  summarizeParameters,
  summarizeResponses,
  summarizeAuth,
  paginateContent,
} from "@/utils/schema-formatter.js";

describe("Schema Formatter", () => {
  describe("simplifySchema", () => {
    it("should handle null/undefined schemas", () => {
      expect(simplifySchema(null)).toBeNull();
      expect(simplifySchema(undefined)).toBeNull();
    });

    it("should collapse allOf patterns", () => {
      const schema = {
        allOf: [
          { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          { type: "object", properties: { age: { type: "number" } }, required: ["age"] },
        ],
      } as any;

      const result = simplifySchema(schema);

      expect(result?.type).toBe("object");
      expect(result?.properties?.name).toEqual({ type: "string" });
      expect(result?.properties?.age).toEqual({ type: "number" });
      expect(result?.required).toEqual(["name", "age"]);
      expect(result?.allOf).toBeUndefined();
    });

    it("should simplify UUID patterns", () => {
      const schema = {
        type: "string",
        format: "uuid",
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
      };

      const result = simplifySchema(schema);

      expect(result?.type).toBe("string");
      expect(result?.format).toBe("uuid");
      expect(result?.pattern).toBeUndefined();
    });

    it("should limit examples when specified", () => {
      const schema = {
        type: "string",
        examples: ["example1", "example2", "example3"],
      };

      const result = simplifySchema(schema, { maxExamples: 2 });

      expect(result?.examples).toHaveLength(2);
      expect(result?.examples).toEqual(["example1", "example2"]);
    });

    it("should remove examples when includeExamples is false", () => {
      const schema = {
        type: "string",
        examples: ["example1", "example2"],
      };

      const result = simplifySchema(schema, { includeExamples: false });

      expect(result?.examples).toBeUndefined();
    });

    it("should remove descriptions when includeDescriptions is false", () => {
      const schema = {
        type: "string",
        description: "A string field",
      };

      const result = simplifySchema(schema, { includeDescriptions: false });

      expect(result?.description).toBeUndefined();
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

      expect(result?.properties?.user?.properties?.id?.format).toBe("uuid");
      expect(result?.properties?.user?.properties?.id?.pattern).toBeUndefined();
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
      expect(extractRequiredFields(null as any)).toEqual([]);
      expect(extractRequiredFields(undefined as any)).toEqual([]);
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
        required: "invalid" as any, // Should be array
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
        { name: "id", in: "path" as const, required: true },
        { name: "limit", in: "query" as const, required: false },
        { name: "offset", in: "query" as const, required: false },
        { name: "Authorization", in: "header" as const, required: true },
      ];

      const result = summarizeParameters(parameters);
      expect(result).toBe("path: {id}, query: {limit?, offset?}, header: {Authorization}");
    });

    it("should include request body info", () => {
      const parameters = [{ name: "id", in: "path" as const, required: true }];
      const requestBody = { required: true, content: {} };

      const result = summarizeParameters(parameters, requestBody);
      expect(result).toBe("path: {id}, body: required");
    });

    it("should handle optional request body", () => {
      const requestBody = { required: false, content: {} };

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
      const security = [{ api_key: [] }, { oauth2: ["read", "write"] }] as any;

      const result = summarizeAuth(security);
      expect(result).toBe("api_key OR oauth2");
    });

    it("should summarize combined auth methods with +", () => {
      const security = [{ api_key: [], oauth2: ["read"] }];

      const result = summarizeAuth(security);
      expect(result).toBe("api_key + oauth2");
    });
  });

  describe("enum truncation", () => {
    it("should truncate large enums in simplifySchema", () => {
      const schema = {
        type: "string",
        enum: Array.from({ length: 20 }, (_, i) => `option${i}`),
      };

      const result = simplifySchema(schema, { maxEnumValues: 5 });
      expect(result?.enum).toHaveLength(5);
      expect(result?.enumTruncated).toBe("...and 15 more values");
    });

    it("should not truncate small enums", () => {
      const schema = {
        type: "string",
        enum: ["option1", "option2", "option3"],
      };

      const result = simplifySchema(schema, { maxEnumValues: 10 });
      expect(result?.enum).toHaveLength(3);
      expect(result?.enumTruncated).toBeUndefined();
    });
  });

  describe("formatCompactSchema improvements", () => {
    it("should handle enum truncation for small enums", () => {
      const schema = {
        type: "string",
        enum: ["small", "medium", "large"],
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("string [small, medium, large]");
    });

    it("should handle enum truncation for medium enums", () => {
      const schema = {
        type: "string",
        enum: Array.from({ length: 10 }, (_, i) => `option${i}`),
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("string [option0, option1, option2, ...and 7 more]");
    });

    it("should handle enum truncation for large enums", () => {
      const schema = {
        type: "string",
        enum: Array.from({ length: 200 }, (_, i) => `icon${i}`),
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("string (200+ options available)");
    });

    it("should infer type from properties", () => {
      const schema = {
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("object { name: string }");
    });

    it("should infer type from enum values", () => {
      const schema = {
        enum: [1, 2, 3, 4],
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("number [1, 2, 3, 4]");
    });

    it("should infer string type from format", () => {
      const schema = {
        format: "uuid",
      };

      const result = formatCompactSchema(schema);
      expect(result).toBe("string (uuid)");
    });

    it("should return unknown instead of any", () => {
      const schema = {};

      const result = formatCompactSchema(schema);
      expect(result).toBe("unknown");
    });
  });

  describe("paginateContent", () => {
    const longContent = "A".repeat(5000);

    it("should return complete content if it fits in one chunk", () => {
      const shortContent = "Hello, world!";
      const result = paginateContent(shortContent);

      expect(result.content).toBe(shortContent);
      expect(result.hasMore).toBe(false);
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(13);
      expect(result.totalSize).toBe(13);
      expect(result.navigationFooter).toBe("📄 Showing complete content (13 characters)");
    });

    it("should paginate long content", () => {
      const result = paginateContent(longContent, { chunkSize: 2000 });

      expect(result.content).toHaveLength(2000);
      expect(result.hasMore).toBe(true);
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(2000);
      expect(result.totalSize).toBe(5000);
      expect(result.nextIndex).toBe(2000);
      expect(result.navigationFooter).toContain("📄 Showing characters 0-2000 of 5000 total");
      expect(result.navigationFooter).toContain("⏭️  Next chunk: Use index=2000");
    });

    it("should handle middle pagination", () => {
      const result = paginateContent(longContent, { startIndex: 2000, chunkSize: 2000 });

      expect(result.content).toHaveLength(2000);
      expect(result.hasMore).toBe(true);
      expect(result.startIndex).toBe(2000);
      expect(result.endIndex).toBe(4000);
      expect(result.prevIndex).toBe(0);
      expect(result.nextIndex).toBe(4000);
      expect(result.navigationFooter).toContain("⏮️  Previous chunk: Use index=0");
      expect(result.navigationFooter).toContain("⏭️  Next chunk: Use index=4000");
    });

    it("should handle last chunk", () => {
      const result = paginateContent(longContent, { startIndex: 4000, chunkSize: 2000 });

      expect(result.content).toHaveLength(1000);
      expect(result.hasMore).toBe(false);
      expect(result.startIndex).toBe(4000);
      expect(result.endIndex).toBe(5000);
      expect(result.prevIndex).toBe(2000);
      expect(result.nextIndex).toBeUndefined();
      expect(result.navigationFooter).toContain("⏮️  Previous chunk: Use index=2000");
      expect(result.navigationFooter).not.toContain("Next chunk");
    });

    it("should handle smart breaks with JSON content", () => {
      const jsonContent = `{
  "user": {
    "name": "John",
    "age": 30
  },
  "order": {
    "id": "123",
    "total": 99.99
  }
}`;

      const result = paginateContent(jsonContent, { chunkSize: 50, smartBreaks: true });

      expect(result.hasMore).toBe(true);
      // Should break at a reasonable JSON boundary, not mid-property
      expect(result.content).not.toMatch(/"na$/); // Shouldn't cut off in middle of "name"
    });
  });
});
