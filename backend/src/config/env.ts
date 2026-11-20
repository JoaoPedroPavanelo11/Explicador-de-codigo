import { z } from 'zod';

/**
 * Todas as variáveis de ambiente da API passam por este schema na subida.
 * Se alguma estiver faltando ou inválida, a aplicação NÃO inicia — é melhor
 * falhar cedo do que rodar em produção com um segredo fraco ou vazio.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Origem do frontend autorizada no CORS (ex.: http://localhost:5173)
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Banco de dados
  DATABASE_URL: z.string().url(),

  // Fila (Redis)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // Autenticação — HS256 exige no mínimo 32 bytes de segredo
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  JWT_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('7d'),

  // Rate limiting (requisições por minuto, por usuário ou IP)
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  // Limites de análise
  UPLOAD_MAX_MB: z.coerce.number().positive().max(50).default(10),
  ANALYSIS_MAX_FILES: z.coerce.number().int().positive().default(1500),
  ANALYSIS_MAX_TOTAL_MB: z.coerce.number().positive().default(25),

  // IA (opcional). Sem chave, o explicador usa apenas a análise estática.
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  return parsed.data;
}
