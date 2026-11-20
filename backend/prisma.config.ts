// Configuração da CLI do Prisma (v7): onde está o schema, as migrations
// e qual banco usar. O .env é carregado aqui porque o Prisma 7 não o lê sozinho.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
