FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/
RUN npm install
RUN npm run build --workspace=@observeiq/worker
WORKDIR /app/apps/worker
CMD ["node", "dist/index.js"]