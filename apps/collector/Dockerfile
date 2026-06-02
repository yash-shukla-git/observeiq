FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/collector/ ./apps/collector/
RUN npm install
RUN npm run build --workspace=@observeiq/collector
WORKDIR /app/apps/collector
EXPOSE 4318
CMD ["node", "dist/index.js"]