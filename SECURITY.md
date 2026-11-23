# Política de segurança

## Reportando uma vulnerabilidade

Encontrou uma falha? **Não abra uma issue pública.** Use a aba
**Security → Report a vulnerability** do GitHub (relato privado) e descreva:

- o que você encontrou e o impacto;
- passos para reproduzir;
- versão/commit afetado.

Respondo assim que possível e, depois da correção, dou o crédito (se você quiser).

## O que o projeto já faz para se proteger

| Ameaça | Proteção |
|---|---|
| Senhas vazadas do banco | Hash **scrypt** com sal (`@nestjs/authentication`); a senha nunca é salva nem logada |
| Descobrir quais e-mails existem | Login compara com um hash falso quando o e-mail não existe (tempo constante) e responde a mesma mensagem |
| Força bruta | Rate limiting global por usuário/IP e limites menores em `/auth/login` (10/min) e `/auth/register` (5/min) |
| Roubo de token via XSS | Access token curto (15 min) só em memória; refresh token em cookie `httpOnly` + `SameSite=Strict` + `Secure` em produção |
| Refresh token roubado | Rotação a cada uso; reutilizar um token antigo revoga a família inteira |
| Ver dados de outra pessoa (IDOR) | Toda consulta filtra pelo dono na própria query (outra pessoa recebe 404) |
| Entrada maliciosa | Validação com **Zod** em todos os endpoints; campos desconhecidos são recusados |
| SSRF pela URL do GitHub | A URL do usuário nunca é acessada: extraímos dono/repo com regex e baixamos sempre de `codeload.github.com`, sem seguir redirects |
| Zip bomb | A triagem decide o que ler só pelo índice do zip, sem descompactar; ao ler, contamos os bytes reais e recusamos o zip se passarem do tamanho declarado ou do limite total |
| Zip com milhares de entradas | Mais de 100 mil entradas no índice faz o zip ser recusado antes de qualquer leitura |
| Zip slip / path traversal | Entradas com `../` ou caminho absoluto fazem o zip ser recusado; links simbólicos são ignorados; nada é escrito com o nome original |
| Arquivo disfarçado | Conferimos a assinatura binária do `.zip` (não confiamos na extensão) |
| Uploads gigantes | Limites de tamanho, quantidade de arquivos e de campos no multer e no JSON |
| Vazamento de segredos do código analisado | Segredos detectados são mascarados no relatório e antes de enviar algo à IA |
| Prompt injection via código analisado | O código vai para a IA delimitado como dado, com instrução explícita para ignorar ordens contidas nele; a nota não depende da IA |
| Headers inseguros | **Helmet** (HSTS, nosniff, frame-ancestors, CSP restrita) na API e CSP no Nginx do frontend |
| CORS aberto | Apenas a origem configurada em `CORS_ORIGIN`, com credenciais |
| Segredos fracos | A API não sobe se `JWT_SECRET` tiver menos de 32 caracteres |
| Mapa da API exposto | Swagger só fica disponível fora de produção |
| Dependências maliciosas | `allowScripts` do npm 11: só scripts de instalação aprovados rodam (Prisma); telemetria (`@scarf/scarf`) bloqueada; `npm audit` e Dependabot no CI |
| Containers | Imagens multi-stage, usuário não-root e somente as portas necessárias |
| Guardar código de terceiros | O código enviado **não é armazenado**: fica numa pasta em RAM (`tmpfs`) só durante a análise e é apagado ao terminar, inclusive quando falha. Uma faxina apaga o que sobrar de um worker que morreu (mais de 30 min). Ficam o relatório (com até 5 trechos mascarados) e a identidade da fonte: link/commit, impressão digital SHA-256 e um minimapa sem nenhum caractere do código |
| Código guardado pela fila | O pedido no Redis leva só o caminho do arquivo temporário, nunca o código. Por isso nem os pedidos que falharam nem o arquivo de persistência (AOF) do Redis guardam código. Para limpar o que versões antigas deixaram: `node dist/scripts/purge-queue.js` no worker |

## Boas práticas para quem for rodar em produção

- Gere segredos fortes: `openssl rand -base64 48`.
- Use HTTPS (o cookie de sessão exige `Secure` em produção).
- Troque as senhas padrão do Postgres/Redis do `docker-compose.yml`.
- Não exponha as portas do Postgres e do Redis para a internet.
