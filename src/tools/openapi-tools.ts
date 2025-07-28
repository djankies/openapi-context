import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "../types.js";
import { z } from "zod";
import { schemaStore } from "../schema-store.js";

// Tool schemas for input validation
const ListOperationsSchema = {
  filter: z
    .string()
    .optional()
    .describe("Filter results by tag, HTTP method (GET, POST, etc.), or search term. Examples: 'user', 'POST', 'auth'"),
};

const GetOperationDetailsSchema = {
  operation_id: z
    .string()
    .optional()
    .describe("Operation ID from the spec (e.g., 'getUser', 'createOrder'). Use list_operations to find available IDs"),
  method: z.string().optional().describe("HTTP method in UPPERCASE (GET, POST, PUT, DELETE, PATCH)"),
  path: z.string().optional().describe("API endpoint path exactly as shown in spec (e.g., '/users/{id}', '/api/v1/orders')"),
};

const GetRequestSchemaSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
  content_type: z.string().optional().describe("Specific content type to return"),
};

const GetResponseSchemaSchema = {
  operation_id: z.string().optional().describe("Unique operation identifier"),
  method: z.string().optional().describe("HTTP method"),
  path: z.string().optional().describe("API path"),
  status_code: z.string().optional().describe("Specific status code to return"),
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
          '💡 Make sure your Docker volume mount is configured: `-v "/path/to/your/openapi.yaml:/app/spec:ro"`',
      },
    ],
  };
}

