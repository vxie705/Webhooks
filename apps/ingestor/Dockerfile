FROM node:20-alpine

WORKDIR /app

# 1. Copiar todos los archivos de configuración de la raíz y subcarpetas
# Esto le permite a NPM mapear absolutamente todos los workspaces registrados
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/database/package*.json ./packages/database/
COPY apps/ingestor/package*.json ./apps/ingestor/

# 2. Instalar el árbol completo de dependencias del monorrepo
# Al tener los package.json mapeados, NPM recrea los symlinks perfectos en node_modules
RUN npm install

# 3. Copiar el código fuente real de los módulos que necesita esta app
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/ingestor ./apps/ingestor

# 4. Compilar secuencialmente en orden de dependencia
RUN npm run build --workspace=@webhook-hub/shared
RUN npm run build --workspace=@webhook-hub/database
RUN npm run build --workspace=@webhook-hub/ingestor

EXPOSE 3000

CMD ["node", "apps/ingestor/dist/main.js"]