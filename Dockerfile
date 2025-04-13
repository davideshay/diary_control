# Stage 1: Build Stage
FROM node:23-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Stage 2: Production Stage
FROM node:23-alpine AS production
LABEL org.opencontainers.image.source="https://github.com/davideshay/diary_control"

# Set working directory
WORKDIR /app

# Copy built files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/index.js"]