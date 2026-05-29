# syntax=docker/dockerfile:1.6
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY . .

FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 50051
USER nonroot
ENTRYPOINT ["/nodejs/bin/node", "server.js"]
