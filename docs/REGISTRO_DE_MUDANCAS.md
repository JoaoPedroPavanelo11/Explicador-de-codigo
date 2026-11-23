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

## #004 — Cancelar/excluir uma análise no meio do processamento
**Data:** 23/11/2026 · **Branch:** `fix/exclusao-durante-analise` · **Tipo:** correção + funcionalidade

### O problema
Se a análise era excluída enquanto o worker trabalhava:
- `markProcessing` e `markDone` usavam `update`, que **lança erro** (P2025) quando a linha sumiu;
- o catch tratava isso como "erro interno": registrava no log uma falha falsa, com stack trace, e o BullMQ agendava **uma nova tentativa** só para descobrir que não havia nada a fazer;
- o worker continuava trabalhando para ninguém: download, análise e a **chamada paga da IA**;
- o código ficava ~3 s a mais na pasta temporária, até a nova tentativa.

> Correção da revisão inicial: eu tinha dito que o GitHub seria baixado de novo. **Não é verdade**: a nova tentativa já parava no início, porque a análise não existia mais.

Descoberta de produto: a tela só oferecia **Excluir** em análises prontas. Não dava para cancelar uma análise na fila ou em andamento, nem excluir uma que falhou (ela ficava no painel para sempre).

### A decisão
- **Camada 1 (feita):** o worker aceita que a análise sumiu.
  - `markProcessing` e `markDone` usam `updateMany` e devolvem `true` ou `false`;
  - `false` vira o sinal interno `AnalysisDeleted`;
  - o worker apaga o código, registra uma linha **informativa** e encerra **com sucesso**, sem nova tentativa.
- **Camada 2 (feita):** pontos de checagem com `stillExists`, uma consulta pelo ID que leva menos de 1 ms. Eles ficam **depois do download** (que pode levar 30 s) e **antes da IA** (onde está o custo em dinheiro).
- **Camada 3 (descartada por ora):** cancelamento ativo, avisando o worker via Redis e abortando o download com `AbortController`. Ganharia poucos segundos e exigiria um canal entre API e worker. **Reavaliar junto com o SSE**, que vai precisar desse mesmo canal.
- **Descartada:** exclusão lógica (`deletedAt`). O resultado que o usuário pediu para apagar ficaria no banco, e isso vai contra o #003.

### Interface, sem pesar na API
- Análise na fila ou em andamento: botão **"Cancelar análise"**. Pronta ou com falha: **"Excluir"**. Ambos usam o mesmo `DELETE`.
- O botão fica travado do clique até a resposta, então cliques extras não viram requisições (testado).
- A consulta a cada 1,5 s **para** assim que a exclusão é confirmada.
- Um 404 ("já não existia", por exemplo por outra aba) é tratado como sucesso, sem mensagem de erro.
- O custo para a API é o mesmo de antes: um `DELETE` (apaga a linha; se o pedido ainda estiver na fila, tira da fila e apaga o arquivo, ver #003). O trabalho pesado de descartar fica com o worker.

### Como foi provado
- **Unitário do processor (novo, 5 cenários):** sem exclusão; excluída antes de começar; durante o download; durante a análise; durante a IA. Em todos, o worker termina sem erro, não chama `markFailed`, não registra erro e apaga o arquivo. A IA nunca é chamada depois da exclusão.
- **Rodando o teste contra o código antigo,** 3 cenários falharam. O 4º ("durante a IA") passou, porque o banco falso não imita o P2025. Por isso:
- **e2e com Postgres real:** depois do `DELETE`, `markProcessing`, `stillExists` e `markDone` devolvem `false`, sem lançar erro.
- **Frontend (primeiro teste de página):**
  - "Cancelar análise" manda **um único** `DELETE` mesmo com clique duplo e volta ao painel;
  - uma análise com falha pode ser excluída;
  - desistir na confirmação não manda nada.
- **Resultados:** backend com 76 unitários e 9 e2e; frontend com 16 testes.

### Atenção para o futuro
- Ainda existe uma janela pequena: a exclusão chegar **depois** do último ponto de checagem e **durante** uma etapa longa, como uma IA lenta. O trabalho dessa etapa é perdido, mas sem erro e sem nova tentativa. Só a camada 3 eliminaria isso.
- Se surgir uma etapa nova e cara no worker (outra chamada externa, por exemplo), ela precisa de um `assertStillExists` antes.

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
