# Stage 1: compile the Leptos/WASM map island (ADR-0022)
FROM rust:1-slim AS wasm
RUN cargo install wasm-pack --locked
WORKDIR /island
COPY wasm-map ./wasm-map
RUN rustup target add wasm32-unknown-unknown \
    && wasm-pack build wasm-map --target web --out-dir /island/pkg --out-name wasm_map

# Stage 2: build the Svelte remote
FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY --from=wasm /island/pkg ./src/wasm/pkg
# The gateway URL is baked at build time (Vite reads VITE_* from the env). The default keeps
# the compose topology working; ingress mode overrides it with the gateway hostname.
ARG VITE_GATEWAY_URL=http://localhost:4000/graphql
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
