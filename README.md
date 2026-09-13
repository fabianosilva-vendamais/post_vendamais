# VendaMais Content Engine — MVP

Central editorial da VendaMais: briefing + fontes → **Radar VendaMais** (newsletter HTML, fonte-mãe) → três posts derivados (Treinamento, Consultoria, Negócio) em 1080×1350, com QA, versões e exportação. Especificação: `uploads/Documento_Mestre_VendaMais_Content_Engine.docx`. Regras de marca: `engine/brand-rules.js` (brand_rules v1, derivado do DNA Criativo e do Manual v2.0).

## Estrutura

| Caminho | O que é |
|---|---|
| `Content Engine.dc.html` | Aplicação (Dashboard, Nova edição, Análise de fontes, Editor da Newsletter, Post Studio, Image Lab, Brand Center, Configurações, Histórico, Versões, Login) |
| `engine/store.js` | Persistência local (localStorage + IndexedDB para binários), espelho do schema Supabase, auditoria |
| `engine/brand-rules.js` | `brand_rules` estruturado, versionado; ativos padrão |
| `engine/prompts.js` | Prompts internos versionados (Editor, Análise, Newsletter, Regeneração, Derivação, QA) |
| `engine/providers.js` | Adapters de IA de texto e imagem (Edge Functions; Claude integrado sem chave dentro da plataforma) |
| `engine/qa.js` | Bloqueios determinísticos, score ponderado (8 critérios), checagens visuais |
| `engine/newsletter-render.js` | JSON → HTML de e-mail 600 px inline (tabelas, Gmail/Outlook) + plain text |
| `engine/newsletter-flow.js` | Geração, regeneração por bloco, fixar, versões, QA, aprovação, exportação |
| `engine/social-render.js` | Render determinístico 1080×1350, templates T01–T05 (canvas) |
| `engine/posts-flow.js` | Derivação dos três posts, edição/regeneração por campo, imagens, crop, QA, exportação PNG + legenda |
| `engine/sources.js` | Extração de PDF/DOCX/TXT no navegador |
| `engine/supabase.js` | Auth (e-mail/senha), sincronização PostgREST, Storage |
| `engine/knowledge.js` | Conhecimento VendaMais (portfólio, frentes, cases, provas) extraído de vendamais.com.br; vira evidências K-* em toda geração e QA; editável no Brand Center |
| `supabase/migrations/0001_init.sql` | Schema, RLS, trigger de usuários, buckets |
| `supabase/functions/*` | Edge Functions `text-generate`, `image-generate`, `source-fetch`, `trends-fetch` (manchetes para a sugestão de tema) |
| `.env.example` | Variáveis de ambiente |
| `assets/brand/` | Logos oficiais enviados (pré-migração de cor) |

## Produção (GitHub → Vercel → Supabase)

Veja **DEPLOY.md**: repositório, variáveis de ambiente, API Routes (`app/api/*`) espelhando as Edge Functions, CI e domínio. Em produção a build injeta URL/anon key do Supabase e obriga login (`NEXT_PUBLIC_REQUIRE_LOGIN=true`).

## Setup local / só Supabase

1. **Supabase**: crie o projeto, rode `supabase db push` (ou cole `0001_init.sql` no SQL Editor). Ative Auth por e-mail/senha.
2. **Secrets** das Edge Functions: `supabase secrets set OPENAI_API_KEY=... GEMINI_API_KEY=... ANTHROPIC_API_KEY=... TEXT_PROVIDER=openai TEXT_MODEL=gpt-5 IMAGE_PROVIDER_DEFAULT=gemini IMAGE_MODEL_STANDARD=gemini-3.1-flash-image IMAGE_MODEL_PREMIUM=gemini-3-pro-image OPENAI_IMAGE_MODEL=gpt-image-2.5`.
3. **Deploy**: `supabase functions deploy text-generate image-generate source-fetch trends-fetch publish-schedule`.
4. **App**: abra `Content Engine.dc.html` → Configurações → informe Project URL e anon key → Testar conexão → Entrar / Criar conta (o primeiro usuário vira Admin).
5. **Brand Center**: confira os logos; envie retratos oficiais (T05) e fotos de acervo; envie a Obviously apenas com licença.

Sem Supabase o sistema opera em **modo local** (dados neste navegador). Dentro desta plataforma, o provedor "Claude integrado" gera texto sem chave; OpenAI/Gemini/Anthropic e a geração de imagens exigem Supabase + Edge Functions.

## Rotas de API (Edge Functions)

