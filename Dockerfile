# Multi-stage Docker build for OpenAPI Context MCP Server
FROM node:22-alpine AS builder

# Update npm to fix security vulnerabilities
RUN npm install -g npm@latest

# Add metadata labels
LABEL org.opencontainers.image.title="OpenAPI Context MCP Server"
LABEL org.opencontainers.image.description="MCP server for querying OpenAPI 3.1 specifications with 13 tools for endpoint discovery, schema retrieval, header inspection, and API exploration"
LABEL org.opencontainers.image.url="https://hub.docker.com/r/djankies/openapi-context"
LABEL org.opencontainers.image.source="https://github.com/djankies/openapi-context"
LABEL org.opencontainers.image.documentation="https://github.com/djankies/openapi-context/blob/main/README.md"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Daniel Jankowski"
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:22-alpine AS development

# Update npm to fix security vulnerabilities
RUN npm install -g npm@latest

WORKDIR /app
COPY package*.json ./
RUN npm ci
# Copy source files and configuration needed for build
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:22-alpine AS production

# Update npm to fix security vulnerabilities (though not used in production)
RUN npm install -g npm@latest

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001

# Copy built application
COPY --from=development /app/dist ./dist
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Set proper permissions for app directory
RUN chown -R mcp:nodejs /app

# Copy entrypoint script
COPY --chown=mcp:nodejs docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

USER mcp

# Environment variables with defaults
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    PORT=3000 \
    MCP_MODE=stdio

# Expose port for HTTP mode
EXPOSE 3000

# Health check only applies in HTTP mode
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD if [ "$MCP_MODE" = "http" ]; then curl -f http://localhost:3000/health || exit 1; else exit 0; fi

# Use entrypoint script to handle different modes
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD []