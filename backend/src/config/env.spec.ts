import { validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
};

describe('validateEnv', () => {
  it('aplica valores padrão quando a configuração mínima é válida', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.AI_MODEL).toBe('claude-opus-5-5');
    expect(env.APP_ROLE).toBe('all');
  });

  it('aceita os papéis api e worker e recusa outros', () => {
    expect(validateEnv({ ...base, APP_ROLE: 'api' }).APP_ROLE).toBe('api');
    expect(validateEnv({ ...base, APP_ROLE: 'worker' }).APP_ROLE).toBe(
      'worker',
    );
    expect(() => validateEnv({ ...base, APP_ROLE: 'banco' })).toThrow(
      /APP_ROLE/,
    );
  });

  it('exige JWT_SECRET da API, mas não do worker', () => {
    const { DATABASE_URL } = base;
    expect(() => validateEnv({ DATABASE_URL, APP_ROLE: 'api' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() => validateEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(validateEnv({ DATABASE_URL, APP_ROLE: 'worker' }).JWT_SECRET).toBe(
      undefined,
    );
  });

  it('recusa um JWT_SECRET curto demais', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('aceita REDIS_URL opcional e recusa um endereço que não é de Redis', () => {
    expect(validateEnv(base).REDIS_URL).toBe(undefined);
    expect(
      validateEnv({ ...base, REDIS_URL: 'redis://red-abc123:6379' }).REDIS_URL,
    ).toBe('redis://red-abc123:6379');
    expect(() =>
      validateEnv({ ...base, REDIS_URL: 'http://red-abc123:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('recusa quando DATABASE_URL está ausente', () => {
    expect(() => validateEnv({ JWT_SECRET: base.JWT_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });
});
