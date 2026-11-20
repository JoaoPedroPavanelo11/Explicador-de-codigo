# syntax=docker/dockerfile:1

# ---------- 1) dependências (inclui as de desenvolvimento, para compilar) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# npm 11 + allowScripts: só os scripts de instalação aprovados rodam.
RUN npm ci --no-audit --no-fund

# ---------- 2) build: gera o cliente do Prisma e compila o TypeScript --------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- 3) migrations: usado pelo serviço "migrate" do compose ---------
FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- 4) runtime: só o necessário para rodar ---------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# Só dependências de produção e sem scripts de instalação.
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
# Pasta dos .zip temporários, gravável apenas pelo usuário da aplicação.
RUN mkdir -p tmp/uploads && chown -R node:node tmp
# Nunca rodar como root dentro do container.
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/ready > /dev/null || exit 1
CMD ["node", "dist/main.js"]
