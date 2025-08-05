# Use Node.js 22 LTS for better performance and latest features
FROM node:22-alpine

# Install system dependencies for image processing and audio/video handling
RUN apk add --no-cache \
    ffmpeg \
    tesseract-ocr \
    imagemagick \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies (production only for smaller image)
RUN npm ci --only=production && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S miimii -u 1001 -G nodejs

# Copy application code
COPY --chown=miimii:nodejs . .

# Create required directories with proper permissions
RUN mkdir -p uploads/temp logs admin && \
    chown -R miimii:nodejs uploads logs admin && \
    chown -R miimii:nodejs /usr/src/app

# Switch to non-root user
USER miimii

# Expose port for Digital Ocean App Platform
EXPOSE 3000

# Health check optimized for Digital Ocean App Platform with longer startup time
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD node -e "require('http').get({hostname:'localhost',port:3000,path:'/healthz',timeout:12000}, (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]