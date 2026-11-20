import { detectTechnologies } from './stack.js';
import { parseManifests } from './manifests.js';
import type { SourceFile } from './types.js';

const techsOf = (files: SourceFile[]) =>
  Object.fromEntries(
    detectTechnologies(files, parseManifests(files)).map((t) => [
      t.name,
      t.version ?? null,
    ]),
  );

describe('leitura de manifestos', () => {
  it('requirements.txt (Python)', () => {
    const t = techsOf([
      {
        path: 'requirements.txt',
        content: 'Django==5.0.4\npsycopg2-binary>=2.9\n# comentário\npytest\n',
      },
    ]);
    expect(t['Django']).toBe('5.0.4');
    expect(t['PostgreSQL']).toBe('2.9');
    expect(t).toHaveProperty('pytest');
    expect(t).toHaveProperty('Python');
  });

  it('pyproject.toml não confunde campos com dependências', () => {
    const t = techsOf([
      {
        path: 'pyproject.toml',
        content:
          '[project]\nname = "api"\nrequires-python = ">=3.12"\ndependencies = [\n  "fastapi>=0.110",\n  "sqlalchemy[asyncio]==2.0.30",\n]\n\n[tool.ruff]\nline-length = 100\n',
      },
    ]);
    expect(t['FastAPI']).toBe('0.110');
    expect(t['SQLAlchemy']).toBe('2.0.30');
    expect(t['Python']).toBe('3.12');
  });

  it('go.mod (Go)', () => {
    const t = techsOf([
      {
        path: 'go.mod',
        content:
          'module github.com/x/api\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n\tgorm.io/gorm v1.25.10\n)\n',
      },
    ]);
    expect(t['Go']).toBe('1.22');
    expect(t['Gin']).toBe('1.10.0');
    expect(t['GORM']).toBe('1.25.10');
  });

  it('docker-compose e Dockerfile', () => {
    const t = techsOf([
      { path: 'Dockerfile', content: 'FROM node:22-alpine\nCOPY . .\n' },
      {
        path: 'docker-compose.yml',
        content:
          'services:\n  db:\n    image: postgres:16\n  cache:\n    image: redis:7-alpine\n',
      },
    ]);
    expect(t).toHaveProperty('Docker');
    expect(t).toHaveProperty('Docker Compose');
    expect(t['PostgreSQL']).toBe('16');
    expect(t['Redis']).toBe('7');
  });

  it('detecta bibliotecas pelos imports quando não há manifesto', () => {
    const t = techsOf([
      {
        path: 'app.tsx',
        content:
          "import React from 'react';\nimport { z } from 'zod';\nimport x from './local';\n",
      },
    ]);
    expect(t).toHaveProperty('React');
    expect(t).toHaveProperty('Zod');
  });
});
