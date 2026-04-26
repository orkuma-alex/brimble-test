FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    docker.io \
    git \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install Railpack (arch-agnostic via official install script)
ARG RAILPACK_VERSION=0.23.0
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
      RAILPACK_ARCH="arm64"; \
    else \
      RAILPACK_ARCH="x86_64"; \
    fi && \
    curl -fsSL \
      "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-${RAILPACK_ARCH}-unknown-linux-musl.tar.gz" \
      | tar -xz -C /usr/local/bin \
    && chmod +x /usr/local/bin/railpack

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Pre-create data and temp directories
RUN mkdir -p /data/db /data/uploads /data/cache /tmp/brimble

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
