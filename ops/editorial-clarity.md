# Clareza editorial do VM Studio — 17/11/2026

## Escopo

`engine/editorial-clarity.js` define a diretriz versionada e o gate de sete critérios. `engine/editorial-server.js` envolve geração social e reescritas, inclusive clientes antigos sem `purpose`. Não reescreve o texto pronto da newsletter. O gate faz auditoria independente, corrige até duas vezes e audita novamente cada correção; falhas não liberam conteúdo nem substituem a versão anterior. Ele preserva esquema, metadados, provas e destinos. As cópias dos módulos nos bundles Supabase são verificadas por teste de igualdade.

Prompts/editorial, copies por canal, adaptação ES e carrosséis usam a mesma diretriz. O número automático de slides passa a depender da ideia; seleção manual continua disponível. O renderer mantém a composição de peças anteriores, informa clipping de texto ao QA e usa apoio de pelo menos 42 px nas novas peças. A geração mede a composição e encurta o texto automaticamente se necessário. A aprovação continua humana. Não há migração de conteúdo nem atualização em lote de posts.

Os copies `captions.instagram` e `captions.linkedin` são opcionais e são exibidos e editados na revisão existente. Posts antigos mantêm `caption` e o comportamento anterior. O adaptador seleciona a cópia adequada e usa as mesmas rotas e contratos de publicação. Publicações já registradas são reaproveitadas em uma retomada por canal.

Postagens de treinamentos usam a mesma regra na etapa 6 de `ops/treinamentos.md`, já consultada pela automação semanal. Não se altera o agendamento, a notificação nem os rascunhos existentes.

## Verificação

- `node --test tests/editorial-clarity.test.mjs`: aprovação dos sete critérios, revisão automática, falha segura, limites, preservação de fatos/metadados, PT/ES, legado, proteção de aprovados/agendados e retomada sem duplicar.
- `node tests/live-editorial.mjs`: seis gerações reais, Instagram/LinkedIn/carrossel em PT e ES, mais correção e reavaliação de título ambíguo. Somente IA de texto; nenhum banco é gravado e nenhum destinatário é acionado.
- `node tests/live-editorial.mjs --deployed`: o mesmo smoke test contra o endpoint atualizado.
- `node tests/editorial-render.mjs`: renders 1080×1350 em quatro composições, slides e preview em 360 px; rejeita clipping e fonte de manchete abaixo de 40 px. Usa `@napi-rs/canvas` do runtime de testes, sem dependência nova da aplicação.

## Reversão

- Frontend anterior: commit `c522e68008e98f66422335771cd531b0a7faa7f7`; deployment de produção anterior `dpl_5z7r1296D2D2kNWy3LpLzirxV24Z`. Pode-se restaurar o deployment sem mudar conteúdo, agenda ou banco.
- A fonte exata de `studio-v2` versão 5 foi preservada em um commit separado anterior à implementação, mensagem `Preserve deployed studio-v2 v5 source for editorial rollback`. Reimplante seus três arquivos mantendo `verify_jwt: false`, pois a função preserva a autenticação interna existente.
- A fonte exata de `text-generate` versão 4 está preservada em `ops/rollback/text-generate-v4.ts`. Reimplante-o mantendo a configuração de autenticação anterior.
- O gate do servidor também aceita `EDITORIAL_CLARITY_ENABLED=false` como desligamento temporário; a interface aceita a mesma desativação por `settings.editorial_clarity_enabled=false`. Não há necessidade de alterar integrações ou dados de publicação para reverter.

O rollout só altera código. Não habilitar, pausar ou executar automações nem realizar envio/publicação como parte destes testes.


## Recuperação de respostas incompletas (17/11/2026)

O limite de saída também inclui os tokens de raciocínio do GPT-5. As chamadas de planejamento, que usavam 2.000 tokens com esforço padrão, podiam retornar HTTP 200 com texto vazio. Agora todas as chamadas GPT-5 usam esforço baixo e uma reserva mínima de 4.096 tokens. O servidor valida JSON e finish_reason antes de responder; se vier truncado ou vazio, gera novamente uma única vez com orçamento maior. A validação também cobre a revisão da newsletter e clientes antigos. Não completa frases ou chaves artificialmente.

O fluxo interrompe a liberação da fonte-mãe quando a revisão falha. O botão “Retomar etapas pendentes” reutiliza a edição e a newsletter salvas, preserva os posts existentes e gera apenas o que falta. Não publica nem agenda. Para reverter apenas esta correção, restaure os arquivos do commit 055f099912f020dcc993d20105b96ffa6a8939a9 e republique text-generate/studio-v2 com seus bundles desse commit.

Validação: `node --test tests/json-completion.test.mjs tests/pipeline-recovery.test.mjs tests/editorial-clarity.test.mjs`. Testes reais são isolados, com somente chamadas de geração de texto, sem gravação em produção.
