import { findSecrets, mask, redactSecrets } from './secrets.js';

describe('detecção de segredos', () => {
  it('encontra chaves conhecidas e mascara o valor', () => {
    const findings = findSecrets([
      { path: 'src/aws.ts', content: "const key = 'AKIAIOSFODNN7EXAMPLA';" },
      {
        path: 'src/db.ts',
        content:
          'const url = "postgres://admin:SuperSenha99@db.prod:5432/app";',
      },
    ]);
    expect(findings.map((f) => f.kind)).toEqual([
      'Chave de acesso AWS',
      'String de conexão com senha',
    ]);
    expect(findings[0].preview).toBe('AKIA************');
  });

  it('ignora placeholders, variáveis de ambiente e arquivos de exemplo', () => {
    const findings = findSecrets([
      {
        path: 'src/a.ts',
        content:
          "const password = process.env.DB_PASSWORD;\nconst secret = 'your_secret_here';",
      },
      { path: '.env.example', content: 'JWT_SECRET=troque-isto' },
      { path: 'README.md', content: 'password = "SenhaDeExemplo123"' },
    ]);
    expect(findings).toHaveLength(0);
  });

  it('acusa um .env versionado com segredo real', () => {
    const findings = findSecrets([
      { path: '.env', content: 'STRIPE_SECRET_KEY=abcd1234efgh5678' },
    ]);
    expect(findings).toHaveLength(1);
  });

  it('mascara segredos dentro de trechos de código', () => {
    const code = "const apiKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';";
    expect(redactSecrets(code)).not.toContain('abcdefghijklmnop');
    expect(mask('abc')).toBe('****');
  });
});
