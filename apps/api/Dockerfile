FROM node:26.3.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@10.15.1

# Copy dependency manifests before source so dependency installation remains
# cached when only application code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
RUN pnpm --filter @system-design/api build


FROM node:26.3.0-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @system-design/api...

COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY apps/api/db apps/api/db

WORKDIR /workspace/apps/api
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
