# Multi-stage Dockerfile for GridPilot Backend (Node.js + Express + TypeScript)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package definition and configs
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and shared definitions
COPY src/ ./src/
COPY ../shared/ ./shared/

# Build TypeScript to dist
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Expose API and WebSocket port
EXPOSE 5000

# Start server
CMD ["node", "dist/index.js"]
