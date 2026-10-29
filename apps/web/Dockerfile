FROM node:26.3.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
ARG VITE_API_URL=/api
ARG VITE_LAB_API_URL=/lab-api
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LAB_API_URL=$VITE_LAB_API_URL
RUN pnpm --filter @system-design/web build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
