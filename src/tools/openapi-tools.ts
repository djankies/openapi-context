/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: OpenAPI schemas are inherently dynamic and require any types for proper handling

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config, OpenAPIResponse, OpenAPIHeader } from "../types.js";
import { z } from "zod";
import { schemaStore } from "../schema-store.js";
import {
  simplifySchema,
  formatCompactSchema,
  extractRequiredFields,
  summarizeParameters,
  summarizeResponses,
  summarizeAuth,
  paginateContent,
  formatHeaderSchema,
} from "../utils/schema-formatter.js";

// Tool schemas for input validation
const ListOperationsSchema = {
  filter: z
    .string()
    .optional()
    .describe("Filter results by tag, HTTP method (GET, POST, etc.), or search term. Examples: 'user', 'POST', 'auth'"),
  compact: z.boolean().optional().describe("Return minimal output for efficient context usage"),
};

const GetOperationDetailsSchema = {
  operation_id: z
    .string()
    .optional()
    .describe("Operation ID from the spec (e.g., 'getUser', 'createOrder'). Use list_operations to find available IDs"),
  method: z.string().optional().describe("HTTP method in UPPERCASE (GET, POST, PUT, DELETE, PATCH)"),
  path: z.string().optional().describe("API endpoint path exactly as shown in spec (e.g., '/users/{id}', '/api/v1/orders')"),
  detail_level: z
    .enum(["minimal", "standard", "full"])
    .optional()
    .describe("Level of detail to return. 'minimal' for basic info, 'standard' for simplified schemas, 'full' for everything"),
  fields: z.array(z.string()).optional().describe("Select specific fields to return (e.g., ['summary', 'parameters', 'required'])"),
};

const GetRequestSchemaSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
  content_type: z.string().optional().describe("Specific content type to return"),
  compact: z.boolean().optional().describe("Return simplified schema without patterns and excess details"),
  raw: z.boolean().optional().describe("Return raw unsimplified schema with all details"),
  index: z.number().optional().describe("Character index to start reading from (for pagination of large schemas)"),
  chunk_size: z.number().default(2000).optional().describe("Size of each chunk for pagination (default: 2000 characters)"),
};

const GetResponseSchemaSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
  status_code: z.string().optional().describe("Specific status code to return"),
  compact: z.boolean().optional().describe("Return simplified schema without patterns and excess details"),
  raw: z.boolean().optional().describe("Return raw unsimplified schema with all details"),
  index: z.number().optional().describe("Character index to start reading from (for pagination of large schemas)"),
  chunk_size: z.number().default(2000).optional().describe("Size of each chunk for pagination (default: 2000 characters)"),
};

const SearchOperationsSchema = {
  query: z
    .string()
    .min(1)
    .max(200)
    .describe("Search term to find in operation paths, summaries, or tags (e.g., 'authentication', 'user', 'payment')"),
};

const GetAuthRequirementsSchema = {
  operation_id: z.string().optional().describe("Optional operation ID for specific auth requirements"),
};

const GetOperationExamplesSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
};

const GetServerInfoSchema = {};

const ListTagsSchema = {};

const GetOperationSummarySchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
};

const GetHeadersSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
  status_code: z.string().optional().describe("Specific status code to return headers for"),
  compact: z.boolean().optional().describe("Return simplified header format"),
};

const HelpSchema = {};

// Helper function to create standardized "no spec loaded" error
function createNoSpecError() {
  return {
    content: [
      {
        type: "text" as const,
        text:
          "**No OpenAPI Spec Available**\n\n" +
          "No OpenAPI specification has been loaded. To fix this:\n\n" +
          "1. Mount your OpenAPI file to `/app/spec` in the container\n" +
          "2. Restart the MCP server\n" +
          "3. The spec will auto-load when the server starts\n\n" +
          '💡 Make sure your Docker volume mount is configured: `-v "/path/to/your/openapi.yaml:/app/spec:ro"`\n\n' +
          "📚 **Need detailed setup help?** Call the `help()` tool for comprehensive configuration instructions and troubleshooting tips.",
      },
    ],
  };
}

