import { z } from 'zod';

// api = só HTTP, worker = só a fila de análises, all = os dois no mesmo processo (dev)
export const appRoleSchema = z.enum(['api', 'worker', 'all']).default('all');
export type AppRole = z.infer<typeof appRoleSchema>;

// validado na subida: variável faltando ou inválida impede a API de iniciar
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  APP_ROLE: appRoleSchema,
  PORT: z.coerce.number().int().positive().default(3000),

  // quantos proxies há na frente da API, para o req.ip (usado no rate limit)
  // ser o IP do visitante. docker compose: 1 (nginx). Railway: 2 (borda + nginx).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  // pode ter várias, separadas por vírgula
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // HS256 pede 32+ bytes. Obrigatório para a API (ver superRefine abaixo).
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres')
    .optional(),
  JWT_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('7d'),

  // req/min por usuário (ou IP)
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),

  UPLOAD_MAX_MB: z.coerce.number().positive().max(50).default(10),
  // zip do GitHub (compactado); vem com imagens e outros arquivos que a
  // triagem descarta, por isso maior que o upload
  GITHUB_MAX_MB: z.coerce.number().positive().max(200).default(50),
  // regras de quantidade e de total descompactado (o teto por arquivo, 512 KB,
  // fica em DEFAULT_LIMITS). Projeto maior vira visão panorâmica, não erro.
  ANALYSIS_MAX_FILES: z.coerce.number().int().positive().default(5000),
  ANALYSIS_MAX_TOTAL_MB: z.coerce.number().positive().max(200).default(40),

  // opcional
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5-5'),
}).superRefine((env, ctx) => {
  // o worker lida com código de desconhecidos e não emite tokens, então não
  // recebe o segredo: se ele for comprometido, ninguém forja login com isso
  if (env.APP_ROLE !== 'worker' && !env.JWT_SECRET)
    ctx.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET é obrigatório para a API',
    });
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
