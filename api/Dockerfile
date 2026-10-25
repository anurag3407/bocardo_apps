# syntax=docker/dockerfile:1.7
# ── build ──────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# the store lives in a BuildKit cache mount, so rebuilds on the VPS skip the download
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# ── run ────────────────────────────────────────────────
FROM node:22-alpine
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="bocardo-api" \
      org.opencontainers.image.revision="$GIT_SHA"
WORKDIR /app
ENV NODE_ENV=production \
    GIT_SHA=$GIT_SHA
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
