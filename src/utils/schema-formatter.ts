/**
 * Utility functions for formatting and simplifying OpenAPI schemas
 * to reduce context usage while maintaining essential information
 */

export interface SimplifyOptions {
  includePatterns?: boolean;
  includeExamples?: boolean;
  maxExamples?: number;
  includeDescriptions?: boolean;
}

/**
 * Simplifies a schema by collapsing allOf patterns, removing duplicates,
 * and converting complex patterns to readable summaries
 */
export function simplifySchema(schema: any, options: SimplifyOptions = {}): any {
  if (!schema) return schema;

  const { includePatterns = false, includeExamples = true, maxExamples = 1, includeDescriptions = false } = options;

  // Handle primitive types
  if (typeof schema !== "object") return schema;

  // Deep clone to avoid modifying original
  const simplified = JSON.parse(JSON.stringify(schema));

  // Handle allOf by merging into a single schema
  if (simplified.allOf && Array.isArray(simplified.allOf)) {
    const merged: any = { type: simplified.type || "object" };

    simplified.allOf.forEach((subSchema: any) => {
      const resolvedSub = simplifySchema(subSchema, options);
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
export function formatCompactSchema(schema: any): string {
  if (!schema) return "any";

  if (schema.type === "string") {
    let result = "string";
    if (schema.format) result += ` (${schema.format})`;
    if (schema.enum) result += ` [${schema.enum.join(", ")}]`;
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

  return schema.type || "any";
}

/**
 * Removes duplicate examples based on their content
 */
export function deduplicateExamples(examples: Record<string, any>): Record<string, any> {
  if (!examples || typeof examples !== "object") return examples;

  const seen = new Set<string>();
  const deduplicated: Record<string, any> = {};

  Object.entries(examples).forEach(([name, example]) => {
    const exampleValue = example.value || example;
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
export function extractRequiredFields(schema: any): string[] {
  if (!schema || !schema.required || !Array.isArray(schema.required)) {
    return [];
  }
  return schema.required;
}

/**
 * Creates a concise parameter summary
 * Example: "path: {id}, query: {limit?, offset?}, body: required"
 */
export function summarizeParameters(parameters: any[], requestBody?: any): string {
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
export function summarizeResponses(responses: Record<string, any>): string {
  const summaries: string[] = [];

  Object.entries(responses).forEach(([statusCode, response]) => {
    let type = "unknown";

    if (response.content) {
      const contentTypes = Object.keys(response.content);
      if (contentTypes.length > 0 && response.content[contentTypes[0]].schema) {
        const schema = response.content[contentTypes[0]].schema;
        type = schema.type || "object";
      }
    }

    summaries.push(`${statusCode}: ${type}`);
  });

  return summaries.join(", ");
}

/**
 * Extracts authentication requirements in a concise format
 */
export function summarizeAuth(security?: any[]): string {
  if (!security || security.length === 0) return "none";

  const authMethods = security.map((sec) => {
    const methods = Object.keys(sec);
    return methods.join(" + ");
  });

  return authMethods.join(" OR ");
}
