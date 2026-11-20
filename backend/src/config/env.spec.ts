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
  });

  it('recusa um JWT_SECRET curto demais', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'curto' })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('recusa quando DATABASE_URL está ausente', () => {
    expect(() => validateEnv({ JWT_SECRET: base.JWT_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });
});
