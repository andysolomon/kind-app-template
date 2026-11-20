# syntax=docker/dockerfile:1

# Build the server with pnpm, then run the emitted JavaScript as PID 1.
# `node` is exec'd directly so SIGTERM reaches the process and the HTTP
# server can drain. The runtime image has no package manager and no root user.

FROM node:24-alpine AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/server/package.json apps/server/tsconfig.json apps/server/tsconfig.build.json apps/server/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @kind-app/server...

COPY apps/server apps/server
RUN pnpm --filter @kind-app/server build

FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/server/dist ./dist
COPY --from=build --chown=node:node /repo/apps/server/package.json ./package.json
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
