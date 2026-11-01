FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
# only install this service's dependencies, not the dashboard's
RUN npm ci --workspace=@observeiq/worker
RUN npm run build --workspace=@observeiq/worker
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]
