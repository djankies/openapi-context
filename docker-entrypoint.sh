#!/bin/sh

# Docker entrypoint script for OpenAPI Context MCP Server
# Supports stdio mode (for MCP clients) and HTTP mode (for testing)

set -e

# Initialize the specs directory if it doesn't exist
mkdir -p /app/specs

# Determine mode based on environment variable or arguments
if [ "$1" = "http" ] || [ "$MCP_MODE" = "http" ]; then
    echo "Starting OpenAPI Context MCP Server in HTTP mode..." >&2
    echo "Server will be available at http://localhost:${PORT:-3000}" >&2
    echo "Health check endpoint: http://localhost:${PORT:-3000}/health" >&2
    echo "Load OpenAPI specs using the index_openapi tool" >&2
    exec node dist/src/index.js
elif [ "$1" = "stdio" ] || [ "$MCP_MODE" = "stdio" ] || [ $# -eq 0 ]; then
    echo "Starting OpenAPI Context MCP Server in stdio mode..." >&2
    echo "Log Level: ${LOG_LEVEL:-info}" >&2
    echo "Ready to load OpenAPI specifications" >&2
    exec node dist/src/index.js
else
    # Pass through any other commands directly
    exec "$@"
fi