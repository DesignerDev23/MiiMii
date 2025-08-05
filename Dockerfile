# Use Node.js 18 LTS
FROM node:18-alpine

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

# Copy package files
COPY package*.json ./

# Install dependencies using npm ci for cleaner builds
RUN npm ci --only=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S miimii -u 1001

# Copy application code
COPY --chown=miimii:nodejs . .

# Create required directories
RUN mkdir -p uploads/temp logs admin \
    && chown -R miimii:nodejs uploads logs admin

# Switch to non-root user
USER miimii

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]