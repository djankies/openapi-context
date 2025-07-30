/**
 * Utility functions for formatting and simplifying OpenAPI schemas
 * to reduce context usage while maintaining essential information
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
// Note: OpenAPI schemas are inherently dynamic and require any types for proper handling
// Non-null assertions are safe in regex matching contexts

import type {
  OpenAPISchema,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISecurityRequirement,
  OpenAPIHeader,
} from "../types.js";

export interface SimplifyOptions {
  includePatterns?: boolean;
  includeExamples?: boolean;
  maxExamples?: number;
  includeDescriptions?: boolean;
  maxEnumValues?: number;
}

export interface PaginationOptions {
  startIndex?: number;
  chunkSize?: number;
  smartBreaks?: boolean;
}

export interface PaginatedResult {
  content: string;
  startIndex: number;
  endIndex: number;
  totalSize: number;
  hasMore: boolean;
  nextIndex?: number;
  prevIndex?: number;
  navigationFooter: string;
}

/**
 * Simplifies a schema by collapsing allOf patterns, removing duplicates,
 * and converting complex patterns to readable summaries
 */
export function simplifySchema(schema: OpenAPISchema | null | undefined, options: SimplifyOptions = {}): OpenAPISchema | null {
  if (!schema) return null;

  const { includePatterns = false, includeExamples = true, maxExamples = 1, includeDescriptions = false, maxEnumValues = 10 } = options;

  // Handle primitive types
  if (typeof schema !== "object") return schema;

  // Deep clone to avoid modifying original
  const simplified = JSON.parse(JSON.stringify(schema));

  // Handle allOf by merging into a single schema
  if (simplified.allOf && Array.isArray(simplified.allOf)) {
    const merged: any = { type: simplified.type || "object" };

    simplified.allOf.forEach((subSchema: any) => {
      const resolvedSub = simplifySchema(subSchema, options);
      if (!resolvedSub) return;

      // Merge properties
      if (resolvedSub.properties) {
        merged.properties = { ...merged.properties, ...resolvedSub.properties };
      }
      // Merge required arrays
      if (resolvedSub.required) {
        merged.required = [...(merged.required || []), ...resolvedSub.required];
      }
      // Keep first description found
      if (!merged.description && resolvedSub.description) {
        merged.description = resolvedSub.description;
      }
      // Merge other properties
      Object.keys(resolvedSub).forEach((key) => {
        if (!["properties", "required", "description", "allOf"].includes(key) && !merged[key]) {
          merged[key] = resolvedSub[key];
        }
      });
    });

    // Remove duplicates from required array
    if (merged.required) {
      merged.required = [...new Set(merged.required)];
    }

    Object.assign(simplified, merged);
    delete simplified.allOf;
  }

  // Simplify UUID patterns
  if (simplified.format === "uuid" || (simplified.pattern && simplified.pattern.includes("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}"))) {
    simplified.type = "string";
    simplified.format = "uuid";
    if (!includePatterns) {
      delete simplified.pattern;
    }
  }

  // Simplify date-time patterns
  if (simplified.format === "date-time" && simplified.pattern && !includePatterns) {
    delete simplified.pattern;
  }

  // Remove descriptions if not needed
  if (!includeDescriptions && simplified.description) {
    delete simplified.description;
  }

  // Truncate large enums
  if (simplified.enum && Array.isArray(simplified.enum) && simplified.enum.length > maxEnumValues) {
    const truncatedEnum = simplified.enum.slice(0, maxEnumValues);
    const remainingCount = simplified.enum.length - maxEnumValues;
    simplified.enum = truncatedEnum;
    simplified.enumTruncated = `...and ${remainingCount} more values`;
  }

  // Limit examples
  if (simplified.examples && Array.isArray(simplified.examples)) {
    if (!includeExamples) {
      delete simplified.examples;
    } else if (simplified.examples.length > maxExamples) {
      simplified.examples = simplified.examples.slice(0, maxExamples);
    }
  }

  // Handle nested properties recursively
  if (simplified.properties) {
    Object.keys(simplified.properties).forEach((key) => {
      simplified.properties[key] = simplifySchema(simplified.properties[key], options);
    });
  }

  // Handle array items
  if (simplified.items) {
    simplified.items = simplifySchema(simplified.items, options);
  }

  // Remove readOnly fields from simplified view
  if (simplified.readOnly) {
    delete simplified.readOnly;
  }

  return simplified;
}

/**
 * Formats a schema into a compact string representation
 * Example: "object { message: string (required), count?: number }"
 */
