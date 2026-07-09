FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Auth/OIDC + backend URLs are baked at build time (Vite). Defaults keep the standard image
# unauthenticated (compose/tests unchanged); a deploy wanting login passes --build-arg VITE_AUTH_ENABLED=true.
ARG VITE_AUTH_ENABLED=false
ARG VITE_OIDC_ISSUER=http://localhost:9000
ARG VITE_OIDC_CLIENT_ID=admin-portal
ARG VITE_OIDC_REDIRECT_URI=http://localhost:5174/callback
ARG VITE_MEMBERS_URL=http://localhost:5080
ARG VITE_PARTNERS_URL=http://localhost:8081
ENV VITE_AUTH_ENABLED=$VITE_AUTH_ENABLED \
    VITE_OIDC_ISSUER=$VITE_OIDC_ISSUER \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_REDIRECT_URI=$VITE_OIDC_REDIRECT_URI \
    VITE_MEMBERS_URL=$VITE_MEMBERS_URL \
    VITE_PARTNERS_URL=$VITE_PARTNERS_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
