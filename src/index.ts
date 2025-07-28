import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Config } from "./types.js";
import { registerAllTools } from "./tools/register-tools.js";

/**
 * Load configuration from environment variables
 */
function loadConfig(): Config {
  return {
    port: parseInt(process.env.PORT || "3000"),
    host: process.env.HOST || "0.0.0.0",
    logLevel: (process.env.LOG_LEVEL as Config["logLevel"]) || "info",
    maxSpecSize: parseInt(process.env.MAX_SPEC_SIZE || "10"), // MB
  };
}

/**
 * OpenAPI Context MCP Server class
 */
class OpenAPIMCPServer {
  private server: McpServer;
  private app: express.Application;
  private config: Config;

  constructor() {
    this.config = loadConfig();
    this.server = new McpServer({
      name: "OpenAPI Context MCP Server",
      version: "1.0.0",
    });
    this.app = express();

    console.log("Initializing OpenAPI Context MCP Server with config:", {
      port: this.config.port,
      logLevel: this.config.logLevel,
      maxSpecSize: this.config.maxSpecSize,
    });
  }

  /**
   * Initialize the MCP server and register tools
   */
  async init(): Promise<void> {
    // Auto-load OpenAPI spec if available
    await this.autoLoadSpec();

    // Register all MCP tools (after spec is loaded for dynamic descriptions)
    registerAllTools(this.server, this.config);

    // Setup Express routes
    this.setupRoutes();

    console.log("MCP server initialized successfully");
  }

  /**
   * Auto-load OpenAPI spec from /app/spec file
   */
  private async autoLoadSpec(): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const { schemaStore } = await import("./schema-store.js");

      const specPath = "/app/spec";

      // Check if spec file exists
      try {
        await fs.access(specPath);
      } catch {
        console.log("No OpenAPI spec file found at /app/spec. Running without auto-loaded spec.");
        console.log('💡 Mount your OpenAPI file: -v "/path/to/your/openapi.yaml:/app/spec:ro"');
        return;
      }

      console.log("Auto-loading OpenAPI spec from /app/spec");

      try {
        const result = await schemaStore.loadSchema(specPath);
        const metadata = schemaStore.getMetadata();
        console.log(`✓ Auto-loaded: ${metadata?.title} v${metadata?.version}`);
        console.log(`✓ ${result.operationCount} operations available`);
        console.log(`✓ Ready for queries`);
      } catch (error) {
        console.error("Failed to auto-load OpenAPI spec:", error);
        console.log("💡 Ensure your file is a valid OpenAPI 3.1 specification");
      }
    } catch (error) {
      console.error("Error during auto-load:", error);
    }
  }

  /**
   * Setup Express.js routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get("/health", async (req: Request, res: Response) => {
      try {
        const { schemaStore } = await import("./schema-store.js");
        const metadata = schemaStore.getMetadata();

        const healthStatus = {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "1.0.0",
          schemaLoaded: schemaStore.hasSchema(),
          loadedSchema: metadata
            ? {
                title: metadata.title,
                version: metadata.version,
                loadedAt: metadata.loadedAt,
              }
            : null,
          mcp: "ready",
          uptime: process.uptime(),
        };
        res.status(200).json(healthStatus);
      } catch (error) {
        res.status(503).json({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Root endpoint
    this.app.get("/", (req: Request, res: Response) => {
      res.json({
        name: "OpenAPI Context MCP Server",
        version: "1.0.0",
        status: "running",
        endpoints: {
          health: "/health",
          mcp: "stdio transport",
        },
        tools: [
          "list_operations",
          "get_operation_details",
          "get_request_schema",
          "get_response_schema",
          "search_operations",
          "get_operation_examples",
          "get_auth_requirements",
          "get_server_info",
        ],
      });
    });
  }

  /**
   * Start the HTTP server and MCP server
   */
  async start(): Promise<void> {
    await this.init();

    // Only start HTTP server in HTTP mode, not stdio mode
    const mode = process.env.MCP_MODE || "stdio";
    if (mode === "http") {
      this.app.listen(this.config.port, this.config.host, () => {
        console.log(`OpenAPI Context MCP Server listening on ${this.config.host}:${this.config.port}`);
        console.log(`Health check available at http://${this.config.host}:${this.config.port}/health`);
      });
    }

    // Start MCP server with stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log("MCP server connected via stdio transport");

    // Keep the process alive and handle transport events
    this.setupTransportHandlers(transport);
  }

  /**
   * Setup transport event handlers
   */
  private setupTransportHandlers(transport: StdioServerTransport): void {
    // Handle transport close/error events
    transport.onclose = () => {
      console.log("Transport closed, shutting down...");
      this.cleanup();
    };

    transport.onerror = (error) => {
      console.error("Transport error:", error);
      this.cleanup();
    };
  }

  /**
   * Graceful shutdown
   */
  async cleanup(): Promise<void> {
    try {
      console.log("Graceful shutdown initiated...");

      // Set a timeout to force exit if cleanup takes too long
      const forceExitTimeout = setTimeout(() => {
        console.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 5000); // 5 second timeout

      // Close MCP server
      await this.server.close();

      clearTimeout(forceExitTimeout);
      console.log("OpenAPI Context MCP Server shutdown complete");

      // Give a small delay to ensure logs are flushed
      setTimeout(() => {
        process.exit(0);
      }, 100);
    } catch (error) {
      console.error("Error during shutdown:", error);
      setTimeout(() => {
        process.exit(1);
      }, 100);
    }
  }
}

// Handle graceful shutdown
const mcpServer = new OpenAPIMCPServer();
let isShuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (isShuttingDown) {
    console.log(`Already shutting down, ignoring ${signal}`);
    return;
  }

  isShuttingDown = true;
  console.log(`Received ${signal}, initiating graceful shutdown...`);
  mcpServer.cleanup();
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (!isShuttingDown) {
    isShuttingDown = true;
    mcpServer.cleanup();
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  if (!isShuttingDown) {
    isShuttingDown = true;
    mcpServer.cleanup();
  }
});

// Start the server
mcpServer.start().catch((error) => {
  console.error("Failed to start OpenAPI Context MCP Server:", error);
  process.exit(1);
});
