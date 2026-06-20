FROM node:20-alpine

WORKDIR /app

# 1. Copiar todos los archivos de configuración de la raíz y subcarpetas
# Permite que NPM reconozca y mapee todos los workspaces involucrados
COPY package*.json tsconfig.base.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/database/package*.json ./packages/database/
COPY apps/worker/package*.json ./apps/worker/

# 2. Instalar el árbol de dependencias del monorrepo de forma limpia
RUN npm install

# 3. Copiar el código fuente real de los módulos requeridos
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/worker ./apps/worker

# 4. Compilar secuencialmente en orden estricto de dependencia
RUN npm run build --workspace=@webhook-hub/shared
RUN npm run build --workspace=@webhook-hub/database
RUN npm run build --workspace=@webhook-hub/worker

EXPOSE 3001

CMD ["node", "apps/worker/dist/main.js"]