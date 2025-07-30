import { describe, it, expect } from "vitest";
import { formatHeaderSchema } from "@/utils/schema-formatter.js";

describe("formatHeaderSchema", () => {
  describe("Basic Type Formatting", () => {
    it("should format string type headers", () => {
      // Arrange
      const header = {
        schema: { type: "string" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string");
    });

    it("should format integer type headers", () => {
      // Arrange
      const header = {
        schema: { type: "integer" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("integer");
    });

    it("should format number type headers", () => {
      // Arrange
      const header = {
        schema: { type: "number" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("number");
    });

    it("should format boolean type headers", () => {
      // Arrange
      const header = {
        schema: { type: "boolean" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("boolean");
    });

    it("should format array type headers", () => {
      // Arrange
      const header = {
        schema: { type: "array" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("array");
    });

    it("should format array type with items", () => {
      // Arrange
      const header = {
        schema: {
          type: "array",
          items: { type: "string" },
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("array[string]");
    });

    it("should format object type headers", () => {
      // Arrange
      const header = {
        schema: { type: "object" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("object");
    });
  });

  describe("Format Modifiers", () => {
    it("should include format when present (e.g., uuid, date-time)", () => {
      // Arrange
      const uuidHeader = {
        schema: { type: "string", format: "uuid" },
      };
      const dateTimeHeader = {
        schema: { type: "string", format: "date-time" },
      };

      // Act
      const uuidResult = formatHeaderSchema(uuidHeader);
      const dateTimeResult = formatHeaderSchema(dateTimeHeader);

      // Assert
      expect(uuidResult).toBe("string, uuid");
      expect(dateTimeResult).toBe("string, date-time");
    });

    it("should handle custom formats", () => {
      // Arrange
      const header = {
        schema: { type: "string", format: "custom-format" },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string, custom-format");
    });

    it("should format headers with both type and format", () => {
      // Arrange
      const headers = [
        { schema: { type: "integer", format: "int32" } },
        { schema: { type: "integer", format: "int64" } },
        { schema: { type: "number", format: "float" } },
        { schema: { type: "number", format: "double" } },
        { schema: { type: "string", format: "binary" } },
        { schema: { type: "string", format: "byte" } },
      ];

      // Act & Assert
      expect(formatHeaderSchema(headers[0])).toBe("integer, int32");
      expect(formatHeaderSchema(headers[1])).toBe("integer, int64");
      expect(formatHeaderSchema(headers[2])).toBe("number, float");
      expect(formatHeaderSchema(headers[3])).toBe("number, double");
      expect(formatHeaderSchema(headers[4])).toBe("string, binary");
      expect(formatHeaderSchema(headers[5])).toBe("string, byte");
    });
  });

  describe("Edge Cases", () => {
    it("should return 'unknown' for null header", () => {
      // Arrange
      const header = null;

      // Act
      const result = formatHeaderSchema(header as any);

      // Assert
      expect(result).toBe("unknown");
    });

    it("should return 'unknown' for undefined header", () => {
      // Arrange
      const header = undefined;

      // Act
      const result = formatHeaderSchema(header as any);

      // Assert
      expect(result).toBe("unknown");
    });

    it("should return 'unknown' for header without schema", () => {
      // Arrange
      const headers = [{}, { description: "A header without schema" }, { required: true }];

      // Act & Assert
      headers.forEach((header) => {
        const result = formatHeaderSchema(header);
        expect(result).toBe("unknown");
      });
    });

    it("should return 'unknown' for empty schema object", () => {
      // Arrange
      const header = {
        schema: {},
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("unknown");
    });

    it("should handle schema without type property", () => {
      // Arrange
      const headers = [
        { schema: { format: "date-time" } },
        { schema: { enum: ["value1", "value2"] } },
        { schema: { $ref: "#/components/schemas/HeaderType" } },
      ];

      // Act & Assert
      expect(formatHeaderSchema(headers[0])).toBe("unknown, date-time");
      expect(formatHeaderSchema(headers[1])).toBe("unknown (value1 | value2)");
      expect(formatHeaderSchema(headers[2])).toBe("unknown");
    });
  });

  describe("Complex Schemas", () => {
    it("should handle schemas with enum values", () => {
      // Arrange
      const header = {
        schema: {
          type: "string",
          enum: ["value1", "value2", "value3"],
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string (value1 | value2 | value3)");
    });

    it("should handle schemas with many enum values", () => {
      // Arrange
      const header = {
        schema: {
          type: "string",
          enum: ["value1", "value2", "value3", "value4", "value5", "value6"],
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string (enum[6])");
    });

    it("should handle schemas with pattern", () => {
      // Arrange
      const header = {
        schema: {
          type: "string",
          pattern: "^[A-Z]{2}[0-9]{4}$",
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string, pattern");
    });

    it("should handle schemas with minLength/maxLength", () => {
      // Arrange
      const header = {
        schema: {
          type: "string",
          minLength: 5,
          maxLength: 20,
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("string (minLength: 5, maxLength: 20)");
    });

    it("should handle schemas with minimum/maximum", () => {
      // Arrange
      const header = {
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      expect(result).toBe("integer (min: 1, max: 100)");
    });

    it("should handle schemas with $ref", () => {
      // Arrange
      const header = {
        schema: {
          $ref: "#/components/schemas/HeaderType",
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      // The function doesn't resolve $ref, just returns "unknown" when no type
      expect(result).toBe("unknown");
    });

    it("should handle schemas with allOf/oneOf/anyOf", () => {
      // Arrange
      const allOfHeader = {
        schema: {
          allOf: [{ type: "string" }, { format: "uuid" }],
        },
      };
      const oneOfHeader = {
        schema: {
          oneOf: [{ type: "string" }, { type: "integer" }],
        },
      };
      const anyOfHeader = {
        schema: {
          anyOf: [
            { type: "string", format: "date" },
            { type: "string", format: "date-time" },
          ],
        },
      };

      // Act & Assert
      // The function doesn't handle complex schemas, returns "unknown" when no direct type
      expect(formatHeaderSchema(allOfHeader)).toBe("unknown");
      expect(formatHeaderSchema(oneOfHeader)).toBe("unknown");
      expect(formatHeaderSchema(anyOfHeader)).toBe("unknown");
    });
  });

  describe("Special Cases", () => {
    it("should handle deprecated headers", () => {
      // Arrange
      const header = {
        deprecated: true,
        schema: {
          type: "string",
          format: "uuid",
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      // The function only looks at schema, not deprecated flag
      expect(result).toBe("string, uuid");
    });

    it("should handle headers with examples", () => {
      // Arrange
      const header = {
        example: "example-value",
        examples: {
          example1: { value: "value1" },
          example2: { value: "value2" },
        },
        schema: {
          type: "string",
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      // The function only looks at schema type and format
      expect(result).toBe("string");
    });

    it("should handle headers with default values", () => {
      // Arrange
      const header = {
        schema: {
          type: "integer",
          format: "int32",
          default: 42,
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      // The function only returns type and format, not default value
      expect(result).toBe("integer, int32");
    });

    it("should handle headers with const values", () => {
      // Arrange
      const header = {
        schema: {
          type: "string",
          const: "fixed-value",
        },
      };

      // Act
      const result = formatHeaderSchema(header);

      // Assert
      // The function only returns type and format, not const value
      expect(result).toBe("string");
    });
  });
});
