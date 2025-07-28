import { z } from "zod";

// OpenAPI Context MCP Server Configuration
export interface Config {
  port: number;
  host: string;
  logLevel: "debug" | "info" | "warn" | "error";
  maxSpecSize?: number; // Maximum OpenAPI spec size in MB
}

// MCP tool schemas using Zod
export const ListTablesSchema = {};

export const QueryDatabaseSchema = {
  sql: z.string().min(1, "SQL query cannot be empty").describe("SQL query to execute (SELECT queries only)"),
};

export const ExecuteDatabaseSchema = {
  sql: z.string().min(1, "SQL command cannot be empty").describe("SQL command to execute (INSERT, UPDATE, DELETE, CREATE, etc.)"),
};

// MCP response types
export interface McpTextContent {
  type: "text";
  text: string;
  isError?: boolean;
}

export interface McpResponse {
  content: McpTextContent[];
}

// Standard response creators
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSuccessResponse(message: string, data?: any): McpResponse {
  let text = `**Success**\n\n${message}`;
  if (data !== undefined) {
    text += `\n\n**Result:**\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  }
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createErrorResponse(message: string, details?: any): McpResponse {
  let text = `**Error**\n\n${message}`;
  if (details !== undefined) {
    text += `\n\n**Details:**\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``;
  }
  return {
    content: [
      {
        type: "text",
        text,
        isError: true,
      },
    ],
  };
}

// Database operation result type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DatabaseOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
}

// SQL validation result
export interface SqlValidationResult {
  isValid: boolean;
  error?: string;
}

// OpenAPI Schema Types
// These are intentionally flexible to handle the dynamic nature of OpenAPI schemas
export type OpenAPISchema = {
  type?: string;
  format?: string;
  properties?: Record<string, OpenAPISchema>;
  items?: OpenAPISchema;
  required?: string[];
  enum?: unknown[];
  allOf?: OpenAPISchema[];
  oneOf?: OpenAPISchema[];
  anyOf?: OpenAPISchema[];
  not?: OpenAPISchema;
  additionalProperties?: boolean | OpenAPISchema;
  description?: string;
  example?: unknown;
  examples?: unknown[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  $ref?: string;
  // Allow additional properties for vendor extensions and unknown properties
  [key: string]: unknown;
};

export type OpenAPIOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: OpenAPISecurityRequirement[];
  [key: string]: unknown;
};

export type OpenAPIParameter = {
  name: string;
  in: "query" | "header" | "path" | "cookie";
  required?: boolean;
  schema?: OpenAPISchema;
  description?: string;
  [key: string]: unknown;
};

export type OpenAPIRequestBody = {
  required?: boolean;
  content: Record<string, OpenAPIMediaType>;
  description?: string;
  [key: string]: unknown;
};

export type OpenAPIResponse = {
  description: string;
  content?: Record<string, OpenAPIMediaType>;
  headers?: Record<string, OpenAPIHeader>;
  [key: string]: unknown;
};

export type OpenAPIMediaType = {
  schema?: OpenAPISchema;
  examples?: Record<string, OpenAPIExample>;
  [key: string]: unknown;
};

export type OpenAPIExample = {
  value?: unknown;
  summary?: string;
  description?: string;
  [key: string]: unknown;
};

export type OpenAPIHeader = {
  schema?: OpenAPISchema;
  description?: string;
  required?: boolean;
  [key: string]: unknown;
};

export type OpenAPISecurityRequirement = Record<string, string[]>;

export type OpenAPISecurityScheme = {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  description?: string;
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  bearerFormat?: string;
  flows?: OpenAPIOAuthFlows;
  openIdConnectUrl?: string;
  [key: string]: unknown;
};

export type OpenAPIOAuthFlows = {
  implicit?: OpenAPIOAuthFlow;
  password?: OpenAPIOAuthFlow;
  clientCredentials?: OpenAPIOAuthFlow;
  authorizationCode?: OpenAPIOAuthFlow;
  [key: string]: unknown;
};

export type OpenAPIOAuthFlow = {
  authorizationUrl?: string;
  tokenUrl?: string;
  refreshUrl?: string;
  scopes: Record<string, string>;
  [key: string]: unknown;
};
