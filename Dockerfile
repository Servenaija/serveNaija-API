# Use Node.js base image
FROM node:20

# Install build dependencies for sharp
RUN apt-get update && apt-get install -y \
    build-essential \
    libvips-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Force sharp to compile from source for QEMU compatibility
ENV npm_config_build_from_source=true

# Install dependencies
RUN npm install

# Copy the rest of your backend source code
COPY . .

# Expose backend port
EXPOSE 7227

# Start the backend
CMD ["bash", "-c", "cd /app && npm run start"]