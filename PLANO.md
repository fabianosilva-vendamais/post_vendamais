# VendaMais Content Engine — interpretação do Documento Mestre (aguardando aprovação)

## O que será construído
Central editorial interna da VendaMais. Briefing + fontes → análise de fontes (fatos/números/evidências com id) → newsletter em JSON estruturado (assunto, preheader, headline, abertura, contexto, 2–4 seções com evidence_ids, bloco prático, fechamento, CTA) renderizada em HTML de e-mail 600px inline + plain text → Revisão VendaMais (score 0–100, 8 critérios ponderados, bloqueios automáticos, selo "Pronta" ≥ 85) → aprovação como fonte-mãe → 3 posts derivados (Treinamento, Consultoria, Negócio), cada um com tese, headline, apoio, conceito visual, image_prompt sem texto/logo, legenda (hook, body, takeaway, cta, hashtags ≤ poucas), source_claims e score → Image Lab (gerar via adapter, comparar, editar prompt, crop 4:5 manual, trocar provedor, ou usar imagem do acervo) → render determinístico 1080×1350 em um dos 5 templates T01–T05 (logo oficial, tipografia, barra laranja, símbolo V, overlay navy) → exportação PNG + copy, HTML + TXT. Tudo com autosave, versões, undo/redo, comparação lado a lado, "Fixar" trecho, marcação gerado × editado, duplicar edição, histórico/auditoria. Status: Draft → Newsletter gerada → Newsletter aprovada → Posts gerados → Aprovado → Exportado. Sem "Regenerar tudo". Sem publicação automática.

## Regra estrutural
Conteúdo gerado, marca renderizada. IA de imagem entrega só a fotografia-base (prompt proíbe texto, logo, marcas). Logo, V, tipografia, cores e textos entram no renderizador com assets oficiais do Brand Center. brand_rules = objeto JSON versionado e aprovado (cores, proporção 55/20/25, tipografia, grafismos, vocabulário usa/evita, construções proibidas, regras de escrita, margens 80px/6 colunas, contraste, um recurso laranja por peça, sem gradiente, verde fora do sistema, azul só semântico em UI).

## Arquitetura proposta
- Frontend: aplicação web (HTML/JS) — Dashboard, Nova edição, Análise de fontes, Editor da Newsletter, Post Studio, Image Lab, Brand Center, Configurações, Histórico.
- Backend: Supabase (Auth, Postgres com RLS, Storage) + Edge Functions para toda chamada de IA (chaves só em secrets). Endpoints da seção 9.1 mantidos 1:1 como functions.
- Render social: composição SVG/HTML determinística → PNG no navegador (substitui Satori+Sharp; mesma função, sem servidor).
- Render e-mail: template HTML tabular próprio, inline styles, sem JS (substitui MJML).
- Adapters: TextProviderAdapter (Claude / OpenAI / Gemini) e ImageProviderAdapter (Gemini Flash Image, Gemini Pro Image, OpenAI GPT Image, fallback configurável). Modelos em configuração, nunca no código.
- Persistência local com estado "Supabase não configurado" enquanto credenciais não existirem; nada de dados fictícios simulando integração.

## Módulos
1 Auth & workspace · 2 Brand Center (assets, brand_rules versionado, templates, exemplos certo/errado) · 3 Edições & fontes (texto, URL, PDF, DOCX, notas; hash) · 4 Análise de fontes (evidências com id) · 5 Newsletter engine (JSON → HTML/TXT, regeneração por bloco, fixar) · 6 QA engine (score + bloqueios) · 7 Derivação social (3 ângulos) · 8 Image Lab (adapter, auditoria de prompt/custo) · 9 Render engine (T01–T05, crop, preview mobile) · 10 Exportação · 11 Versões/autosave/undo/auditoria · 12 Configurações (provedores, modos econômico/padrão/premium, limiar QA) · 13 Prompts versionados (Editor, Derivação, QA).

## Integrações externas
Supabase (Auth, Postgres, Storage, Edge Functions) · IA de texto (Claude/OpenAI/Gemini) · IA de imagem (Gemini, OpenAI) · Google Fonts (Poppins) · Obviously só com licença/upload.

## Ordem de desenvolvimento
1 Schema Supabase + brand_rules + assets · 2 Shell da UI + Dashboard + Nova edição + fontes · 3 Análise de fontes · 4 Newsletter (geração, edição por bloco, render HTML/TXT, preview, export) · 5 QA · 6 Aprovação + derivação dos 3 posts + Post Studio · 7 Render engine T01–T05 + export PNG · 8 Image Lab + adapters · 9 Histórico/versões/comparar/fixar · 10 Configurações + Brand Center completo · 11 README, migrations, prompts versionados, checklist funcional × credencial.

## Decisões tomadas (11/09/2026)
- Backend: Supabase Edge Functions (usuário vai criar o projeto); pacote Next.js documentado no README.
- Texto: OpenAI padrão (adapter com Claude/Gemini). Imagem: OpenAI GPT Image + Gemini Nano Banana (Flash/Pro) no adapter.
- Newsletter: nível A, só a marca. Nome: Radar VendaMais. Slogan: "Vendas para quem influencia vendas". Agenda: Segunda Radar, Terça E-zine do Raul, Quinta Podcast.
- Template-base da newsletter: uploads/Radar_VendaMais_Piloto_v2.html (hero navy → Problema da semana → Ferramenta da semana → Como interpretar → Como agir → Erro comum → Leve para a próxima reunião → Pergunta da semana → Podcast → Agenda → rodapé). Converter para e-mail tabular 600px inline.
- Fonte: Poppins integral (Obviously não enviada). Retratos: não enviados; T05 bloqueado até upload.
- Logos enviados em uploads/logos-*.png (principal, branco, invertido, LinkedIn, símbolo V jpg). Estão em petróleo/coral (pré-migração); usar como estão, slot de substituição no Brand Center.
