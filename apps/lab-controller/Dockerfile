FROM node:26.3.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/lab-controller/package.json apps/lab-controller/package.json
RUN pnpm install --frozen-lockfile

COPY apps/lab-controller apps/lab-controller
RUN pnpm --filter @system-design/lab-controller build
RUN pnpm deploy --legacy --filter @system-design/lab-controller --prod /app

FROM node:26.3.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
COPY --from=build /workspace/apps/lab-controller/dist ./dist
EXPOSE 4000
CMD ["node", "dist/server.js"]