`POST /functions/v1/text-generate` · `POST /functions/v1/image-generate` · `POST /functions/v1/source-fetch`. Os endpoints lógicos da seção 9.1 do Documento (`sources/analyze`, `newsletter/generate`, `newsletter/rewrite-block`, `newsletter/qa`, `posts/generate`, `posts/rewrite`, `images/generate`, `social/render`, `export/*`) são executados no cliente sobre `text-generate`/`image-generate`, com persistência em PostgREST. Um pacote Next.js/Vercel pode expor os mesmos nomes chamando as mesmas funções.

## Publicação via Metricool (Publisher Adapter)

`engine/publisher.js` + Edge Function `publish-schedule`. Em Configurações → Publicação: **Buscar marcas** e escolher a marca VendaMais (blogId), fuso. No Post Studio, após aprovar: escolher LinkedIn/Instagram, data e hora, **Publicar em …** (agenda no Metricool, que publica sozinho na hora) ou **Enviar como rascunho** (aparece no planner para revisão). Carrossel: Instagram como carrossel, LinkedIn como documento PDF. As artes são renderizadas, hospedadas no bucket `renders` (URL assinada de 1 ano) e normalizadas pelo Metricool. Secrets: `METRICOOL_USER_TOKEN`, `METRICOOL_USER_ID` (plano Advanced). Só posts aprovados entram na fila; nada publica sem aprovação humana.

## Carrossel

No Post Studio, **Formato → Carrossel** gera 4 a 7 slides a partir do post (prompt `carousel_derive`): capa herda template, imagem e headline; miolo tipográfico em branco/areia com barra laranja e paginação; fechamento em navy com logo, CTA e slogan. Slides são editáveis, reordenáveis, com QA determinístico por slide (números sem evidência = bloqueio). Exportação em ZIP (PNGs numerados + legenda) via `engine/posts-flow.js → exportCarousel` (ZIP escrito sem dependências).

## Sugestão de tema em alta

No briefing, **Sugerir tema em alta** lê manchetes dos últimos 7 dias (Google News RSS via `trends-fetch`; sem Supabase tenta um proxy público, e sem rede sugere por sazonalidade) e pede à IA 5 temas cruzados com o conhecimento VendaMais, com nota de "em alta" e "autoridade". **Usar este tema** preenche tema, público, tom, ângulo e gancho no briefing.

## Testes (fluxo completo)

1. Nova edição → tema, público, CTA → Criar edição. 2. Adicionar fonte (texto, PDF, DOCX ou URL). 3. Analisar fontes → evidências E1..En. 4. Gerar newsletter → editar bloco, Fixar, Regenerar bloco, Desfazer. 5. Revisão VendaMais → nota, bloqueios, correções. 6. Aprovar como fonte-mãe. 7. Post Studio → Gerar os três posts → escolher template → Image Lab (gerar/enviar/acervo, crop) → Revisão → Aprovar → Exportar PNG + legenda. 8. Newsletter: Copiar HTML / Baixar .html / .txt. 9. Versões: comparar e restaurar. 10. Histórico: auditoria.

## Checklist

**100% funcional sem credencial externa**: Dashboard, briefing, fontes (texto, PDF, DOCX, TXT), Brand Center (ativos, brand_rules versionado, templates, documentos), editor por blocos, fixar, desfazer/refazer, versões, comparar, restaurar, autosave, bloqueios determinísticos, render HTML/TXT, render social T01–T05, crop manual, upload de imagem/acervo, exportação PNG + legenda + HTML + TXT, auditoria, backup JSON. Geração de texto funciona sem chave dentro desta plataforma com "Claude integrado".

**Exige credencial/configuração**: OpenAI/Gemini/Anthropic para texto (Edge Function + secret), geração de imagem-base (Gemini/OpenAI), leitura automática de URL (`source-fetch`), login e sincronização (Supabase), hospedagem pública dos logos para e-mail (bucket `brand`), Obviously (licença), retratos oficiais (T05).

## Substituições em relação ao Documento (avisadas e aprovadas)

- API Routes/Vercel → **Supabase Edge Functions** (mesma proteção de chaves). Satori+Sharp → **canvas no navegador**. MJML → **template HTML tabular próprio**.
- Rótulo/kicker social renderizado a 22 px (a escala do DNA indica 12 px, ilegível no feed em celular); demais tamanhos seguem a escala (display ≤72, H1 44, corpo ≥16).
- Logos recebidos estão em petróleo/coral (pré-migração). São usados como estão; nunca redesenhados. Substituir no Brand Center quando o arquivo em navy #16263A / laranja #E2742B existir.
- Travessões e ponto final em título vindos da IA são corrigidos deterministicamente (`sanitize`) antes de salvar.