export function formatCompactSchema(schema: OpenAPISchema | undefined): string {
  if (!schema) return "any";

  if (schema.type === "string") {
    let result = "string";
    if (schema.format) result += ` (${schema.format})`;
    if (schema.enum) {
      if (schema.enum.length <= 5) {
        result += ` [${schema.enum.join(", ")}]`;
      } else if (schema.enum.length <= 100) {
        result += ` [${schema.enum.slice(0, 3).join(", ")}, ...and ${schema.enum.length - 3} more]`;
      } else {
        result += ` (${schema.enum.length}+ options available)`;
      }
    }
    if (schema.enumTruncated) {
      result += ` (${schema.enumTruncated})`;
    }
    return result;
  }

  if (schema.type === "number" || schema.type === "integer") {
    let result = schema.type;
    if (schema.minimum !== undefined || schema.maximum !== undefined) {
      result += ` (${schema.minimum ?? "*"}-${schema.maximum ?? "*"})`;
    }
    return result;
  }

  if (schema.type === "boolean") {
    return "boolean";
  }

  if (schema.type === "array") {
    return `${formatCompactSchema(schema.items)}[]`;
  }

  if (schema.type === "object" || schema.properties) {
    const required = schema.required || [];
    const props = schema.properties || {};

    const propStrings = Object.entries(props).map(([key, value]: [string, any]) => {
      const isRequired = required.includes(key);
      const propType = formatCompactSchema(value);
      return isRequired ? `${key}: ${propType}` : `${key}?: ${propType}`;
    });

    if (propStrings.length === 0) return "object";
    if (propStrings.length <= 3) {
      return `object { ${propStrings.join(", ")} }`;
    }
    return `object { ${propStrings.slice(0, 3).join(", ")}, ... }`;
  }

  // Better type inference for schemas without explicit type
  if (schema.properties || schema.additionalProperties !== undefined) {
    return "object";
  }

  if (schema.items) {
    return `${formatCompactSchema(schema.items)}[]`;
  }

  if (schema.enum) {
    // Infer type from enum values
    if (schema.enum.length > 0) {
      const firstType = typeof schema.enum[0];
      if (schema.enum.every((val: unknown) => typeof val === firstType)) {
        let result = firstType;
        if (schema.enum.length <= 5) {
          result += ` [${schema.enum.join(", ")}]`;
        } else {
          result += ` [${schema.enum.slice(0, 3).join(", ")}, ...and ${schema.enum.length - 3} more]`;
        }
        return result;
      }
    }
  }

  if (schema.format) {
    // Infer string type for known formats
    const stringFormats = ["date-time", "date", "time", "email", "uuid", "uri", "hostname", "ipv4", "ipv6", "password"];
    if (stringFormats.includes(schema.format)) {
      return `string (${schema.format})`;
    }
  }

  return schema.type || "unknown";
}

/**
 * Removes duplicate examples based on their content
 */
export function deduplicateExamples(examples: Record<string, unknown>): Record<string, unknown> {
  if (!examples || typeof examples !== "object") return examples;

  const seen = new Set<string>();
  const deduplicated: Record<string, unknown> = {};

  Object.entries(examples).forEach(([name, example]) => {
    const exampleValue = (example as any)?.value || example;
    const serialized = JSON.stringify(exampleValue);

    if (!seen.has(serialized)) {
      seen.add(serialized);
      deduplicated[name] = example;
    }
  });

  return deduplicated;
}

/**
 * Extracts just the required field names from a schema
 */
export function extractRequiredFields(schema: OpenAPISchema): string[] {
  if (!schema || !schema.required || !Array.isArray(schema.required)) {
    return [];
  }
  return schema.required;
}

/**
 * Creates a concise parameter summary
 * Example: "path: {id}, query: {limit?, offset?}, body: required"
 */
export function summarizeParameters(parameters: OpenAPIParameter[], requestBody?: OpenAPIRequestBody): string {
  const paramsByLocation: Record<string, string[]> = {};

  // Group parameters by location
  if (parameters && Array.isArray(parameters)) {
    parameters.forEach((param) => {
      const location = param.in || "unknown";
      if (!paramsByLocation[location]) {
        paramsByLocation[location] = [];
      }

      const paramStr = param.required ? param.name : `${param.name}?`;
      paramsByLocation[location].push(paramStr);
    });
  }

  // Build summary parts
  const parts: string[] = [];

  if (paramsByLocation.path?.length > 0) {
    parts.push(`path: {${paramsByLocation.path.join(", ")}}`);
  }

  if (paramsByLocation.query?.length > 0) {
    parts.push(`query: {${paramsByLocation.query.join(", ")}}`);
  }

  if (paramsByLocation.header?.length > 0) {
    parts.push(`header: {${paramsByLocation.header.join(", ")}}`);
  }

  if (requestBody) {
    parts.push(`body: ${requestBody.required ? "required" : "optional"}`);
  }

  return parts.length > 0 ? parts.join(", ") : "none";
}

/**
 * Simplifies a response schema to show just status codes and types
 * Example: "200: object, 400: error, 404: error"
 */
export function summarizeResponses(responses: Record<string, OpenAPIResponse>): string {
  const summaries: string[] = [];

  Object.entries(responses).forEach(([statusCode, response]) => {
    let type = "unknown";

    if (response.content) {
      const contentTypes = Object.keys(response.content);
      if (contentTypes.length > 0 && response.content[contentTypes[0]]?.schema) {
        const schema = response.content[contentTypes[0]].schema;
        type = schema?.type || "object";
      }
    }

    summaries.push(`${statusCode}: ${type}`);
  });

  return summaries.join(", ");
}

