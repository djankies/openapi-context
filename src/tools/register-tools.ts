import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Config } from "../types.js";
import { registerOpenAPITools } from "./openapi-tools.js";

/**
 * Register all MCP tools for OpenAPI Context MCP server
 */
export function registerAllTools(server: McpServer, config: Config) {
  console.log("Registering MCP tools...");

  // Register OpenAPI tools
  registerOpenAPITools(server, config);

  // Register a simple ping tool for testing
  server.tool("ping", "Simple ping tool to test MCP server connectivity", {}, async () => {
    return {
      content: [
        {
          type: "text",
          text:
            "**Pong!**\n\nOpenAPI Context MCP server is running successfully.\n\n**Config:**\n```json\n" +
            JSON.stringify(
              {
                port: config.port,
                logLevel: config.logLevel,
                maxSpecSize: config.maxSpecSize,
              },
              null,
              2,
            ) +
            "\n```",
        },
      ],
    };
  });

  console.log("All MCP tools registered successfully");
}
