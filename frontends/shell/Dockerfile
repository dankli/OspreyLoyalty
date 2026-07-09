FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Remote URLs are baked into the bundle at build time (see vite.config.ts).
# The defaults point at localhost:5173/5174, which is correct for the demo
# compose setup because the browser (not this container) fetches the remotes.
# Auth/OIDC is baked here too; the shell logs in once and shares the token with both remotes.
# Defaults keep the standard image unauthenticated (compose/tests unchanged).
ARG VITE_AUTH_ENABLED=false
ARG VITE_OIDC_ISSUER=http://localhost:9000
ARG VITE_OIDC_CLIENT_ID=admin-portal
ARG VITE_OIDC_REDIRECT_URI=http://localhost:5170/callback
# Module-federation remote URLs (vite.config.ts reads these). Default to the compose localhost ports;
# ingress mode overrides them with the member./admin. hostnames so the browser fetches the remotes there.
ARG MEMBER_PORTAL_URL=http://localhost:5173/assets/remoteEntry.js
ARG ADMIN_PORTAL_URL=http://localhost:5174/assets/remoteEntry.js
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED \
    VITE_OIDC_ISSUER=$VITE_OIDC_ISSUER \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI \
    MEMBER_PORTAL_URL=$MEMBER_PORTAL_URL \
    ADMIN_PORTAL_URL=$ADMIN_PORTAL_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
