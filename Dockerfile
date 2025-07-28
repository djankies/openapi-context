# Multi-stage Docker build for OpenAPI Context MCP Server
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
# Copy source files and configuration needed for build
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:18-alpine AS production
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S mcp -u 1001

# Copy built application
COPY --from=builder /app/node_modules ./node_modules
COPY --from=development /app/dist ./dist
COPY package*.json ./

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