/**
 * Extracts authentication requirements in a concise format
 */
export function summarizeAuth(security?: OpenAPISecurityRequirement[]): string {
  if (!security || security.length === 0) return "none";

  const authMethods = security.map((sec) => {
    const methods = Object.keys(sec);
    return methods.join(" + ");
  });

  return authMethods.join(" OR ");
}

/**
 * Paginates a long text string into manageable chunks with navigation
 */
export function paginateContent(content: string, options: PaginationOptions = {}): PaginatedResult {
  const { startIndex = 0, chunkSize = 2000, smartBreaks = true } = options;

  const totalSize = content.length;

  // If content fits in one chunk, return it all
  if (totalSize <= chunkSize) {
    return {
      content,
      startIndex: 0,
      endIndex: totalSize,
      totalSize,
      hasMore: false,
      navigationFooter: `📄 Showing complete content (${totalSize} characters)`,
    };
  }

  // Calculate end index
  let endIndex = Math.min(startIndex + chunkSize, totalSize);

  // Smart breaks: try to break at logical boundaries
  if (smartBreaks && endIndex < totalSize) {
    const searchStart = Math.max(endIndex - 200, startIndex + chunkSize * 0.8);
    const remainingContent = content.substring(searchStart, endIndex + 200);

    // Look for good break points (in order of preference)
    const breakPoints = [
      /}\s*,\s*\n/g, // End of JSON object
      /]\s*,\s*\n/g, // End of JSON array
      /,\s*\n\s*"/g, // End of JSON property
      /\n\s*\n/g, // Double newline
      /\n/g, // Single newline
    ];

    for (const breakPattern of breakPoints) {
      const matches = [...remainingContent.matchAll(breakPattern)];
      if (matches.length > 0) {
        // Find the match closest to our target end
        const targetOffset = endIndex - searchStart;
        const bestMatch = matches.reduce((best, match) => {
          const matchPos = match.index! + match[0].length;
          const currentDistance = Math.abs(matchPos - targetOffset);
          const bestDistance = Math.abs(best.index! + best[0].length - targetOffset);
          return currentDistance < bestDistance ? match : best;
        });

        endIndex = searchStart + bestMatch.index! + bestMatch[0].length;
        break;
      }
    }
  }

  const chunk = content.substring(startIndex, endIndex);
  const hasMore = endIndex < totalSize;
  const hasPrevious = startIndex > 0;

  // Create navigation footer
  let navigationFooter = `📄 Showing characters ${startIndex}-${endIndex} of ${totalSize} total`;

  if (hasMore || hasPrevious) {
    navigationFooter += "\n";
    if (hasPrevious) {
      const prevIndex = Math.max(0, startIndex - chunkSize);
      navigationFooter += `⏮️  Previous chunk: Use index=${prevIndex}`;
    }
    if (hasMore) {
      if (hasPrevious) navigationFooter += " | ";
      navigationFooter += `⏭️  Next chunk: Use index=${endIndex}`;
    }
  }

  return {
    content: chunk,
    startIndex,
    endIndex,
    totalSize,
    hasMore,
    nextIndex: hasMore ? endIndex : undefined,
    prevIndex: hasPrevious ? Math.max(0, startIndex - chunkSize) : undefined,
    navigationFooter,
  };
}

/**
 * Format a header schema into a compact readable string
 * @param header - The header object containing schema information
 * @returns A formatted string describing the header type
 */
export function formatHeaderSchema(header: OpenAPIHeader): string {
  if (!header || !header.schema) {
    return "unknown";
  }

  const schema = header.schema;
  let result = schema.type || "unknown";

  // Add format information if available
  if (schema.format) {
    result += `, ${schema.format}`;
  }

  // Handle array types
  if (schema.type === "array" && schema.items) {
    const itemType = schema.items.type || "unknown";
    result = `array[${itemType}]`;
  }

  // Handle enums
  if (schema.enum && Array.isArray(schema.enum)) {
    if (schema.enum.length <= 5) {
      result += ` (${schema.enum.join(" | ")})`;
    } else {
      result += ` (enum[${schema.enum.length}])`;
    }
  }

  // Add pattern indicator
  if (schema.pattern) {
    result += ", pattern";
  }

  // Add min/max for numbers
  if (schema.type === "integer" || schema.type === "number") {
    const constraints = [];
    if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
    if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
    if (constraints.length > 0) {
      result += ` (${constraints.join(", ")})`;
    }
  }

  // Add length constraints for strings
  if (schema.type === "string") {
    const constraints = [];
    if (schema.minLength !== undefined) constraints.push(`minLength: ${schema.minLength}`);
    if (schema.maxLength !== undefined) constraints.push(`maxLength: ${schema.maxLength}`);
    if (constraints.length > 0) {
      result += ` (${constraints.join(", ")})`;
    }
  }

  return result;
}
