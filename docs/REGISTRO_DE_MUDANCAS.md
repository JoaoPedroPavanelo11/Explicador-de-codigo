# Registro de mudanças — Explicador de Código

Caderno de bordo **nosso**: toda funcionalidade, correção ou implementação entra aqui.
O README é a vitrine para quem chega; este arquivo é para **nós** entendermos o
que já foi feito, por quê, e o que precisa ser lembrado antes de mexer de novo.

**Como usar**
- Uma entrada por mudança, a mais nova no topo.
- Sempre com: o problema, a decisão (e o que foi descartado), o que mudou,
  como foi provado e o que fica de atenção para o futuro.
- Quando uma entrada antiga deixar de valer, não apague: escreva embaixo
  "Substituído por #NNN".

---

## #003 — Código efêmero: o código não fica, a explicação fica
**Data:** 23/11/2026 · **Branch:** `feat/codigo-efemero` · **Tipo:** segurança/privacidade + funcionalidade

### O problema
O README prometia "o código enviado é descartado", mas não era verdade:

1. O código **colado** viajava **dentro do pedido** na fila do Redis.
2. Pedidos que falhavam ficavam guardados (`removeOnFail: 100`) **com o código inteiro**, por tempo indeterminado.
3. O Redis roda com `--appendonly yes`, um "diário" em disco de cada comando. Mesmo depois de apagar o pedido, o código continuava nesse arquivo (provado: a senha de teste apareceu 2 vezes no AOF).
4. Ao separar o worker (#001), a pasta dos `.zip` saiu da RAM (`tmpfs`) e foi para um **volume em disco**. Um worker morto no meio deixava o zip lá para sempre.

### A regra decidida
> O código enviado (colado, `.zip` ou GitHub) existe **só durante a análise**.
> Fica guardada **a explicação com a nota** e a **identidade da fonte**, para o usuário reconhecer de onde veio.

- **Identidade, e não cópia.** Guardar o código como texto ou imagem legível seria guardar o código, só que em outro formato. Por isso a "string + imagem" virou:
  - **impressão digital** (SHA-256): o mesmo código sempre dá o mesmo hash, mas não dá para voltar do hash para o código;
  - **minimapa**: o formato de cada linha (tipo, recuo e comprimento), como o minimapa do VS Code, sem nenhum caractere do código;
  - **GitHub**: o link com o **commit exato**. O GitHub grava o SHA no comentário do próprio zip; confirmamos baixando `octocat/Hello-World`.
- **Os 5 trechos do relatório continuam.** Eles fazem parte da explicação e já têm segredos mascarados. A documentação diz isso com clareza.
- **A faxina usa 30 minutos.** Arquivo esquecido com mais de 30 min é apagado.
- **Descartado:** desligar o `appendonly` do Redis. Perderíamos a fila num reinício, e não é necessário, porque a fila não leva mais código.

### O que mudou
| Onde | Mudança |
|---|---|
| `analyses.constants.ts` | `paste` passa a ter `tmpPath`, não `files`. `UPLOAD_DIR` e os tempos da faxina moram aqui. O tipo `LegacyPasteSource` cobre pedidos antigos ainda na fila (pode sair depois) |
| `analyses.service.ts` | O texto colado vira um `.json` na pasta temporária, e na fila vai só o caminho. Excluir uma análise ainda na fila tira o pedido e apaga o arquivo na hora. Se não der para enfileirar, o arquivo é apagado |
| `analysis.processor.ts` | Lê o código da pasta temporária e apaga o arquivo em todos os desfechos: sucesso, erro de entrada e última tentativa. Gera a identidade. Se o arquivo sumiu, mostra uma mensagem clara: "o código expirou, envie de novo" |
| `tmp-janitor.ts` (novo) | A faxina roda no worker, ao ligar e a cada 10 min, e apaga arquivos com mais de 30 min |
| `analyzer/engine/identity.ts` (novo) | Impressão digital e minimapa: 3 caracteres por linha, até 160 linhas e 4 arquivos (código do produto, maiores primeiro) |
| `ingestion` | `extractZip` devolve o comentário do zip. `fromGithub` valida e devolve o `commit` |
| `report.ts` | O relatório `.md` ganha a linha **Fonte** (link do commit ou "código colado" + impressão digital) |
| Prisma | Nova coluna `source_identity` (JSONB), migração `20261123120000_source_identity` |
| `docker-compose.yml` | O volume `uploads` virou `uploads-ram`: tmpfs compartilhado de 256 MB, uid 1000, modo 0700 |
| `scripts/purge-queue.ts` (novo) | Limpeza única do que versões antigas deixaram no Redis: apaga pedidos concluídos e falhos e roda `BGREWRITEAOF` |
| Frontend | Novo cartão **"De onde veio esta explicação"** no relatório, miniatura do minimapa no painel e aviso de privacidade na tela de nova análise |
| Docs | README (seção "O que fica guardado"), SECURITY.md e o comentário no `schema.prisma` |

### Como foi provado
- **e2e:**
  - uma análise colada com a senha `SENHA_DO_CLIENTE_123` termina, o pedido some da fila e a pasta temporária fica igual a antes;
  - a identidade não contém a senha;
  - uma análise que **falha** continua na fila para investigação, mas o pedido não contém a senha;
  - excluir uma análise **na fila** apaga o pedido e o arquivo na hora.
- **AOF do Redis depois dos testes:** a senha aparece **0 vezes**, contra 2 na prova anterior. Só aparecem caminhos de arquivo.
- **Script de limpeza:** apagou o pedido que falhou e, depois da reescrita, o AOF ficou sem rastro dos pedidos.
- **Unitários:**
  - a impressão digital não depende da ordem dos arquivos;
  - o minimapa só usa o alfabeto `[c#_0-9a-z]`;
  - os limites de linhas e arquivos são respeitados;
  - o comentário do zip é lido;
  - a faxina apaga só o que é velho;
  - o cartão e o minimapa renderizam sem nenhum texto de código.
- **Resultados:** backend com 71 testes unitários e 8 e2e passando; frontend com 13. Lint e build limpos.

### Atenção para o futuro
- **Deploy:** antes do `up`, rodar `docker volume rm explicador-de-codigo_uploads`. O volume novo tem outro nome, então não há conflito, mas o antigo é lixo em disco. Depois, com a fila vazia, rodar `docker compose exec worker node dist/scripts/purge-queue.js` **uma vez**.
- **Em dev** (`APP_ROLE=all`, fora do Docker), a pasta temporária é `backend/tmp/uploads` **em disco**. A faxina e a limpeza funcionam igual, mas não é RAM.
- **Fila parada mais de 30 min:** a faxina apaga o código e a análise falha com "o código expirou, envie de novo". Se um dia a fila tiver esperas longas, aumentar `TMP_MAX_AGE_MS`.
- **tmpfs de 256 MB:** com zips de até 10 MB e no máximo 3 análises pendentes por usuário, cabe com folga. Se o limite de upload subir, revisar esse tamanho.
- **`LegacyPasteSource`** pode ser removido numa próxima versão, quando não houver mais pedidos antigos.
- **Possível evolução:** usar a impressão digital para avisar "você já analisou este mesmo código em DD/MM".

---

## #002 — Limite de 1.500 → 5.000 arquivos com triagem
**Data:** 21/11/2026 · **Commit:** `b8f9206` · **Tipo:** funcionalidade + desempenho

- **Problema:** projetos médios passavam do teto de 1.500 arquivos e eram recusados.
- **Decisão:** uma **triagem antes de ler**, só pelo índice do zip, com 3 regras:
  - acima de 512 KB, o arquivo é descartado sozinho;
  - acima de 5.000 arquivos, vira **visão panorâmica** com os mais importantes;
  - o total descompactado tem teto de 40 MB.
- **Prioridade:** configuração, depois código do produto, testes e o resto; os mais rasos primeiro.
- **Otimizações do motor:**
  - segredos por regex no texto inteiro + busca binária para achar a linha;
  - `countLines` com `indexOf`;
  - os destaques pré-pontuam e só os 8 melhores por papel são avaliados a fundo.
- **Prova:**
  - 5.000 arquivos em 751 ms (antes, 1.970 ms);
  - mesma nota e mesmos 5 destaques;
  - zip de 6.500 arquivos ponta a ponta em 2,5 s.
- **Atenção:** o relatório avisa quando a leitura é panorâmica (`coverageNotice`, que é igual no backend e no frontend).

## #001 — Worker separado da API
**Data:** 21/11/2026 · **Commit:** `7532384` · **Tipo:** refatoração/desempenho

- **Problema:** a análise é cálculo síncrono e travava o event loop. Durante uma análise grande, login e listagem esperavam até 2,6 s.
- **Decisão:** a mesma imagem roda em dois papéis (`APP_ROLE=api|worker|all`). O worker usa `createApplicationContext`, sem HTTP, e **não tem `JWT_SECRET`**, por menor privilégio.
- **Prova:** o pior tempo de resposta da API caiu de 2.619 ms para 20 ms durante uma análise pesada.
- **Atenção:** API e worker compartilham a pasta temporária pelo volume `uploads-ram` (veja #003).
