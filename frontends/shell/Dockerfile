FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Remote URLs are baked into the bundle at build time (see vite.config.ts).
# The defaults point at localhost:5173/5174, which is correct for the demo
# compose setup because the browser (not this container) fetches the remotes.
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
