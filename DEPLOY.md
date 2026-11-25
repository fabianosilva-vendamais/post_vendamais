# Publicar em produção: GitHub → Vercel → Supabase

Tempo estimado: 25 minutos. Você precisa de contas em github.com, vercel.com e supabase.com (todas com plano gratuito para começar).

## 1. GitHub (repositório)

1. Repositório já criado: `fabianosilva-vendamais/post_vendamais`.
2. Baixe o ZIP do projeto (card no chat), descompacte e, na pasta, rode:
   ```bash
   git init && git add . && git commit -m "VendaMais Content Engine v1"
   git branch -M main
   git remote add origin https://github.com/fabianosilva-vendamais/post_vendamais.git
   git push -u origin main
   ```
   Precisa do Git instalado (git-scm.com). Se preferir sem terminal: GitHub Desktop → Add local repository → Publish.

## 2. Supabase (banco, login, arquivos)

1. supabase.com → **New project** → nome `vendamais-content-engine`, região São Paulo, defina e guarde a senha do banco.
2. **SQL Editor** → cole o conteúdo de `supabase/migrations/0001_init.sql` → Run. (Ou rode `bash setup-supabase.sh`, que também publica as Edge Functions; com a Vercel elas são opcionais, as API Routes fazem o mesmo.)
3. **Authentication → Providers → Email**: ativado. Em **URL Configuration**, Site URL = o domínio da Vercel (passo 3) e Redirect URL `https://SEU-DOMINIO/**`.
4. **Project Settings → API**: copie **Project URL** e **anon public key**.

## 3. Vercel (site + API)

1. vercel.com → **Add New → Project** → importe o repositório do GitHub. Framework detectado: Next.js. Não altere build.
2. **Environment Variables** (Production + Preview):

   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `NEXT_PUBLIC_REQUIRE_LOGIN` | `true` (só entra logado; `false` libera modo local) |
   | `TEXT_PROVIDER` | `openai` |
   | `TEXT_MODEL` | `gpt-5` |
   | `OPENAI_API_KEY` | sua chave OpenAI |
   | `GEMINI_API_KEY` | sua chave Gemini (Nano Banana) |
   | `ANTHROPIC_API_KEY` | opcional |
   | `IMAGE_PROVIDER_DEFAULT` | `gemini` |
   | `IMAGE_MODEL_STANDARD` | `gemini-3.1-flash-image` |
   | `IMAGE_MODEL_PREMIUM` | `gemini-3-pro-image` |
   | `OPENAI_IMAGE_MODEL` | `gpt-image-2.5` |
   | `METRICOOL_USER_TOKEN` | token da API do Metricool (plano Advanced) |
   | `METRICOOL_USER_ID` | userId do Metricool |

3. **Deploy**. Em 2 minutos você terá `https://vendamais-content-engine.vercel.app`. Domínio próprio (ex.: `engine.vendamais.com.br`): Settings → Domains → adicionar e criar o CNAME no seu DNS.

## 4. Primeiro acesso

1. Abra o site → **Criar conta** com seu e-mail (o primeiro usuário vira Admin). Confirme o e-mail se o Supabase pedir.
2. Configurações: já vem com Supabase e API preenchidos pela build. Em **Publicação**, clique **Buscar marcas** e escolha VendaMais.
3. Brand Center: confira logos, envie retratos e acervo.
4. Nova edição → fluxo completo. Cada alteração sincroniza com o Supabase; a equipe entra com as próprias contas (Admin promove/rebaixa papéis na tabela `users`).

## Como o código está organizado

- `Content Engine.dc.html` + `engine/` + `assets/`: a aplicação. A build (`scripts/sync-app.mjs`) copia tudo para `public/app` e injeta as variáveis públicas; a home redireciona para `/app/`.
- `app/api/*/route.js`: API Routes da Vercel (texto, imagem, URL, tendências, Metricool). Mesmo contrato das Supabase Edge Functions em `supabase/functions/*`; o front usa uma ou outra conforme `functions_base`. Todas exigem sessão Supabase válida (ou anon key se `ALLOW_ANON=true`).
- `supabase/migrations`: schema, RLS, buckets. `.github/workflows/supabase.yml` aplica migrations e publica functions a cada push em `supabase/**` (secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`).
- `.github/workflows/ci.yml`: build de verificação em cada push/PR. A Vercel faz o deploy automático (produção em `main`, preview em PRs).

## Custos de referência

Vercel Hobby e Supabase Free cobrem o piloto. IA: uma edição completa (análise + newsletter + QA + 3 posts + 3 imagens) consome centavos de dólar em texto e cerca de US$ 0,10 a 0,50 em imagens, conforme o modo. Metricool Advanced é o único plano pago obrigatório para publicar via API.
