FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY data ./data
# Drop root: the node image ships a non-root `node` user (UID 1000). The app only
# reads its bundle + dataset and listens on 8083, so it needs no root-owned paths.
USER node
EXPOSE 8083
CMD ["node", "dist/index.js"]
