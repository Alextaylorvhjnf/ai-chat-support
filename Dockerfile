# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies for build
RUN apk add --no-cache python3 make g++

# Copy package files
COPY backend/package*.json ./backend/

# Install backend dependencies
RUN cd backend && npm install --production

# Copy backend source code
COPY backend/src ./backend/src
COPY backend/.env.example ./backend/.env

# Copy frontend files
COPY frontend ./frontend

# Create public directory for static files
RUN mkdir -p ./backend/public
COPY frontend/widget ./backend/public/widget

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S chatbot -u 1001

# Change ownership
RUN chown -R chatbot:nodejs /app

# Switch to non-root user
USER chatbot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); const req = http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); }); req.on('error', () => process.exit(1));"

# Start command
CMD ["node", "backend/src/server.js"]
