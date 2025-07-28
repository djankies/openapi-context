# OpenAPI Context MCP Server

Provide your LLMs with a way to get the context they need from your OpenAPI specs, efficiently, and without polluting context. This server automatically loads OpenAPI specs and provides intelligent tools for LLMs to understand and work with APIs.

- [OpenAPI Context MCP Server](#openapi-context-mcp-server)
  - [Available Tools](#available-tools)
  - [Features](#features)
  - [Supported File Formats](#supported-file-formats)
  - [Quick Start](#quick-start)
    - [Docker Setup](#docker-setup)
    - [MCP Client Configuration](#mcp-client-configuration)
  - [Tool Response Examples](#tool-response-examples)
    - [1. `list_operations` - List all endpoints](#1-list_operations---list-all-endpoints)
    - [2. `get_operation_details` - Detailed endpoint information](#2-get_operation_details---detailed-endpoint-information)
    - [3. `search_operations` - Find endpoints by keyword](#3-search_operations---find-endpoints-by-keyword)
    - [4. `get_request_schema` - Request body schema](#4-get_request_schema---request-body-schema)
    - [5. `get_response_schema` - Response schema by status code](#5-get_response_schema---response-schema-by-status-code)
    - [6. `get_operation_examples` - Example payloads](#6-get_operation_examples---example-payloads)
    - [7. `get_auth_requirements` - Authentication details](#7-get_auth_requirements---authentication-details)
    - [8. `get_server_info` - API metadata and statistics](#8-get_server_info---api-metadata-and-statistics)
    - [9. `ping` - Server health check](#9-ping---server-health-check)
    - [Error Response Example](#error-response-example)
  - [Working with Multiple OpenAPI Specs](#working-with-multiple-openapi-specs)
  - [Environment Variables in MCP Configuration](#environment-variables-in-mcp-configuration)
  - [HTTP Mode for Development and Testing](#http-mode-for-development-and-testing)
  - [Development](#development)
  - [Environment Variables](#environment-variables)
  - [Contributing](#contributing)
  - [License](#license)

## Available Tools

1. 📜 `list_operations` - List all API endpoints with filtering
2. 🩻 `get_operation_details` - Get detailed information about specific endpoints
3. 📤 `get_request_schema` - Retrieve request body schemas
4. 📥 `get_response_schema` - Retrieve response schemas by status code
5. 🔍 `search_operations` - Search endpoints by keyword
6. 📝 `get_operation_examples` - Get example request/response payloads
7. 🔐 `get_auth_requirements` - Get authentication/security requirements
8. ℹ️ `get_server_info` - Get API server information and metadata
9. 🛜 `ping` - Ping the server to check if it is running (helps prevent LLMs from getting stuck)

## Features

- 🧠 Intelligently generated tool descriptions that include context about the loaded spec so your LLM knows what it's working with
- 📊 Clear error messages with actionable guidance to help your LLM use the tools correctly
- 🔍 Filter results by tag, method, or path pattern, making it super efficient for your LLM to find what it needs
- 🚀 Preprocesses and indexes OpenAPI spec into memory for ultra fast read access

## Supported File Formats

- OpenAPI 3.1 specifications
- File extensions: `.yaml`, `.yml`, `.json`

## Quick Start

### Docker Setup

Download and install Docker from [the Docker website](https://docs.docker.com/get-started/get-docker/). Make sure you start the docker engine before running the mcp server.

### MCP Client Configuration

Add to your MCP client configuration:

```json
{
  "openapi-context": { // Name it anything you want
    "command": "docker",
    "args": [
      "run",
      "--rm",
      "-i",
      "-v",
      "/path/to/your/openapi/spec:/app/spec:ro", // Path to your OpenAPI spec file + :/app/spec:ro (container path)
      "djankies/openapi-context:latest"
    ]
  }
}
```

For instance, if your spec is located at `~/specs/openapi.yaml`:

```json
{
  "my-api": {
    "command": "docker",
    "args": [
      "run",
      "--rm",
      "-i",
      "-v",
      "~/specs/openapi.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  }
}
```

> 🚨 **Important:** Make sure you change `/path/to/your/openapi/spec` to the path to your OpenAPI spec file.

## Tool Response Examples

Here are examples of what each MCP tool returns, including their parameters:

### 1. `list_operations` - List all endpoints

**Parameters:**

- `filter` (optional): Filter results by tag, HTTP method (GET, POST, etc.), or search term
  - Examples: `"user"`, `"POST"`, `"auth"`

**Example Call:** `list_operations` with `filter: "pet"`

**Response:**

```markdown
**Available API Operations** (3 found)
**API:** Petstore API v1.0.0

- **GET /pets**
  - ID: `listPets`
  - Summary: List all pets
  - Tags: pets
  - Content Types: None

- **POST /pets**
  - ID: `createPet`
  - Summary: Create a new pet
  - Tags: pets
  - Content Types: application/json

- **GET /pets/{id}**
  - ID: `getPetById`
  - Summary: Get pet by ID
  - Tags: pets
  - Content Types: None
```

### 2. `get_operation_details` - Detailed endpoint information

**Parameters:**

- `operation_id` (optional): Operation ID from the spec (e.g., 'getUser', 'createOrder')
- `method` (optional): HTTP method in UPPERCASE (GET, POST, PUT, DELETE, PATCH)  
- `path` (optional): API endpoint path exactly as shown in spec (e.g., '/users/{id}')

**Note:** Provide either `operation_id` OR both `method` and `path`

**Example Call:** `get_operation_details` with `operation_id: "createPet"`

**Response:**

```markdown
**Operation: POST /pets**

**Operation ID:** `createPet`
**Summary:** Create a new pet
**Description:** Creates a new pet in the store
**Tags:** pets
**Security Required:** Yes

**Request Body Schemas:**

Content-Type: `application/json`
\```json
{
  "type": "object",
  "required": ["name", "species"],
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100
    },
    "species": {
      "type": "string",
      "enum": ["dog", "cat", "bird", "fish"]
    },
    "age": {
      "type": "integer",
      "minimum": 0,
      "maximum": 30
    }
  }
}
\```

**Response Schemas:**

Status Code: `201`
Description: Pet created successfully
Content-Type: `application/json`
\```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer"
    },
    "name": {
      "type": "string"
    },
    "species": {
      "type": "string"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    }
  }
}
\```
```

### 3. `search_operations` - Find endpoints by keyword

**Parameters:**

- `query` (required): Search term to find in operation paths, summaries, or tags
  - Min length: 1, Max length: 200
  - Examples: `"authentication"`, `"user"`, `"payment"`

**Example Call:** `search_operations` with `query: "pet"`

**Response:**

```markdown
**Search Results** (3 found)
**API:** Petstore API v1.0.0
**Query:** "pet"

- **GET /pets**
  - ID: `listPets`
  - Summary: List all pets
  - Tags: pets

- **POST /pets**
  - ID: `createPet`
  - Summary: Create a new pet
  - Tags: pets

- **GET /pets/{id}**
  - ID: `getPetById`
  - Summary: Get pet by ID
  - Tags: pets
```

### 4. `get_request_schema` - Request body schema

**Parameters:**

- `operation_id` (optional): Unique operation identifier
- `method` (optional): HTTP method
- `path` (optional): API path
- `content_type` (optional): Specific content type to return

**Note:** Provide either `operation_id` OR both `method` and `path`

**Example Call:** `get_request_schema` with `operation_id: "createPet"`

**Response:**

```markdown
**Request Schema for POST /pets**

Content-Type: `application/json`
\```json
{
  "type": "object",
  "required": ["name", "species"],
  "properties": {
    "name": {
      "type": "string",
      "maxLength": 100
    },
    "species": {
      "type": "string", 
      "enum": ["dog", "cat", "bird", "fish"]
    }
  }
}
\```
```

### 5. `get_response_schema` - Response schema by status code

**Parameters:**

- `operation_id` (optional): Unique operation identifier
- `method` (optional): HTTP method
- `path` (optional): API path
- `status_code` (optional): Specific status code to return

**Note:** Provide either `operation_id` OR both `method` and `path`

**Example Call:** `get_response_schema` with `operation_id: "getPetById"`

**Response:**

```markdown
**Response Schema for GET /pets/{id}**

Status Code: `200`
Description: Pet found
Content-Type: `application/json`
\```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer"
    },
    "name": {
      "type": "string"
    },
    "species": {
      "type": "string"
    },
    "age": {
      "type": "integer"
    }
  }
}
\```

Status Code: `404`
Description: Pet not found
Content-Type: `application/json`
\```json
{
  "type": "object",
  "properties": {
    "error": {
      "type": "string"
    },
    "code": {
      "type": "integer"
    }
  }
}
\```
```

### 6. `get_operation_examples` - Example payloads

**Parameters:**

- `operation_id` (optional): Unique operation identifier
- `method` (optional): HTTP method
- `path` (optional): API path

**Note:** Provide either `operation_id` OR both `method` and `path`

**Example Call:** `get_operation_examples` with `operation_id: "createPet"`

**Response:**

```markdown
**Examples for POST /pets**

**Request Examples:**

Content-Type: `application/json`
Example: `dog_example`
\```json
{
  "name": "Buddy",
  "species": "dog",
  "age": 3
}
\```

Example: `cat_example`  
\```json
{
  "name": "Whiskers",
  "species": "cat",
  "age": 2
}
\```

**Response Examples:**

Status: `201`, Content-Type: `application/json`
Example: `created_pet`
\```json
{
  "id": 123,
  "name": "Buddy", 
  "species": "dog",
  "age": 3,
  "createdAt": "2024-01-15T10:30:00Z"
}
\```
```

### 7. `get_auth_requirements` - Authentication details

**Parameters:**

- `operation_id` (optional): Optional operation ID for specific auth requirements

**Example Call:** `get_auth_requirements` (no parameters for global requirements)

**Response:**

```markdown
**Authentication Requirements**

**API:** Petstore API v1.0.0

**Global Security Requirements:**
- Scheme: `bearerAuth`
  - Scopes: read:pets, write:pets

**Available Security Schemes:**
- **bearerAuth**: http
  - Description: JWT Bearer token authentication
- **apiKey**: apiKey  
  - Description: API key in header
```

### 8. `get_server_info` - API metadata and statistics

**Parameters:**

- None (no parameters required)

**Example Call:** `get_server_info`

**Response:**

```markdown
**API Server Information**

**API:** Petstore API v1.0.0
**Description:** A sample API that demonstrates OpenAPI features
**Loaded:** 2024-01-15T10:29:45.123Z
**Path:** /app/spec

**Servers:**
- **URL:** https://petstore.example.com/api/v1
  - Description: Production server
- **URL:** https://staging.petstore.example.com/api/v1  
  - Description: Staging server

**Statistics:**
- Operations: 15
- Schemas: 8
- Tags: 3
- Paths: 6
```

### 9. `ping` - Server health check

**Parameters:**

- None (no parameters required)

**Example Call:** `ping`

**Response:**

```markdown
**Server Status**

Status: Ready
OpenAPI Spec: Loaded (Petstore API v1.0.0)  
Uptime: 45.123 seconds
Ready to process queries.
```

### Error Response Example

When no OpenAPI spec is loaded, all tools return:

```markdown
**No OpenAPI Spec Available**

No OpenAPI specification has been loaded. To fix this:

1. Mount your OpenAPI file to `/app/spec` in the container
2. Restart the MCP server
3. The spec will auto-load when the server starts

💡 Make sure your Docker volume mount is configured: `-v "/path/to/your/openapi.yaml:/app/spec:ro"`
```

## Working with Multiple OpenAPI Specs

The server is designed to load **one OpenAPI specification at a time** for optimal performance and clarity. However, you can run separate server instances for each API, giving each a unique name in your MCP configuration:

```json
{
  "mcpServers": {
    "openapi-users": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/users-api.yaml:/app/spec:ro",
        "djankies/openapi-context:latest"
      ]
    },
    "openapi-orders": {
      "command": "docker", 
      "args": [
        "run", "--rm", "-i",
        "-v", "/path/to/orders-api.yaml:/app/spec:ro",
        "djankies/openapi-context:latest"
      ]
    },
    "openapi-payments": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", 
        "-v", "/path/to/payments-api.yaml:/app/spec:ro",
        "djankies/openapi-context:latest"
      ]
    }
  }
}
```

**It's better this way:**

- Each API gets dedicated tool descriptions (e.g., "List endpoints from Users API v2.1.0")
- No confusion between APIs - tools are clearly scoped
- Independent scaling and resource allocation
- Better error isolation

## Environment Variables in MCP Configuration

- `LOG_LEVEL`: Set logging verbosity (`error`, `warn`, `info`, `debug`) - default: `info`
- `MAX_SPEC_SIZE`: Maximum OpenAPI spec file size in MB - default: `10`
- `MCP_MODE`: Server mode (`stdio` for MCP, `http` for HTTP server) - default: `stdio`
- `PORT`: HTTP server port (only used when `MCP_MODE=http`) - default: `3000`
- `HOST`: HTTP server host (only used when `MCP_MODE=http`) - default: `0.0.0.0`

You can pass environment variables to configure the server behavior:

```json
{
  "openapi-context": {
    "command": "docker",
    "args": [
      "run",
      "--rm",
      "-i",
      "-e", "LOG_LEVEL=debug", // Set logging verbosity
      "-e", "MAX_SPEC_SIZE=20", // 20MB max spec size
      "-v",
      "/path/to/your/openapi.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  }
}
```

## HTTP Mode for Development and Testing

The server can run in HTTP mode for development, testing, and debugging purposes. In HTTP mode, the server runs both the MCP stdio transport AND an HTTP server with REST endpoints.

**Use Cases for HTTP Mode:**

- **Development & Debugging**: Inspect server status and loaded OpenAPI spec via web browser
- **Health Monitoring**: Check if the server is running and has successfully loaded your spec
- **Integration Testing**: Test the server independently before integrating with MCP clients
- **Troubleshooting**: Verify the server can parse your OpenAPI spec correctly

**Setting up HTTP Mode:**

```bash
# Using Docker with HTTP mode
docker run --rm -p 3000:3000 \
  -e MCP_MODE=http \
  -e PORT=3000 \
  -v "/path/to/your/openapi.yaml:/app/spec:ro" \
  djankies/openapi-context:latest
```

**Available HTTP Endpoints:**

- `GET /` - Server information and available MCP tools
- `GET /health` - Health check with loaded spec details

**Example Health Check Response:**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z", 
  "version": "1.0.0",
  "schemaLoaded": true,
  "loadedSchema": {
    "title": "Petstore API",
    "version": "1.0.0",
    "loadedAt": "2024-01-15T10:29:45.123Z"
  },
  "mcp": "ready",
  "uptime": 45.123
}
```

**Important Notes:**

- HTTP mode runs BOTH HTTP server AND MCP stdio transport
- The MCP tools are still available via stdio for MCP clients
- HTTP endpoints are for monitoring/debugging only - they don't expose the MCP tool functionality
- Use HTTP mode only for development; production MCP usage should use default stdio mode

---

## Development

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type checking
npm run type-check

# Development mode with watch
npm run dev
```

## Environment Variables

- `MCP_MODE`: Set to "http" for HTTP mode, "stdio" for MCP mode (default: "stdio")
- `PORT`: HTTP server port (default: 3000)
- `HOST`: HTTP server host (default: "0.0.0.0")
- `LOG_LEVEL`: Logging level (default: "info")
- `MAX_SPEC_SIZE`: Maximum spec size in MB (default: 10)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run the test suite
6. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.