export function registerOpenAPITools(server: McpServer, _config: Config) {
  console.log("Registering OpenAPI tools...");

  // Generate dynamic descriptions based on loaded spec
  const metadata = schemaStore.getMetadata();
  const specInfo = metadata ? `${metadata.title} v${metadata.version}` : null;
  const operationCount = metadata ? ` (${schemaStore.getOperations().length} operations)` : "";

  // Tool 1: List Operations
  const listOperationsDescription = specInfo
    ? `List all API endpoints from ${specInfo}${operationCount}. Use filter to search by tag, method (GET/POST), or keyword. Use compact=true for minimal context-efficient output.`
    : "List all API endpoints (no spec loaded). Use filter to search by tag, method (GET/POST), or keyword. Use compact=true for minimal context-efficient output.";

  server.tool("list_operations", listOperationsDescription, ListOperationsSchema, async ({ filter, compact }) => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      const operations = schemaStore.findOperations(filter);

      if (operations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: filter
                ? `**No Operations Found**\n\nNo operations found matching filter: "${filter}"\n\n💡 Try a different filter term or call \`help()\` for search tips.`
                : "**No Operations Found**\n\nThe loaded schema contains no operations.\n\n💡 Check your OpenAPI spec or call `help()` for troubleshooting.",
            },
          ],
        };
      }

      const metadata = schemaStore.getMetadata();
      let operationList: string;

      if (compact) {
        // Compact mode: just method, path, and summary
        operationList = operations.map((op) => `- **${op.method} ${op.path}** - ${op.summary || "No summary"}`).join("\n");
      } else {
        // Full mode: current detailed output
        operationList = operations
          .map((op) => {
            const contentTypes = op.requestBody?.content ? Object.keys(op.requestBody.content) : [];
            return (
              `- **${op.method.toUpperCase()} ${op.path}**\n` +
              `  - ID: \`${op.operationId || "N/A"}\`\n` +
              `  - Summary: ${op.summary || "No summary"}\n` +
              `  - Tags: ${op.tags.join(", ") || "None"}\n` +
              `  - Content Types: ${contentTypes.join(", ") || "None"}`
            );
          })
          .join("\n\n");
      }

      return {
        content: [
          {
            type: "text" as const,
            text:
              `**Available API Operations** (${operations.length} found)\n` +
              `**API:** ${metadata?.title} v${metadata?.version}\n\n${operationList}`,
          },
        ],
      };
    } catch (error) {
      console.error("List operations error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Listing Operations**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  // Tool 3: Get Operation Details
  const getOperationDetailsDescription = specInfo
    ? `Get full details for an endpoint from ${specInfo}. Use operation_id (e.g., 'getUser') OR method + path (e.g., method='GET', path='/users/{id}'). Support detail_level (minimal/standard/full) and fields selection for context efficiency.`
    : "Get full details for an endpoint (no spec loaded). Use operation_id (e.g., 'getUser') OR method + path (e.g., method='GET', path='/users/{id}'). Support detail_level (minimal/standard/full) and fields selection for context efficiency.";

  server.tool(
    "get_operation_details",
    getOperationDetailsDescription,
    GetOperationDetailsSchema,
    async ({ operation_id, method, path, detail_level = "standard", fields }) => {
      try {
        if (!schemaStore.hasSchema()) {
          return createNoSpecError();
        }

        let operation;
        if (operation_id) {
          operation = schemaStore.findOperation({ operationId: operation_id });
        } else if (method && path) {
          operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        // Handle minimal detail level
        if (detail_level === "minimal") {
          let minimal = `**${operation.method.toUpperCase()} ${operation.path}**\n\n`;
          if (operation.summary) minimal += `${operation.summary}\n\n`;

          const paramSummary = summarizeParameters(operation.parameters || [], operation.requestBody);
          minimal += `**Parameters:** ${paramSummary}\n`;

          if (operation.requestBody?.content) {
            const contentTypes = Object.keys(operation.requestBody.content);
            if (contentTypes.length > 0) {
              const schema = (operation.requestBody.content[contentTypes[0]] as any).schema;
              if (schema) {
                const requiredFields = extractRequiredFields(schema);
                minimal += `**Required:** ${requiredFields.length > 0 ? requiredFields.join(", ") : "none"}\n`;
              }
            }
          }

          minimal += `**Auth:** ${summarizeAuth(operation.security)}\n`;

          return {
            content: [
              {
                type: "text" as const,
                text: minimal,
              },
            ],
          };
        }

        // Handle field selection
        const includeField = (field: string) => !fields || fields.includes(field);

        // Format the response
        let details =
          detail_level === "full"
            ? `**Operation Details**\n\n**${operation.method.toUpperCase()} ${operation.path}**\n\n`
            : `**Operation: ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

        if (includeField("operationId")) {
          details += `**Operation ID:** \`${operation.operationId || "N/A"}\`\n`;
        }
        if (includeField("summary")) {
          details += `**Summary:** ${operation.summary || "No summary"}\n`;
        }
        if (includeField("description") && detail_level === "full") {
          details += `**Description:** ${operation.description || "No description"}\n`;
        }
        if (includeField("tags")) {
          details += `**Tags:** ${operation.tags.join(", ") || "None"}\n`;
        }
        if (includeField("security")) {
          details += `**Security Required:** ${operation.security && operation.security.length > 0 ? "Yes" : "No"}\n`;
        }
        details += "\n";

        // Add request schemas
        if (includeField("requestBody") && operation.requestBody?.content) {
          details += `**Request Body Schemas:**\n\n`;
          for (const [contentType, content] of Object.entries(operation.requestBody.content)) {
            details += `Content-Type: \`${contentType}\`\n`;
            if ((content as any).schema) {
              const schema =
                detail_level === "full"
                  ? (content as any).schema
                  : simplifySchema((content as any).schema, {
                      includePatterns: false,
                      includeExamples: detail_level !== "standard",
                      maxExamples: 1,
                      includeDescriptions: detail_level !== "standard",
                    });
              details += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n`;
            }
          }
        } else if (includeField("requestBody")) {
          details += `**Request Body:** None\n\n`;
        }

        // Add parameters
        if (includeField("parameters") && operation.parameters && operation.parameters.length > 0) {
          details += `**Parameters:**\n\n`;
          for (const param of operation.parameters) {
            details += `- **${param.name}** (${param.in}): ${param.description || "No description"}\n`;
            details += `  - Required: ${param.required ? "Yes" : "No"}\n`;
            if (param.schema) {
              details += `  - Type: ${formatCompactSchema(param.schema)}\n`;
            }
            details += "\n";
          }
        }

        // Add response schemas
        if (includeField("responses")) {
          details += `**Response Schemas:**\n\n`;
          for (const [statusCode, response] of Object.entries(operation.responses)) {
            details += `Status Code: \`${statusCode}\`\n`;
            details += `Description: ${(response as any).description || "No description"}\n`;

            if ((response as any).content) {
              for (const [contentType, content] of Object.entries((response as any).content)) {
                details += `Content-Type: \`${contentType}\`\n`;
                if ((content as any).schema) {
                  const schema =
                    detail_level === "full"
                      ? (content as any).schema
                      : simplifySchema((content as any).schema, {
                          includePatterns: false,
                          includeExamples: detail_level !== "standard",
                          maxExamples: 1,
                          includeDescriptions: detail_level !== "standard",
                        });
                  details += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n`;
                }
              }
            } else {
              details += "No content schema\n\n";
            }
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: details,
            },
          ],
        };
      } catch (error) {
        console.error("Get operation details error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Operation Details**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
            },
          ],
        };
      }
    },
  );

  // Tool 4: Get Request Schema
  const getRequestSchemaDescription = specInfo
    ? `Get request body schema from ${specInfo}. Shows JSON schema with types, required fields, and constraints. Use compact=true for simplified schema format, raw=true for full details. Large schemas are automatically paginated; use index and chunk_size for navigation.`
    : "Get request body schema (no spec loaded). Shows JSON schema with types, required fields, and constraints. Use compact=true for simplified schema format, raw=true for full details. Large schemas are automatically paginated; use index and chunk_size for navigation.";

  server.tool(
    "get_request_schema",
    getRequestSchemaDescription,
    GetRequestSchemaSchema,
    async ({ operation_id, method, path, content_type, compact, raw, index, chunk_size }) => {
      try {
        if (!schemaStore.hasSchema()) {
          return createNoSpecError();
        }

        let operation;
        if (operation_id) {
          operation = schemaStore.findOperation({ operationId: operation_id });
        } else if (method && path) {
          operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        if (!operation.requestBody?.content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**No Request Body**\n\nOperation ${operation.method.toUpperCase()} ${operation.path} does not have a request body.\n\n💡 Use \`get_operation_details()\` to see available operation info or call \`help()\` for guidance.`,
              },
            ],
          };
        }

        let result = `**Request Body Schema for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

        if (content_type) {
          const content = operation.requestBody.content[content_type];
          if (!content) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `**Content Type Not Found**\n\nContent type "${content_type}" not found for this operation.`,
                },
              ],
            };
          }

          result += `Content-Type: \`${content_type}\`\n`;
          if ((content as any).schema) {
            if (compact) {
              const compactFormat = formatCompactSchema((content as any).schema);
              result += `Type: \`${compactFormat}\`\n`;
              const required = extractRequiredFields((content as any).schema);
              if (required.length > 0) {
                result += `Required: ${required.join(", ")}\n`;
              }
            } else {
              const schema = raw
                ? (content as any).schema
                : simplifySchema((content as any).schema, {
                    includePatterns: false,
                    includeExamples: true,
                    maxExamples: 1,
                    includeDescriptions: false,
                    maxEnumValues: 10,
                  });
              result += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
            }
          }
        } else {
          for (const [ct, content] of Object.entries(operation.requestBody.content)) {
            result += `Content-Type: \`${ct}\`\n`;
            if ((content as any).schema) {
              if (compact) {
                const compactFormat = formatCompactSchema((content as any).schema);
                result += `Type: \`${compactFormat}\`\n`;
                const required = extractRequiredFields((content as any).schema);
                if (required.length > 0) {
                  result += `Required: ${required.join(", ")}\n`;
                }
                result += "\n";
              } else {
                const schema = raw
                  ? (content as any).schema
                  : simplifySchema((content as any).schema, {
                      includePatterns: false,
                      includeExamples: true,
                      maxExamples: 1,
                      includeDescriptions: false,
                    });
                result += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n`;
              }
            }
          }
        }

        // Apply pagination if content exceeds chunk size or index is provided
        const effectiveChunkSize = chunk_size || 2000;
        if (result.length > effectiveChunkSize || index !== undefined) {
          const paginated = paginateContent(result, {
            startIndex: index || 0,
            chunkSize: effectiveChunkSize,
            smartBreaks: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `${paginated.content}\n\n${paginated.navigationFooter}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: result,
            },
          ],
        };
      } catch (error) {
        console.error("Get request schema error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Request Schema**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
            },
          ],
        };
      }
    },
  );

  // Tool 5: Get Response Schema
  const getResponseSchemaDescription = specInfo
    ? `Get response schemas from ${specInfo} by status code. Shows JSON schema for successful (200) and error responses. Use compact=true for simplified schema format, raw=true for full details. Large schemas are automatically paginated; use index and chunk_size for navigation.`
    : "Get response schemas (no spec loaded) by status code. Shows JSON schema for successful (200) and error responses. Use compact=true for simplified schema format, raw=true for full details. Large schemas are automatically paginated; use index and chunk_size for navigation.";

  server.tool(
    "get_response_schema",
    getResponseSchemaDescription,
    GetResponseSchemaSchema,
    async ({ operation_id, method, path, status_code, compact, raw, index, chunk_size }) => {
      try {
        if (!schemaStore.hasSchema()) {
          return createNoSpecError();
        }

        let operation;
        if (operation_id) {
          operation = schemaStore.findOperation({ operationId: operation_id });
        } else if (method && path) {
          operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        let result = status_code
          ? `**Response Schema for ${status_code}**\n\n`
          : `**Response Schemas for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

        if (status_code) {
          const response = operation.responses[status_code];
          if (!response) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `**Status Code Not Found**\n\nStatus code "${status_code}" not found for this operation.`,
                },
              ],
            };
          }

          result += `Status Code: \`${status_code}\`\n`;
          result += `Description: ${(response as any).description || "No description"}\n\n`;

          if ((response as any).content) {
            for (const [contentType, content] of Object.entries((response as any).content)) {
              result += `Content-Type: \`${contentType}\`\n`;
              if ((content as any).schema) {
                if (compact) {
                  const compactFormat = formatCompactSchema((content as any).schema);
                  result += `Type: \`${compactFormat}\`\n\n`;
                } else {
                  const schema = raw
                    ? (content as any).schema
                    : simplifySchema((content as any).schema, {
                        includePatterns: false,
                        includeExamples: true,
                        maxExamples: 1,
                        includeDescriptions: false,
                      });
                  result += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n`;
                }
              }
            }
          } else {
            result += "No content schema\n";
          }
        } else {
          for (const [statusCode, response] of Object.entries(operation.responses)) {
            result += `Status Code: \`${statusCode}\`\n`;
            result += `Description: ${(response as any).description || "No description"}\n`;

            if ((response as any).content) {
              for (const [contentType, content] of Object.entries((response as any).content)) {
                result += `Content-Type: \`${contentType}\`\n`;
                if ((content as any).schema) {
                  if (compact) {
                    const compactFormat = formatCompactSchema((content as any).schema);
                    result += `Type: \`${compactFormat}\`\n\n`;
                  } else {
                    const schema = raw
                      ? (content as any).schema
                      : simplifySchema((content as any).schema, {
                          includePatterns: false,
                          includeExamples: true,
                          maxExamples: 1,
                          includeDescriptions: false,
                        });
                    result += `\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n\n`;
                  }
                }
              }
            } else {
              result += "No content schema\n\n";
            }
          }
        }

        // Apply pagination if content exceeds chunk size or index is provided
        const effectiveChunkSize = chunk_size || 2000;
        if (result.length > effectiveChunkSize || index !== undefined) {
          const paginated = paginateContent(result, {
            startIndex: index || 0,
            chunkSize: effectiveChunkSize,
            smartBreaks: true,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `${paginated.content}\n\n${paginated.navigationFooter}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: result,
            },
          ],
        };
      } catch (error) {
        console.error("Get response schema error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Response Schema**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
            },
          ],
        };
      }
    },
  );

  // Tool 6: Search Operations
  const searchOperationsDescription = specInfo
    ? `Search endpoints in ${specInfo} by keyword. Searches paths, summaries, and tags.`
    : "Search endpoints (no spec loaded) by keyword. Searches paths, summaries, and tags.";

  server.tool("search_operations", searchOperationsDescription, SearchOperationsSchema, async ({ query }) => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      const operations = schemaStore.findOperations(query);

      if (operations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `**No Operations Found**\n\nNo operations found matching query: "${query}"\n\n💡 Try a different search term or call \`help()\` for search tips.`,
            },
          ],
        };
      }

      const operationList = operations
        .map((op) => {
          return (
            `- **${op.method.toUpperCase()} ${op.path}**\n` +
            `  - ID: \`${op.operationId || "N/A"}\`\n` +
            `  - Summary: ${op.summary || "No summary"}\n` +
            `  - Tags: ${op.tags.join(", ") || "None"}`
          );
        })
        .join("\n\n");

      const metadata = schemaStore.getMetadata();
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**Search Results** (${operations.length} found)\n` +
              `**API:** ${metadata?.title} v${metadata?.version}\n` +
              `**Query:** "${query}"\n\n${operationList}`,
          },
        ],
      };
    } catch (error) {
      console.error("Search operations error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Searching Operations**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  // Tool 7: Get Operation Examples
  const getOperationExamplesDescription = specInfo
    ? `Get example request/response payloads from ${specInfo}. Shows real JSON examples from the spec.`
    : "Get example request/response payloads (no spec loaded). Shows real JSON examples from the spec.";

  server.tool(
    "get_operation_examples",
    getOperationExamplesDescription,
    GetOperationExamplesSchema,
    async ({ operation_id, method, path }) => {
      try {
        if (!schemaStore.hasSchema()) {
          return createNoSpecError();
        }

        let operation;
        if (operation_id) {
          operation = schemaStore.findOperation({ operationId: operation_id });
        } else if (method && path) {
          operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        let examples = `**Examples for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;
        let hasExamples = false;

        // Request examples
        if (operation.requestBody?.content) {
          examples += `**Request Examples:**\n\n`;
          for (const [contentType, content] of Object.entries(operation.requestBody.content)) {
            if ((content as any).examples) {
              hasExamples = true;
              examples += `Content-Type: \`${contentType}\`\n`;
              for (const [exampleName, example] of Object.entries((content as any).examples)) {
                examples += `Example: \`${exampleName}\`\n`;
                examples += `\`\`\`json\n${JSON.stringify((example as any).value || example, null, 2)}\n\`\`\`\n\n`;
              }
            }
          }
        }

        // Response examples
        examples += `**Response Examples:**\n\n`;
        for (const [statusCode, response] of Object.entries(operation.responses)) {
          if ((response as any).content) {
            for (const [contentType, content] of Object.entries((response as any).content)) {
              if ((content as any).examples) {
                hasExamples = true;
                examples += `Status: \`${statusCode}\`, Content-Type: \`${contentType}\`\n`;
                for (const [exampleName, example] of Object.entries((content as any).examples)) {
                  examples += `Example: \`${exampleName}\`\n`;
                  examples += `\`\`\`json\n${JSON.stringify((example as any).value || example, null, 2)}\n\`\`\`\n\n`;
                }
              }
            }
          }
        }

        if (!hasExamples) {
          examples += `No examples available for this operation.`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: examples,
            },
          ],
        };
      } catch (error) {
        console.error("Get operation examples error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Operation Examples**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
            },
          ],
        };
      }
    },
  );

  // Tool 8: Get Authentication Requirements
  const getAuthRequirementsDescription = specInfo
    ? `Get authentication/security requirements for ${specInfo}. Shows required auth methods, scopes, and security schemes.`
    : "Get authentication/security requirements (no spec loaded). Shows required auth methods, scopes, and security schemes.";

  server.tool("get_auth_requirements", getAuthRequirementsDescription, GetAuthRequirementsSchema, async ({ operation_id }) => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      const currentSchema = schemaStore.getCurrentSchema();
      let result = `**Authentication Requirements**\n\n`;

      if (operation_id) {
        const operation = schemaStore.findOperation({ operationId: operation_id });
        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        result += `**Authentication for ${operation_id}**\n\n**Operation:** ${operation.method.toUpperCase()} ${operation.path}\n\n`;

        if (operation.security && operation.security.length > 0) {
          result += `**Security Requirements:**\n`;
          for (const security of operation.security) {
            for (const [scheme, scopes] of Object.entries(security)) {
              result += `- Scheme: \`${scheme}\`\n`;
              if ((scopes as any).length > 0) {
                result += `  - Scopes: ${(scopes as any).join(", ")}\n`;
              }
            }
          }
        } else {
          result += `**Security:** No specific security requirements for this operation.\n`;
        }
      } else {
        // Global security requirements
        result += `**API:** ${currentSchema?.metadata.title} v${currentSchema?.metadata.version}\n\n`;

        if (currentSchema?.security && currentSchema.security.length > 0) {
          result += `**Global Security Requirements:**\n`;
          for (const security of currentSchema.security) {
            for (const [scheme, scopes] of Object.entries(security)) {
              result += `- Scheme: \`${scheme}\`\n`;
              if ((scopes as any).length > 0) {
                result += `  - Scopes: ${(scopes as any).join(", ")}\n`;
              }
            }
          }
        } else {
          result += `**Security:** No global security requirements defined.\n`;
        }

        // Security schemes with enhanced details
        if (currentSchema?.api.components?.securitySchemes) {
          result += `\n**Available Security Schemes:**\n`;
          for (const [name, scheme] of Object.entries(currentSchema.api.components.securitySchemes)) {
            const schemeObj = scheme as any;
            result += `- **${name}** (${schemeObj.type})\n`;
            result += `  - Type: ${schemeObj.type}\n`;

            if (schemeObj.description) {
              result += `  - Description: ${schemeObj.description}\n`;
            }

            // Add practical implementation details based on scheme type
            if (schemeObj.type === "http") {
              result += `  - Scheme: ${schemeObj.scheme}\n`;
              if (schemeObj.scheme === "bearer") {
                result += `  - Implementation: \`Authorization: Bearer <token>\`\n`;
                if (schemeObj.bearerFormat) {
                  result += `  - Token Format: ${schemeObj.bearerFormat}\n`;
                  result += `  - bearerFormat: ${schemeObj.bearerFormat}\n`;
                }
              } else if (schemeObj.scheme === "basic") {
                result += `  - Implementation: \`Authorization: Basic <base64(username:password)>\`\n`;
              } else {
                result += `  - Scheme: ${schemeObj.scheme}\n`;
                result += `  - Implementation: \`Authorization: ${schemeObj.scheme} <credentials>\`\n`;
              }
            } else if (schemeObj.type === "apiKey") {
              result += `  - Location: ${schemeObj.in} parameter\n`;
              result += `  - Parameter Name: \`${schemeObj.name}\`\n`;
              if (schemeObj.in === "header") {
                result += `  - Implementation: \`${schemeObj.name}: <api-key>\`\n`;
              } else if (schemeObj.in === "query") {
                result += `  - Implementation: Add \`${schemeObj.name}=<api-key>\` to query string\n`;
              } else if (schemeObj.in === "cookie") {
                result += `  - Implementation: Set \`${schemeObj.name}=<api-key>\` cookie\n`;
              }
            } else if (schemeObj.type === "oauth2") {
              result += `  - OAuth2 Flows:\n`;
              if (schemeObj.flows) {
                for (const [flowType, flow] of Object.entries(schemeObj.flows)) {
                  result += `    - **${flowType}**\n`;
                  if ((flow as any).authorizationUrl) {
                    result += `      - Auth URL: ${(flow as any).authorizationUrl}\n`;
                  }
                  if ((flow as any).tokenUrl) {
                    result += `      - Token URL: ${(flow as any).tokenUrl}\n`;
                  }
                  if ((flow as any).scopes) {
                    const scopeList = Object.entries((flow as any).scopes)
                      .map(([scope, desc]) => `${scope}: ${desc}`)
                      .join(", ");
                    result += `      - Scopes: ${scopeList}\n`;
                  }
                }
              }
              result += `  - Implementation: \`Authorization: Bearer <oauth-token>\`\n`;
            } else if (schemeObj.type === "openIdConnect") {
              result += `  - OpenID Connect URL: ${schemeObj.openIdConnectUrl}\n`;
              result += `  - Implementation: \`Authorization: Bearer <id-token>\`\n`;
            }

            result += `\n`;
          }
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: result,
          },
        ],
      };
    } catch (error) {
      console.error("Get auth requirements error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Getting Auth Requirements**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  // Tool 9: Get Server Info
  const getServerInfoDescription = specInfo
    ? `Get server info and metadata for ${specInfo}. Shows API details, base URLs, and available servers.`
    : "Get server info and metadata (no spec loaded). Shows API details, base URLs, and available servers.";

  server.tool("get_server_info", getServerInfoDescription, GetServerInfoSchema, async () => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      // const currentSchema = schemaStore.getCurrentSchema();
      const metadata = schemaStore.getMetadata();
      const servers = schemaStore.getServers();

      let info = `**API Server Information**\n\n`;
      info += `**API:** ${metadata?.title} v${metadata?.version}\n`;
      if (metadata?.description) {
        info += `**Description:** ${metadata.description}\n`;
      }
      info += `**Loaded:** ${metadata?.loadedAt ? new Date(metadata.loadedAt).toISOString() : "Unknown"}\n`;
      info += `**Path:** ${metadata?.path}\n\n`;

      // Server information
      if (servers && servers.length > 0) {
        info += `**Servers:**\n`;
        for (const server of servers) {
          info += `- **URL:** ${server.url}\n`;
          if (server.description) {
            info += `  - Description: ${server.description}\n`;
          }
          if (server.variables) {
            info += `  - Variables:\n`;
            for (const [name, variable] of Object.entries(server.variables)) {
              info += `    - ${name}: ${(variable as any).default || "N/A"}`;
              if ((variable as any).description) {
                info += ` (${(variable as any).description})`;
              }
              info += "\n";
            }
          }
        }
        info += "\n";
      }

      // Statistics
      const operations = schemaStore.getOperations();
      const schemas = schemaStore.getSchemaNames();

      info += `**Statistics:**\n`;
      info += `- Operations: ${operations.length}\n`;
      info += `- Schemas: ${schemas.length}\n`;
      info += `- Tags: ${[...new Set(operations.flatMap((op) => op.tags))].length}\n`;
      info += `- Paths: ${[...new Set(operations.map((op) => op.path))].length}\n`;

      return {
        content: [
          {
            type: "text" as const,
            text: info,
          },
        ],
      };
    } catch (error) {
      console.error("Get server info error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Getting Server Info**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  // Tool 10: List Tags
  const listTagsDescription = specInfo
    ? `List all available tags/categories in ${specInfo} with operation counts. Use this for high-level API exploration.`
    : "List all available tags/categories (no spec loaded). Use this for high-level API exploration.";

  server.tool("list_tags", listTagsDescription, ListTagsSchema, async () => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      const operations = schemaStore.getOperations();
      const tagCounts = new Map<string, number>();

      // Count operations per tag
      operations.forEach((op) => {
        if (op.tags && op.tags.length > 0) {
          op.tags.forEach((tag) => {
            tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          });
        } else {
          // Count untagged operations
          tagCounts.set("untagged", (tagCounts.get("untagged") || 0) + 1);
        }
      });

      if (tagCounts.size === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "**No Tags Found**\n\nThe loaded API specification contains no tagged operations.",
            },
          ],
        };
      }

      // Sort tags by operation count (descending)
      const sortedTags = Array.from(tagCounts.entries()).sort((a, b) => b[1] - a[1]);

      const tagList = sortedTags.map(([tag, count]) => `- **${tag}** (${count} operation${count !== 1 ? "s" : ""})`).join("\n");

      const metadata = schemaStore.getMetadata();
      return {
        content: [
          {
            type: "text" as const,
            text:
              `**API Tags** (${tagCounts.size} found)\n` +
              `**API:** ${metadata?.title} v${metadata?.version}\n\n` +
              `Use these tags with \`list_operations\` filter or explore specific operations:\n\n${tagList}`,
          },
        ],
      };
    } catch (error) {
      console.error("List tags error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Listing Tags**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  // Tool 11: Get Operation Summary
  const getOperationSummaryDescription = specInfo
    ? `Get a concise summary of an endpoint from ${specInfo} without full schemas. Perfect for quick overview.`
    : "Get a concise summary of an endpoint (no spec loaded). Perfect for quick overview.";

  server.tool(
    "get_operation_summary",
    getOperationSummaryDescription,
    GetOperationSummarySchema,
    async ({ operation_id, method, path }) => {
      try {
        if (!schemaStore.hasSchema()) {
          return createNoSpecError();
        }

        let operation;
        if (operation_id) {
          operation = schemaStore.findOperation({ operationId: operation_id });
        } else if (method && path) {
          operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
              },
            ],
          };
        }

        let summary = `**Operation Summary**\n\n**${operation.method.toUpperCase()} ${operation.path}**\n`;

        if (operation.operationId) {
          summary += `**Operation ID:** ${operation.operationId}\n`;
        }

        if (operation.summary) {
          summary += `**Summary:** ${operation.summary}\n`;
        }

        // Add parameter summary
        const paramSummary = summarizeParameters(operation.parameters || [], operation.requestBody);
        summary += `**Parameters:** ${paramSummary}\n`;

        // Add required fields if request body exists
        if (operation.requestBody?.content) {
          const contentTypes = Object.keys(operation.requestBody.content);
          if (contentTypes.length > 0) {
            const schema = (operation.requestBody.content[contentTypes[0]] as any).schema;
            if (schema) {
              const requiredFields = extractRequiredFields(schema);
              if (requiredFields.length > 0) {
                summary += `**Required fields:** ${requiredFields.join(", ")}\n`;
              }
            }
          }
        }

        // Add response summary
        const responseSummary = summarizeResponses(operation.responses);
        summary += `**Responses:** ${responseSummary}\n`;

        // Add auth summary
        const authSummary = summarizeAuth(operation.security);
        summary += `**Auth:** ${authSummary}\n`;

        // Add tags
        if (operation.tags && operation.tags.length > 0) {
          summary += `**Tags:** ${operation.tags.join(", ")}\n`;
        }

        return {
          content: [
            {
              type: "text" as const,
              text: summary,
            },
          ],
        };
      } catch (error) {
        console.error("Get operation summary error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Operation Summary**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
            },
          ],
        };
      }
    },
  );

  // Tool 12: Help
  const helpDescription =
    "Get comprehensive help about using this OpenAPI Context MCP Server, including setup instructions and available tools.";
  server.tool("help", helpDescription, HelpSchema, async () => {
    try {
      const metadata = schemaStore.getMetadata();
      const hasSchema = schemaStore.hasSchema();

      let helpText = "# OpenAPI Context MCP Server Help\n\n";

      if (hasSchema && metadata) {
        helpText += `**Currently Loaded:** ${metadata.title} v${metadata.version}\n`;
        helpText += `**${schemaStore.getOperations().length} operations** available\n`;
        helpText += `**Loaded At:** ${metadata.loadedAt}\n\n`;
      } else {
        helpText += "**⚠️ No OpenAPI Spec Currently Loaded**\n\n";
      }

      helpText += "## What This Server Does\n\n";
      helpText += "This MCP server provides intelligent, context-efficient access to OpenAPI 3.1 specifications. ";
      helpText += "It helps LLMs understand and work with APIs without overwhelming context pollution.\n\n";

      helpText += "## Available Tools\n\n";
      helpText += "### 📋 Core Discovery Tools\n";
      helpText += "- **`list_operations`** - List all endpoints (use `compact=true` for minimal output)\n";
      helpText += "- **`search_operations`** - Search endpoints by keyword\n";
      helpText += "- **`list_tags`** - High-level API exploration by categories\n";
      helpText += "- **`get_operation_summary`** - Quick operation overview without full schemas\n\n";

      helpText += "### 🔍 Detailed Information Tools\n";
      helpText += "- **`get_operation_details`** - Full endpoint details (supports `detail_level` and `fields` selection)\n";
      helpText += "- **`get_request_schema`** - Request body schemas (use `compact=true` for simplified format)\n";
      helpText += "- **`get_response_schema`** - Response schemas (use `compact=true` for simplified format)\n";
      helpText += "- **`get_operation_examples`** - Example request/response payloads\n\n";

      helpText += "### ⚙️ Server Management Tools\n";
      helpText += "- **`get_auth_requirements`** - Authentication/security requirements\n";
      helpText += "- **`get_server_info`** - API server information and statistics\n";
      helpText += "- **`ping`** - Server health check\n";
      helpText += "- **`help`** - This help information\n\n";

      helpText += "## Context-Efficient Usage Patterns 🎯\n\n";
      helpText += "**Recommended Workflow:**\n";
      helpText += "1. Start with `list_tags()` for high-level exploration\n";
      helpText += "2. Use `list_operations(filter='category', compact=true)` to browse operations\n";
      helpText += "3. Get quick overviews with `get_operation_summary(operation_id='...')`\n";
      helpText += "4. Drill down with `get_operation_details(operation_id='...', detail_level='minimal')` \n";
      helpText += "5. Get schemas only when needed with `compact=true`\n\n";

      helpText += "**Key Parameters for Context Efficiency:**\n";
      helpText += "- `compact=true` - Simplified, readable output instead of full JSON\n";
      helpText += "- `detail_level='minimal'` - Essential info only (vs 'standard' or 'full')\n";
      helpText += "- `fields=['summary','parameters']` - Select only needed fields\n";
      helpText += "- `raw=true` - Get complete unfiltered schemas when absolutely necessary\n\n";

      if (!hasSchema) {
        helpText += "## Setup Instructions (No Spec Loaded)\n\n";
        helpText += "To load an OpenAPI specification, you need to mount your spec file to the container:\n\n";
        helpText += "**MCP Client Configuration:**\n";
        helpText += "```json\n";
        helpText += "{\n";
        helpText += '  "openapi-context": {\n';
        helpText += '    "command": "docker",\n';
        helpText += '    "args": [\n';
        helpText += '      "run", "--rm", "-i",\n';
        helpText += '      "-v", "/path/to/your/openapi.yaml:/app/spec:ro",\n';
        helpText += '      "djankies/openapi-context:latest"\n';
        helpText += "    ]\n";
        helpText += "  }\n";
        helpText += "}\n";
        helpText += "```\n\n";
        helpText += "**Important Notes:**\n";
        helpText += "- Replace `/path/to/your/openapi.yaml` with the actual path to your OpenAPI spec file\n";
        helpText += "- The spec must be mounted to `/app/spec` inside the container\n";
        helpText += "- Supported formats: `.yaml`, `.yml`, `.json`\n";
        helpText += "- The server will automatically load the spec when it starts\n";
        helpText += "- Restart your MCP client after updating the configuration\n\n";

        helpText += "**Example Paths:**\n";
        helpText += "- macOS/Linux: `~/specs/api.yaml:/app/spec:ro`\n";
        helpText += "- Windows: `C:/Users/YourName/specs/api.yaml:/app/spec:ro`\n\n";

        helpText += "**Troubleshooting:**\n";
        helpText += "- Make sure the file path exists and is readable\n";
        helpText += "- Check that your OpenAPI spec is valid YAML/JSON\n";
        helpText += "- Use `get_server_info()` to check if the spec loaded successfully\n";
        helpText += "- Check Docker logs if the container fails to start\n\n";
      }

      helpText += "## 💡 Pro Tips\n\n";
      helpText += "- Always start with `list_tags()` or `list_operations(compact=true)` for efficiency\n";
      helpText += "- Use `search_operations(query='keyword')` to find specific functionality\n";
      helpText += "- The `get_operation_summary()` tool is perfect for quick API understanding\n";
      helpText += "- Only use `detail_level='full'` or `raw=true` when you need complete details\n";
      helpText += "- Combine `fields` parameter to get exactly what you need\n\n";

      helpText += "## 🔗 Resources\n\n";
      helpText += "- **GitHub:** https://github.com/djankies/openapi-context\n";
      helpText += "- **Docker Hub:** https://hub.docker.com/r/djankies/openapi-context\n";
      helpText += "- **OpenAPI 3.1 Spec:** https://spec.openapis.org/oas/v3.1.0\n\n";

      helpText += "Need more help? Use the individual tools with invalid parameters to see their specific usage instructions!";

      return {
        content: [
          {
            type: "text",
            text: helpText,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `**Error Getting Help**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Try restarting the MCP server or check your setup configuration.`,
          },
        ],
      };
    }
  });

  // Tool 13: Get Headers
  const getHeadersDescription = specInfo
    ? `Get response headers from ${specInfo}. Shows HTTP headers defined for each status code with their types and descriptions.`
    : "Get response headers (no spec loaded). Shows HTTP headers defined for each status code with their types and descriptions.";

  server.tool("get_headers", getHeadersDescription, GetHeadersSchema, async ({ operation_id, method, path, status_code, compact }) => {
    try {
      if (!schemaStore.hasSchema()) {
        return createNoSpecError();
      }

      let operation;
      if (operation_id) {
        operation = schemaStore.findOperation({ operationId: operation_id });
      } else if (method && path) {
        operation = schemaStore.findOperation({ method: method.toUpperCase(), path });
      } else {
        return {
          content: [
            {
              type: "text" as const,
              text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.\n\n💡 Need help with tool usage? Call `help()` for detailed parameter guidance.",
            },
          ],
        };
      }

      if (!operation) {
        return {
          content: [
            {
              type: "text" as const,
              text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}\n\n💡 Use \`list_operations()\` to see available operations or call \`help()\` for usage guidance.`,
            },
          ],
        };
      }

      let result = status_code
        ? `**Response Headers for ${status_code}**\n\n`
        : `**Response Headers for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

      let hasHeaders = false;

      if (status_code) {
        const response = operation.responses[status_code] as OpenAPIResponse;
        if (!response) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Status Code Not Found**\n\nStatus code "${status_code}" not found for this operation.`,
              },
            ],
          };
        }

        result += `Status Code: \`${status_code}\`\n`;
        result += `Description: ${response.description || "No description"}\n\n`;

        if (response.headers) {
          hasHeaders = true;
          result += formatResponseHeaders(response.headers, compact);
        } else {
          result += "No headers defined\n";
        }
      } else {
        for (const [statusCode, response] of Object.entries(operation.responses)) {
          const resp = response as OpenAPIResponse;
          result += `Status Code: \`${statusCode}\`\n`;
          result += `Description: ${resp.description || "No description"}\n`;

          if (resp.headers) {
            hasHeaders = true;
            result += formatResponseHeaders(resp.headers, compact);
          } else {
            result += "No headers defined\n";
          }
          result += "\n";
        }
      }

      if (!hasHeaders && !status_code) {
        result += "No headers defined for any response in this operation.\n";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: result,
          },
        ],
      };
    } catch (error) {
      console.error("Get headers tool error:", error);
      return {
        content: [
          {
            type: "text" as const,
            text: `**Error Getting Headers**\n\n${error instanceof Error ? error.message : String(error)}\n\n💡 Call \`help()\` for troubleshooting guidance.`,
          },
        ],
      };
    }
  });

  console.log("OpenAPI tools registered successfully");
}

/**
 * Format headers for a response into a readable string
 * @param headers - The headers object from an OpenAPI response
 * @param compact - Whether to use compact formatting
 * @returns Formatted string representation of the headers
 */
function formatResponseHeaders(headers: Record<string, OpenAPIHeader>, compact: boolean = false): string {
  let result = "";

  for (const [headerName, header] of Object.entries(headers)) {
    if (compact) {
      const headerType = formatHeaderSchema(header);
      result += `- **${headerName}** (${headerType})`;
      if (header.description) {
        result += `: ${header.description}`;
      }
      result += "\n";
    } else {
      result += `- **${headerName}**\n`;
      result += `  - Type: ${formatHeaderSchema(header)}\n`;
      if (header.description) {
        result += `  - Description: ${header.description}\n`;
      }
      if (header.required) {
        result += `  - Required: ${header.required ? "Yes" : "No"}\n`;
      }
      result += "\n";
    }
  }

  return result;
}