export function registerOpenAPITools(server: McpServer, _config: Config) {
  console.log("Registering OpenAPI tools...");

  // Generate dynamic descriptions based on loaded spec
  const metadata = schemaStore.getMetadata();
  const specInfo = metadata ? `${metadata.title} v${metadata.version}` : "OpenAPI spec";
  const operationCount = metadata ? ` (${schemaStore.getOperations().length} operations)` : "";

  // Tool 1: List Operations
  const listOperationsDescription = specInfo
    ? `List all API endpoints from ${specInfo}${operationCount}. Use filter to search by tag, method (GET/POST), or keyword.`
    : "List all API endpoints (no spec loaded). Use filter to search by tag, method (GET/POST), or keyword.";

  server.tool("list_operations", listOperationsDescription, ListOperationsSchema, async ({ filter }) => {
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
                ? `**No Operations Found**\n\nNo operations found matching filter: "${filter}"`
                : "**No Operations Found**\n\nThe loaded schema contains no operations.",
            },
          ],
        };
      }

      const operationList = operations
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

      const metadata = schemaStore.getMetadata();
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
            text: `**Error Listing Operations**\n\n${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  // Tool 3: Get Operation Details
  const getOperationDetailsDescription = specInfo
    ? `Get full details for an endpoint from ${specInfo}. Use operation_id (e.g., 'getUser') OR method + path (e.g., method='GET', path='/users/{id}').`
    : "Get full details for an endpoint (no spec loaded). Use operation_id (e.g., 'getUser') OR method + path (e.g., method='GET', path='/users/{id}').";

  server.tool(
    "get_operation_details",
    getOperationDetailsDescription,
    GetOperationDetailsSchema,
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
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}`,
              },
            ],
          };
        }

        // Format the response
        let details = `**Operation: ${operation.method.toUpperCase()} ${operation.path}**\n\n`;
        details += `**Operation ID:** \`${operation.operationId || "N/A"}\`\n`;
        details += `**Summary:** ${operation.summary || "No summary"}\n`;
        details += `**Description:** ${operation.description || "No description"}\n`;
        details += `**Tags:** ${operation.tags.join(", ") || "None"}\n`;
        details += `**Security Required:** ${operation.security && operation.security.length > 0 ? "Yes" : "No"}\n\n`;

        // Add request schemas
        if (operation.requestBody?.content) {
          details += `**Request Body Schemas:**\n\n`;
          for (const [contentType, content] of Object.entries(operation.requestBody.content)) {
            details += `Content-Type: \`${contentType}\`\n`;
            if ((content as any).schema) {
              details += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\`\n\n`;
            }
          }
        } else {
          details += `**Request Body:** None\n\n`;
        }

        // Add parameters
        if (operation.parameters && operation.parameters.length > 0) {
          details += `**Parameters:**\n\n`;
          for (const param of operation.parameters) {
            details += `- **${param.name}** (${param.in}): ${param.description || "No description"}\n`;
            details += `  - Required: ${param.required ? "Yes" : "No"}\n`;
            if (param.schema) {
              details += `  - Type: ${param.schema.type || "N/A"}\n`;
            }
            details += "\n";
          }
        }

        // Add response schemas
        details += `**Response Schemas:**\n\n`;
        for (const [statusCode, response] of Object.entries(operation.responses)) {
          details += `Status Code: \`${statusCode}\`\n`;
          details += `Description: ${(response as any).description || "No description"}\n`;

          if ((response as any).content) {
            for (const [contentType, content] of Object.entries((response as any).content)) {
              details += `Content-Type: \`${contentType}\`\n`;
              if ((content as any).schema) {
                details += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\`\n\n`;
              }
            }
          } else {
            details += "No content schema\n\n";
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
              text: `**Error Getting Operation Details**\n\n${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // Tool 4: Get Request Schema
  const getRequestSchemaDescription = specInfo
    ? `Get request body schema from ${specInfo}. Shows JSON schema with types, required fields, and constraints.`
    : "Get request body schema (no spec loaded). Shows JSON schema with types, required fields, and constraints.";

  server.tool(
    "get_request_schema",
    getRequestSchemaDescription,
    GetRequestSchemaSchema,
    async ({ operation_id, method, path, content_type }) => {
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
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}`,
              },
            ],
          };
        }

        if (!operation.requestBody?.content) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**No Request Body**\n\nOperation ${operation.method.toUpperCase()} ${operation.path} does not have a request body.`,
              },
            ],
          };
        }

        let result = `**Request Schema for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

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
            result += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\``;
          }
        } else {
          for (const [ct, content] of Object.entries(operation.requestBody.content)) {
            result += `Content-Type: \`${ct}\`\n`;
            if ((content as any).schema) {
              result += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\`\n\n`;
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
        console.error("Get request schema error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Request Schema**\n\n${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  // Tool 5: Get Response Schema
  const getResponseSchemaDescription = specInfo
    ? `Get response schemas from ${specInfo} by status code. Shows JSON schema for successful (200) and error responses.`
    : "Get response schemas (no spec loaded) by status code. Shows JSON schema for successful (200) and error responses.";

  server.tool(
    "get_response_schema",
    getResponseSchemaDescription,
    GetResponseSchemaSchema,
    async ({ operation_id, method, path, status_code }) => {
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
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}`,
              },
            ],
          };
        }

        let result = `**Response Schema for ${operation.method.toUpperCase()} ${operation.path}**\n\n`;

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
                result += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\`\n\n`;
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
                  result += `\`\`\`json\n${JSON.stringify((content as any).schema, null, 2)}\n\`\`\`\n\n`;
                }
              }
            } else {
              result += "No content schema\n\n";
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
        console.error("Get response schema error:", error);
        return {
          content: [
            {
              type: "text" as const,
              text: `**Error Getting Response Schema**\n\n${error instanceof Error ? error.message : String(error)}`,
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
              text: `**No Operations Found**\n\nNo operations found matching query: "${query}"`,
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
            text: `**Error Searching Operations**\n\n${error instanceof Error ? error.message : String(error)}`,
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
                text: "**Missing Parameters**\n\nPlease provide either `operation_id` or both `method` and `path`.",
              },
            ],
          };
        }

        if (!operation) {
          return {
            content: [
              {
                type: "text" as const,
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id || `${method} ${path}`}`,
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
              text: `**Error Getting Operation Examples**\n\n${error instanceof Error ? error.message : String(error)}`,
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
                text: `**Operation Not Found**\n\nOperation not found: ${operation_id}`,
              },
            ],
          };
        }

        result += `**Operation:** ${operation.method.toUpperCase()} ${operation.path}\n\n`;

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

        // Security schemes
        if (currentSchema?.api.components?.securitySchemes) {
          result += `\n**Available Security Schemes:**\n`;
          for (const [name, scheme] of Object.entries(currentSchema.api.components.securitySchemes)) {
            result += `- **${name}**: ${(scheme as any).type}\n`;
            if ((scheme as any).description) {
              result += `  - Description: ${(scheme as any).description}\n`;
            }
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
            text: `**Error Getting Auth Requirements**\n\n${error instanceof Error ? error.message : String(error)}`,
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
      info += `**Loaded:** ${metadata?.loadedAt.toISOString()}\n`;
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
            text: `**Error Getting Server Info**\n\n${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  });

  console.log("OpenAPI tools registered successfully");
}
