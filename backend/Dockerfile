# ── Ellis Backend — Cloud Run Dockerfile ─────────────────────────────────────
# Builds a lightweight Node.js container for deployment on Google Cloud Run.
# Cloud Run sets PORT automatically — our server reads process.env.PORT.

# Use the official Node.js 20 Alpine image (small, fast, secure)
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (Docker layer caching — only reinstalls
# dependencies when package.json actually changes)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy the rest of the source code
COPY . .

# Cloud Run injects PORT as an environment variable (usually 8080).
# Our server already reads process.env.PORT with a fallback to 3001.
EXPOSE 8080

# Start the server
CMD ["node", "src/server.js"]
