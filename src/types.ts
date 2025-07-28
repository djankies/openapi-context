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
