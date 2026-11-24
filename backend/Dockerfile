# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# npm 11: só roda script de instalação de quem está em allowScripts
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# usado pelo serviço migrate do compose
FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p tmp/uploads && chown -R node:node tmp
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/ready > /dev/null || exit 1
CMD ["node", "dist/main.js"]

# Railway (último estágio = o que ele builda por padrão). Lá não existe o
# serviço migrate do compose, então este roda as migrations antes de subir.
# Precisa do prisma CLI (devDependency), por isso leva o node_modules completo.
FROM runtime AS railway
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
