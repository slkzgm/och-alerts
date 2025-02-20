# Dockerfile

FROM node:18-alpine

# Installer pnpm globalement
RUN npm install -g pnpm

# Créer le répertoire de travail
WORKDIR /app

# Copier les fichiers de configuration
COPY package.json pnpm-lock.yaml* tsconfig.json ./

# Installer les dépendances via pnpm
RUN pnpm install --frozen-lockfile

# Copier le code source
COPY src ./src

# Compiler le code TypeScript
RUN pnpm run build

# Commande de démarrage
CMD ["node", "dist/index.js"]
