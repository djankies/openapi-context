# OpenAPI Context MCP Server

**Stop drowning your LLM in API documentation.** This MCP server gives LLMs intelligent, progressive access to OpenAPI specs without overwhelming their context windows.

## 🚀 Quick Start

```json
{
  "openapi-context": { // name it whatever you want
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-v", "/path/to/your/openapi.yaml:/app/spec:ro", // filepath + :/app/spec:ro
      "djankies/openapi-context:latest"
    ]
  }
}
```

That's it. Your LLM now has API hotwheels.

## 🎯 Why This Exists

I wanted to create a tool that was more effective at helping LLMs efficiently navigate and retrieve laser-scoped information from OpenAPI specs without overwhelming their context windows. LLMs start with high-level overviews, then drill down only into what they need, being naturally guided by the tools the whole way.

### The Problem

- 📄 Full OpenAPI specs can be 1000s of lines
- 🤯 LLMs get overwhelmed with unnecessary details
- 💸 Wastes context tokens on irrelevant information
- 🔄 LLMs don't know how to use openapi tools correctly

### The Solution

- 🔍 **Progressive exploration** that guides LLMs naturally
- 🧠 **Built-in intelligence** that helps LLMs make correct tool choices
- 📦 **Automatic simplification** without losing essential information
- 🎯 **Error messages that guide** LLMs to the right next step

## ✨ Key Features for LLM Success

### 🧠 Intelligent LLM Guidance

#### Self-Documenting Tools

Every tool description is dynamically generated to include context about the loaded API:

```plaintext
list_operations: "List all endpoints from Petstore API v1.0.0"
get_operation_details: "Get details for operations in Petstore API v1.0.0"
```

LLMs always know which API they're working with and what tools are relevant.

#### Error Messages That Guide

Every error includes the exact next step:

```markdown
**Operation Not Found**

Operation not found: createUser

💡 Use `list_operations()` to see available operations or call `help()` for usage guidance.
```

LLMs never get stuck - they always know how to recover.

#### Progressive Discovery Flow

The tool design naturally guides LLMs through efficient exploration:

1. `list_tags` → See API structure
2. `get_operation_summary` → Quick overview without schemas  
3. `get_request_schema` → Details only when needed

### 📊 Context-Efficient Design

#### Automatic Schema Simplification

- Collapses duplicate examples
- Simplifies UUID patterns: `[0-9a-f]{8}-[0-9a-f]{4}-...` → `uuid`
- Flattens complex `allOf` structures
- Removes redundant descriptions

#### Flexible Output Control

```typescript
// LLM can request minimal info
get_operation_details({ operation_id: "createUser", detail_level: "minimal" })

// Or specific fields only
get_operation_details({ operation_id: "createUser", fields: ["parameters"] })

// Or compact schemas
get_request_schema({ operation_id: "createUser", compact: true })
// Returns: "Type: object { name: string, email: string (email) }"
```

### 🔄 Never Get Stuck

#### Pagination with Clear Navigation

Large schemas include navigation hints:

```plaintext
Page 1 of 3 (showing 0-2000 of 5432 chars)
Use index=2000 to continue reading.
```

#### Helpful Parameter Validation

```markdown
**Missing Parameters**

Please provide either `operation_id` or both `method` and `path`.

💡 Need help with tool usage? Call the `help` tool for detailed parameter guidance.
```

#### Built-in Health Check

The `ping` helps the llm verify the server is actually responsive when receiving errors. This prevents extraneous calls to the tool.

```markdown
**Server Status**

Status: Ready
OpenAPI Spec: Loaded (Petstore API v1.0.0)
Ready to process queries.
```

## 🛠 Available Tools

### Discovery Tools (LLMs Start Here)

- 🏷️ **`list_tags`** - See API categories with operation counts
- 📜 **`list_operations`** - List endpoints with filtering and compact mode
- 🔍 **`search_operations`** - Find endpoints by keyword
- 📋 **`get_operation_summary`** - Quick overview without full schemas

### Detail Tools (Use When Needed)

- 🩻 **`get_operation_details`** - Full endpoint info with customizable detail levels
- 📤 **`get_request_schema`** - Request schemas with pagination and compact mode
- 📥 **`get_response_schema`** - Response schemas by status code
- 📝 **`get_operation_examples`** - Example payloads when available
- 🔐 **`get_auth_requirements`** - Authentication details with examples
- ℹ️ **`get_server_info`** - API metadata and statistics

### Utility Tools

- 🛜 **`ping`** - Check server responsiveness
- ❓ **`help`** - Comprehensive guidance with current context

## 📖 How LLMs Navigate Efficiently

### Natural Discovery Pattern

```typescript
// 1. Understand API structure (3 lines)
list_tags()
// → "Users (12 operations), Orders (8 operations), Auth (3 operations)"

// 2. Find relevant operations (10 lines)
list_operations({ filter: "Users", compact: true })
// → "GET /users - List users\nPOST /users - Create user..."

// 3. Get overview before diving deep (5 lines)
get_operation_summary({ operation_id: "createUser" })
// → "POST /users\nParameters: body: required\nRequired: name, email\nAuth: api_key"

// 4. Get details only when needed (1 line with compact mode)
get_request_schema({ operation_id: "createUser", compact: true })
// → "Type: object { name: string, email: string (email), age?: number }"
```

### Adaptive Detail Levels

The server provides three detail levels that LLMs can choose based on their needs:

- **`minimal`**: Just operation signatures and required fields
- **`standard`**: Simplified schemas without patterns (default)
- **`full`**: Complete details including patterns and examples

### Automatic Pagination Handling

When schemas are large, LLMs receive clear continuation instructions:

```plaintext
Page 1 of 3 (showing 0-2000 of 5432 chars)
...content...
Use index=2000 to continue reading.
```

## 🐳 Docker Configuration

### Basic Setup

```json
{
  "openapi-context": {
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-v", "/path/to/your/spec.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  }
}
```

### Multiple APIs

Each API gets its own instance with dedicated tool contexts:

```json
{
  "users-api": {
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-v", "/path/to/users-api.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  },
  "orders-api": {
    "command": "docker",
    "args": [
      "run", "--rm", "-i",
      "-v", "/path/to/orders-api.yaml:/app/spec:ro",
      "djankies/openapi-context:latest"
    ]
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Logging verbosity (`error`, `warn`, `info`, `debug`) | `info` |
| `MAX_SPEC_SIZE` | Maximum OpenAPI spec file size in MB | `10` |
| `MCP_MODE` | Server mode (`stdio` for MCP, `http` for debugging) | `stdio` |

## 🧪 HTTP Mode (Development & Debugging)

Test the server independently:

```bash
docker run --rm -p 3000:3000 \
  -e MCP_MODE=http \
  -v "/path/to/spec.yaml:/app/spec:ro" \
  djankies/openapi-context:latest
```

Access health check at `http://localhost:3000/health`

## 🏗 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Development mode
npm run dev

# Full CI pipeline
npm run ci
```

## 📋 Supported Formats

- OpenAPI 3.1 specifications
- File extensions: `.yaml`, `.yml`, `.json`
- Auto-detects format from content

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.
