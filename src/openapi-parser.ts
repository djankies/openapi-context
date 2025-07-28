import SwaggerParser from "@apidevtools/swagger-parser";
import { createHash } from "crypto";
import { readFileSync } from "fs";

export interface ParsedOperation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  parameters?: any[];
  requestBody?: any;
  responses: Record<string, any>;
  security?: any[];
  servers?: any[];
}

export async function parseOpenAPISpec(specPath: string): Promise<any> {
  try {
    // Fully dereference the spec (resolves all $ref)
    const api = await SwaggerParser.dereference(specPath);
    return api;
  } catch (error) {
    console.error("OpenAPI parsing error:", error);
    throw new Error(`Failed to parse OpenAPI spec: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function computeSpecHash(specPath: string): string {
  const content = readFileSync(specPath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

export function computeSchemaHash(schema: any): string {
  // Create a canonical JSON string for consistent hashing
  // Sort keys recursively to ensure consistent output regardless of property order
  const canonicalSchema = JSON.stringify(schema, Object.keys(schema || {}).sort());
  return createHash("sha256").update(canonicalSchema).digest("hex");
}

export function resolveComposedSchema(schema: any): any {
  if (!schema) return schema;

  if (schema.allOf) {
    // Merge all schemas in allOf
    const merged: any = { type: "object", properties: {}, required: [] };

    for (const subSchema of schema.allOf) {
      const resolved = resolveComposedSchema(subSchema);
      if (resolved.properties) {
        Object.assign(merged.properties, resolved.properties);
      }
      if (resolved.required) {
        merged.required.push(...resolved.required);
      }
      // Copy other properties
      for (const key of Object.keys(resolved)) {
        if (key !== "properties" && key !== "required") {
          merged[key] = resolved[key];
        }
      }
    }

    // Remove duplicate required fields
    merged.required = [...new Set(merged.required)];
    return merged;
  }

  if (schema.oneOf || schema.anyOf) {
    // Can't merge these, return with resolved sub-schemas
    return {
      ...schema,
      oneOf: schema.oneOf?.map(resolveComposedSchema),
      anyOf: schema.anyOf?.map(resolveComposedSchema),
    };
  }

  // Handle nested objects
  if (schema.type === "object" && schema.properties) {
    return {
      ...schema,
      properties: Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, resolveComposedSchema(value)])),
    };
  }

  // Handle arrays
  if (schema.type === "array" && schema.items) {
    return {
      ...schema,
      items: resolveComposedSchema(schema.items),
    };
  }

  return schema;
}

export function extractOperations(api: any): ParsedOperation[] {
  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(api.paths || {})) {
    const methods = ["get", "post", "put", "delete", "patch", "head", "options"];

    for (const method of methods) {
      const operation = (pathItem as any)[method];
      if (!operation) continue;

      operations.push({
        operationId: operation.operationId || `${method}_${path.replace(/[{}]/g, "")}`,
        method: method.toUpperCase(),
        path,
        summary: operation.summary || "",
        description: operation.description || "",
        tags: operation.tags || [],
        parameters: [...((pathItem as any).parameters || []), ...(operation.parameters || [])],
        requestBody: operation.requestBody,
        responses: operation.responses || {},
        security: operation.security || api.security || [],
        servers: operation.servers || (pathItem as any).servers || api.servers || [],
      });
    }
  }

  return operations;
}

export function extractContentTypes(responses: Record<string, any>): string[] {
  const contentTypes = new Set<string>();

  for (const response of Object.values(responses)) {
    if (response.content) {
      Object.keys(response.content).forEach((ct) => contentTypes.add(ct));
    }
  }

  return Array.from(contentTypes);
}
