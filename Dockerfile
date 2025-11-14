# Use official Bun image as base
FROM oven/bun:1.3.1-alpine AS base

# Install FFmpeg and font utilities
RUN apk add --no-cache \
    ffmpeg \
    fontconfig \
    font-noto \
    ttf-dejavu \
    && fc-cache -f

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy font files
COPY font ./font

# Install Resolve-Bold font
RUN mkdir -p /usr/share/fonts/truetype/resolve && \
    cp font/Resolve-Bold.otf /usr/share/fonts/truetype/resolve/ && \
    fc-cache -f -v && \
    fc-list | grep -i resolve

# Copy source code
COPY . .

# Create tmp directories
RUN mkdir -p tmp/audio tmp/images tmp/video && \
    chmod -R 777 tmp

# Expose port (if needed for health checks)
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Run the bot
CMD ["bun", "run", "index.ts"]

