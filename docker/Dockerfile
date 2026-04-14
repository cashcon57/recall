FROM node:20-slim

WORKDIR /app

# Copy shared source (adapter interface + tools logic)
COPY src/ ./src/
COPY package.json tsconfig.json ./

# Copy docker-specific source
COPY docker/ ./docker/

# Install deps and build
RUN cd docker && npm ci && npm run build

ENV HF_HOME=/app/.cache/huggingface
RUN mkdir -p /app/.cache/huggingface

EXPOSE 8788
CMD ["node", "docker/dist/docker/src/server.js"]
