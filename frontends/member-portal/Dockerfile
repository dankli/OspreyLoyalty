FROM node:22-alpine AS build
WORKDIR /app
# .npmrc (legacy-peer-deps) MUST be present before npm ci — react-i18next's peerOptional
# typescript@^5 clashes with this repo's TS 6 and would otherwise ERESOLVE-fail the build.
COPY package*.json .npmrc ./
RUN npm ci
COPY . .
# Auth/OIDC + gateway URL are baked at build time (Vite reads VITE_* from the env). Defaults keep the
# standard image unauthenticated — so compose and tests are unchanged. A deploy that wants browser
# login passes e.g. --build-arg VITE_AUTH_ENABLED=true (see ADR-0007 / infra/k8s/README.md).
ARG VITE_AUTH_ENABLED=false
ARG VITE_OIDC_ISSUER=http://localhost:9000
ARG VITE_OIDC_CLIENT_ID=member-portal
ARG VITE_OIDC_REDIRECT_URI=http://localhost:5173/callback
ARG VITE_GATEWAY_URL=http://localhost:4000/graphql
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED \
    VITE_OIDC_ISSUER=$VITE_OIDC_ISSUER \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI \
    VITE_GATEWAY_URL=$VITE_GATEWAY_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
