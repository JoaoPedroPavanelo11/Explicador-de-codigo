import type { ConfigService } from '@nestjs/config';
import { analyzeProject } from '../analyzer/engine/analyzer.js';
import { bankingApi } from '../analyzer/engine/__fixtures__/banking-api.js';
import type { Env } from '../config/env.js';
import { AiExplainerService } from './ai-explainer.service.js';

const configWith = (values: Partial<Env>) =>
  ({ get: (key: keyof Env) => values[key] }) as unknown as ConfigService<
    Env,
    true
  >;

describe('AiExplainerService', () => {
  const result = analyzeProject(bankingApi);

  it('fica desligado sem chave e devolve o resultado intacto', async () => {
    const service = new AiExplainerService(
      configWith({ AI_MODEL: 'claude-opus-5-5' }),
    );
    expect(service.isEnabled).toBe(false);
    await expect(service.enhance(result)).resolves.toBe(result);
  });

  it('não envia segredos para a IA', () => {
    const withSecret = {
      ...result,
      highlights: [
        {
          ...result.highlights[0],
          code: "const key = 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';",
        },
      ],
    };
    const service = new AiExplainerService(configWith({ AI_MODEL: 'x' }));
    const context = service.buildContext(withSecret);
    expect(context).not.toContain('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(context).toContain('Banco Digital API');
  });

  it('mescla a resposta sem alterar a nota e respeitando limites', () => {
    const service = new AiExplainerService(configWith({ AI_MODEL: 'x' }));
    const merged = service.merge(
      result,
      {
        ideaSummary: 'Uma API de banco digital.',
        audience: 'Fintechs.',
        highlights: [
          {
            index: 0,
            whatItDoes: 'Transfere dinheiro com segurança.',
            interesting: ['Usa transação.'],
          },
        ],
        mentorNote: 'Continue assim!',
        extraSuggestions: Array.from({ length: 10 }, (_, i) => `Sugestão ${i}`),
      },
      'claude-opus-5-5',
    );
    expect(merged.quality.score).toBe(result.quality.score);
    expect(merged.idea.summary).toBe('Uma API de banco digital.');
    expect(merged.highlights[0].whatItDoes).toBe(
      'Transfere dinheiro com segurança.',
    );
    expect(merged.highlights[1]).toEqual(result.highlights[1]);
    expect(merged.ai?.extraSuggestions).toHaveLength(4);
    expect(merged.meta.aiEnhanced).toBe(true);
  });
});
