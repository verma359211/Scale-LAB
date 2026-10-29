FROM node:26.3.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/loadgen-controller/package.json apps/loadgen-controller/package.json
RUN pnpm install --frozen-lockfile

COPY apps/loadgen-controller apps/loadgen-controller
RUN pnpm --filter @system-design/loadgen-controller build
RUN pnpm deploy --legacy --filter @system-design/loadgen-controller --prod /app

FROM node:26.3.0-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
COPY --from=build /workspace/apps/loadgen-controller/dist ./dist
EXPOSE 4100
CMD ["node", "dist/server.js"]
