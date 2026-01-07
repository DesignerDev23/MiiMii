# Use Node.js 20 LTS (required for @supabase/supabase-js)
FROM node:20-slim

# Install system dependencies for canvas and other packages
RUN apt-get update && apt-get install -y \
    pkg-config \
    libpixman-1-dev \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpng-dev \
    libfreetype6-dev \
    libfontconfig1-dev \
    ffmpeg \
    tesseract-ocr \
    imagemagick \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies (production only for smaller image)
RUN npm ci --omit=dev && npm cache clean --force

# Create non-root user
RUN groupadd -r miimii && useradd -r -g miimii miimii

# Copy application code
COPY --chown=miimii:miimii . .

# Create required directories with proper permissions
RUN mkdir -p uploads/temp logs admin && \
    chown -R miimii:miimii uploads logs admin && \
    chown -R miimii:miimii /usr/src/app

# Switch to non-root user
USER miimii

# Expose port for Digital Ocean App Platform
EXPOSE 3000

# Health check optimized for Digital Ocean App Platform with longer startup time
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD node -e "require('http').get({hostname:'localhost',port:3000,path:'/healthz',timeout:12000}, (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"]