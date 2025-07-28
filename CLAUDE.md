# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an OpenAPI Context MCP (Model Context Protocol) Server that automatically loads OpenAPI 3.1 specifications and provides specialized tools for LLMs to query and analyze APIs. The server uses in-memory storage for fast access and is designed to work with MCP clients like Windsurf and Claude Code.

**Important**: The README.md contains comprehensive examples of what each MCP tool returns, which is essential for understanding the expected output format when debugging or developing new features.

## Core Architecture

### Key Components

- **`src/index.ts`**: Main server entry point with auto-loading logic, Express routes, and graceful shutdown handling
- **`src/schema-store.ts`**: In-memory storage system that replaced the original database approach - stores parsed OpenAPI specs, operations, and schemas
- **`src/openapi-parser.ts`**: OpenAPI 3.1 spec parsing and operation extraction logic
- **`src/tools/openapi-tools.ts`**: Defines 8 MCP tools with dynamic descriptions based on loaded specs
- **`src/tools/register-tools.ts`**: Tool registration orchestration
- **`src/types.ts`**: TypeScript interfaces and response types

### Architecture Patterns

- **Direct loading**: Server loads the OpenAPI file mounted at `/app/spec` at startup
- **In-memory storage**: Uses `SchemaStore` class instead of database for fast access - all OpenAPI data is parsed and stored in memory
- **Dynamic tool descriptions**: Tool descriptions are generated at runtime based on the loaded OpenAPI spec (e.g., "List endpoints from Petstore API v1.0.0 (15 operations)")
- **Single spec model**: Only one OpenAPI spec is loaded at a time, simplifying the architecture
- **Graceful shutdown**: Proper cleanup with timeout protection for MCP client compatibility

## Essential Development Commands

```bash
# Development and building
npm run dev              # Watch mode development
npm run build           # TypeScript compilation
npm start               # Run built server

# Testing and quality
npm test                # Run all tests with Vitest
npm run test:coverage   # Run tests with coverage report
npm run test:ui         # Run tests with Vitest UI
npm run type-check      # TypeScript type checking
npm run lint            # ESLint checking
npm run lint:fix        # Auto-fix ESLint issues
npm run ci              # Full CI pipeline (type-check, lint, format, test)

# Docker operations
npm run docker:build    # Build Docker image
npm run docker:run      # Run container locally

# Running single test files
npx vitest tests/unit/openapi-tools.test.ts
npx vitest tests/integration/mcp-server.test.ts --run
```

## Development Workflow

### Testing Strategy
- **Unit tests**: Focus on individual components (parser, tools, schema store)
- **Integration tests**: Test full MCP server functionality with real specs
- **Test data**: Uses `tests/data/simple-api.yaml` and `complex-api.yaml` for consistent testing
- **Schema store cleanup**: Tests use `schemaStore.clearSchema()` in afterEach hooks

### Critical Implementation Details

1. **Schema Store vs Database**: The project migrated from SQLite to in-memory storage. The `SchemaStore` class handles all data operations that previously used database queries.

2. **Tool Registration**: Tools are registered after schema loading so dynamic descriptions include the correct API context.

3. **MCP Client Compatibility**: The server includes specific handling for transport events and graceful shutdown to prevent hanging in clients like Windsurf.

4. **Direct File Loading**: The server expects the OpenAPI spec to be mounted at `/app/spec`, eliminating the need for file filtering or selection logic.

## Common Development Patterns

### Adding New Tools
1. Define schema in `openapi-tools.ts` using Zod
2. Create tool handler with proper error handling and `createNoSpecError()` for missing specs
3. Use `schemaStore` methods for data access instead of database queries
4. Register tool in `registerOpenAPITools()` function

### Error Handling Pattern
```typescript
if (!schemaStore.hasSchema()) {
  return createNoSpecError(); // Standardized "no spec loaded" response
}
```

### Schema Store Usage
```typescript
// Get loaded spec metadata
const metadata = schemaStore.getMetadata();

// Find operations
const operations = schemaStore.findOperations(filter);
const operation = schemaStore.findOperation({ operationId: 'getUser' });

// Access raw schema data
const currentSchema = schemaStore.getCurrentSchema();
```

## Environment Configuration

The server runs in stdio mode by default for MCP compatibility. Set `MCP_MODE=http` for HTTP server mode during development. Mount your OpenAPI file to `/app/spec` when using Docker.

### Environment Variables in MCP Config

Environment variables can be passed through Docker args in MCP configurations:

```json
{
  "openapi-context": {
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-e", "LOG_LEVEL=debug",
      "-e", "MAX_SPEC_SIZE=20", 
      "-v", "/path/to/spec.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  }
}
```

Available variables: `LOG_LEVEL`, `MAX_SPEC_SIZE`, `MCP_MODE`, `PORT`, `HOST`

### HTTP Mode

The server supports HTTP mode (`MCP_MODE=http`) for development and debugging:
- Runs BOTH HTTP server AND MCP stdio transport simultaneously  
- HTTP endpoints: `GET /` (server info), `GET /health` (health check with spec details)
- Use cases: debugging spec loading, health monitoring, integration testing
- Setup: `docker run -p 3000:3000 -e MCP_MODE=http -v spec.yaml:/app/spec:ro image`

## Testing Considerations

- Tests use the schema store directly instead of database setup/teardown
- Integration tests create real MCP server instances and test tool invocation
- Test helpers provide `createTestMcpServer()` and `callMcpTool()` utilities
- ESLint allows `any` types for OpenAPI schema handling due to their dynamic nature