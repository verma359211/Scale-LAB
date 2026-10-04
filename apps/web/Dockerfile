FROM node:26.3.0-alpine AS build

WORKDIR /workspace
RUN npm install --global pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
ARG VITE_API_URL=http://localhost:3001/api
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @system-design/web build


FROM busybox:1.36.1

COPY --from=build /workspace/apps/web/dist /www

EXPOSE 80
CMD ["httpd", "-f", "-p", "80", "-h", "/www"]
