# Frontend production image — Vite build served as static files via nginx.
# Build context is expected to be the frontend/ directory:
#   docker build -f docker/frontend.Dockerfile -t chain-of-truth-frontend ./frontend
FROM node:20-slim AS build

WORKDIR /app

# package-lock.json is copied too so `npm ci` can give a reproducible install —
# `npm install` alone silently resolves new minor/patch versions at build time.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked in at BUILD time, not run time: Vite inlines import.meta.env values
# into the bundle, so these cannot be changed by setting env vars on the
# running container. They must be ARGs, declared here and promoted to ENV so
# the `npm run build` below actually sees them — without these two lines the
# build args passed by docker-compose.prod.yml were silently ignored and the
# bundle fell back to the hardcoded localhost defaults in src/lib/apiClient.ts.
#
# Change these to the public URL of the backend for any deployment that is not
# reached over localhost.
ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ARG VITE_WS_BASE_URL=ws://localhost:8000/api/v1/ws
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WS_BASE_URL=$VITE_WS_BASE_URL

RUN npm run build

FROM nginx:alpine AS serve

COPY --from=build /app/dist /usr/share/nginx/html

# Client-side routing (React Router) needs every unmatched path to fall
# back to index.html, or a hard refresh on e.g. /timeline returns nginx's 404.
RUN printf 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  location / { try_files $uri /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
