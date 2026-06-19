FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/ingestor ./apps/ingestor

RUN npm install --workspaces
RUN npm run build --workspace=@webhook-hub/shared
RUN npm run build --workspace=@webhook-hub/database
RUN npm run build --workspace=@webhook-hub/ingestor

FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/ingestor/dist ./apps/ingestor/dist

EXPOSE 3000

CMD ["node", "apps/ingestor/dist/main.js"]