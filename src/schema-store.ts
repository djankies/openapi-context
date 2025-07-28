import { parseOpenAPISpec, extractOperations, ParsedOperation } from "./openapi-parser.js";

export interface LoadedSchema {
  api: any; // Parsed OpenAPI spec
  metadata: {
    title: string;
    version: string;
    description?: string;
    path: string;
    loadedAt: Date;
  };
  operations: ParsedOperation[];
  schemas: Map<string, any>;
  examples: Map<string, any>;
  servers: any[];
  security: any[];
}

export interface LoadingResult {
  operationCount: number;
  requestSchemaCount: number;
  responseSchemaCount: number;
  exampleCount: number;
  schemaCount: number;
}

/**
 * In-memory store for OpenAPI schema data
 * Replaces the database approach with fast memory access
 */
class SchemaStore {
  private currentSchema: LoadedSchema | null = null;

  /**
   * Load an OpenAPI specification from file into memory
   */
  async loadSchema(specPath: string): Promise<LoadingResult> {
    console.log(`Loading OpenAPI spec into memory: ${specPath}`);

    // Parse the OpenAPI specification
    const api = await parseOpenAPISpec(specPath);

    // Extract metadata
    const title = api.info?.title || "Untitled API";
    const version = api.info?.version || "1.0.0";
    const description = api.info?.description;
    const servers = api.servers || [];
    const security = api.security || [];

    // Extract operations
    const operations = extractOperations(api);
    console.log(`Extracted ${operations.length} operations from ${title} v${version}`);

    // Extract schemas
    const schemas = new Map<string, any>();
    if (api.components?.schemas) {
      for (const [name, schema] of Object.entries(api.components.schemas)) {
        schemas.set(name, schema);
      }
    }

    // Extract examples from operations
    const examples = new Map<string, any>();
    let exampleCount = 0;

    operations.forEach((operation) => {
      // Request examples
      if (operation.requestBody?.content) {
        Object.entries(operation.requestBody.content).forEach(([contentType, content]: [string, any]) => {
          if (content.examples) {
            Object.entries(content.examples).forEach(([exampleName, example]: [string, any]) => {
              const key = `${operation.operationId || `${operation.method}-${operation.path}`}-request-${contentType}-${exampleName}`;
              examples.set(key, example);
              exampleCount++;
            });
          }
        });
      }

      // Response examples
      Object.entries(operation.responses).forEach(([statusCode, response]: [string, any]) => {
        if (response.content) {
          Object.entries(response.content).forEach(([contentType, content]: [string, any]) => {
            if (content.examples) {
              Object.entries(content.examples).forEach(([exampleName, example]: [string, any]) => {
                const key = `${operation.operationId || `${operation.method}-${operation.path}`}-response-${statusCode}-${contentType}-${exampleName}`;
                examples.set(key, example);
                exampleCount++;
              });
            }
          });
        }
      });
    });

    // Count schemas for statistics
    let requestSchemaCount = 0;
    let responseSchemaCount = 0;

    operations.forEach((operation) => {
      if (operation.requestBody?.content) {
        requestSchemaCount += Object.keys(operation.requestBody.content).length;
      }
      responseSchemaCount += Object.keys(operation.responses).length;
    });

    // Store the loaded schema
    this.currentSchema = {
      api,
      metadata: {
        title,
        version,
        description,
        path: specPath,
        loadedAt: new Date(),
      },
      operations,
      schemas,
      examples,
      servers,
      security,
    };

    console.log(`Schema loaded successfully: ${operations.length} operations, ${schemas.size} schemas, ${exampleCount} examples`);

    return {
      operationCount: operations.length,
      requestSchemaCount,
      responseSchemaCount,
      exampleCount,
      schemaCount: schemas.size,
    };
  }

  /**
   * Get the currently loaded schema
   */
  getCurrentSchema(): LoadedSchema | null {
    return this.currentSchema;
  }

  /**
   * Clear the currently loaded schema
   */
  clearSchema(): void {
    this.currentSchema = null;
    console.log("Schema cleared from memory");
  }

  /**
   * Check if a schema is currently loaded
   */
  hasSchema(): boolean {
    return this.currentSchema !== null;
  }

  /**
   * Get schema metadata
   */
  getMetadata(): LoadedSchema["metadata"] | null {
    return this.currentSchema?.metadata || null;
  }

  /**
   * Get all operations
   */
  getOperations(): ParsedOperation[] {
    return this.currentSchema?.operations || [];
  }

  /**
   * Find operations by filter (method, path, summary, tags)
   */
  findOperations(filter?: string): ParsedOperation[] {
    if (!this.currentSchema) return [];

    if (!filter) return this.currentSchema.operations;

    const filterLower = filter.toLowerCase();
    return this.currentSchema.operations.filter((op) => {
      return (
        op.method.toLowerCase().includes(filterLower) ||
        op.path.toLowerCase().includes(filterLower) ||
        (op.summary && op.summary.toLowerCase().includes(filterLower)) ||
        op.tags.some((tag) => tag.toLowerCase().includes(filterLower))
      );
    });
  }

  /**
   * Find operation by ID, method+path, or other criteria
   */
  findOperation(criteria: { operationId?: string; method?: string; path?: string }): ParsedOperation | null {
    if (!this.currentSchema) return null;

    return (
      this.currentSchema.operations.find((op) => {
        if (criteria.operationId && op.operationId === criteria.operationId) return true;
        if (criteria.method && criteria.path && op.method === criteria.method && op.path === criteria.path) return true;
        return false;
      }) || null
    );
  }

  /**
   * Get schema by name
   */
  getSchema(schemaName: string): any | null {
    return this.currentSchema?.schemas.get(schemaName) || null;
  }

  /**
   * Get all schema names
   */
  getSchemaNames(): string[] {
    return this.currentSchema ? Array.from(this.currentSchema.schemas.keys()) : [];
  }

  /**
   * Get examples for an operation
   */
  getExamplesForOperation(operationId: string): Map<string, any> {
    if (!this.currentSchema) return new Map();

    const examples = new Map<string, any>();
    for (const [key, example] of this.currentSchema.examples.entries()) {
      if (key.startsWith(operationId)) {
        examples.set(key, example);
      }
    }
    return examples;
  }

  /**
   * Get server information
   */
  getServers(): any[] {
    return this.currentSchema?.servers || [];
  }

  /**
   * Get security requirements
   */
  getSecurity(): any[] {
    return this.currentSchema?.security || [];
  }
}

// Export singleton instance
export const schemaStore = new SchemaStore();
