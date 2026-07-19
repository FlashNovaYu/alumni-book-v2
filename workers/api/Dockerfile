FROM node:22-bookworm-slim

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY workers/api/package.json workers/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY workers/api workers/api
COPY packages/shared packages/shared

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["pnpm", "--filter", "worker", "dev:node"]
