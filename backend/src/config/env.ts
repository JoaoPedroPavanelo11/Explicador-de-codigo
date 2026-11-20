import { z } from 'zod';

// validado na subida: variável faltando ou inválida impede a API de iniciar
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // pode ter várias, separadas por vírgula
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // HS256 pede 32+ bytes
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
  JWT_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('7d'),

  // req/min por usuário (ou IP)
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  UPLOAD_MAX_MB: z.coerce.number().positive().max(50).default(10),
  ANALYSIS_MAX_FILES: z.coerce.number().int().positive().default(1500),
  ANALYSIS_MAX_TOTAL_MB: z.coerce.number().positive().default(25),

  // opcional
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
