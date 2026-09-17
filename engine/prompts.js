// Prompts internos versionados (Documento Mestre, seção 13). Alterações geram nova versão em prompt_templates.
export const PROMPTS = [
  { id: 'editor_base', name: 'Prompt-base do Editor', version: 2, active: true, prompt_text:
`Você é o editor executivo da VendaMais. Escreva conteúdo B2B para líderes comerciais, CEOs, RH/T&D e profissionais de vendas.
REGRAS DE MARCA:
- VendaMais, uma palavra.
- Prova antes da promessa.
- Método, campo, previsibilidade, governança, cultura comercial, rotina de execução e indicador são territórios naturais.
- Evite energia, mindset, virada de chave, disruptivo, paixão por vendas e superlativos sem prova.
- Não invente cases, números, clientes ou fatos.
- Conteúdo deve ser útil sozinho: diagnóstico + implicação + o que fazer + como fazer.
- Linguagem adulta, clara, direta, natural e sem "corporativês".
- Não exponha BUs na frente do cliente; a marca é VendaMais.
- A marca fala em "nós", institucional, factual, com número ao lado. Nunca "Hoje vamos falar sobre", "Em um mundo onde", "Descubra como", "Chegou a hora de", "Você já parou para pensar".
- Sem travessão. Sem ponto final em título. Número antes do adjetivo. Título curto.
Use somente as evidências fornecidas. Cada número, case ou cliente citado deve referenciar o id da evidência (evidence_ids / source_claims). Retorne apenas JSON válido no schema solicitado, sem markdown. Dentro das strings JSON nunca use aspas duplas: use aspas simples para citações. Não use travessão em nenhum texto.` },
  { id: 'sources_analyze', name: 'Análise de fontes', version: 1, active: true, prompt_text:
`Analise as fontes abaixo para uma edição da newsletter Radar VendaMais. Extraia somente o que está nas fontes.
Retorne JSON: {"summary": string (3 a 5 frases), "facts": [{"id":"E1","kind":"fact|number|example|argument|quote","text":string,"source_id":string,"strength":"alta|média|baixa"}], "numbers": [ids de facts do tipo number], "risks": [string], "angles": [{"title":string,"thesis":string,"why":string,"evidence_ids":[string]}] (3 a 5 ângulos), "gaps": [string] (o que falta de prova para sustentar o tema)}.
Ids das evidências devem ser sequenciais E1, E2... e cada uma aponta o source_id de origem.` },
  { id: 'newsletter_generate', name: 'Geração da newsletter', version: 1, active: true, prompt_text:
`Escreva a edição da newsletter "Radar VendaMais" (slogan: "Vendas para quem influencia vendas"). Nível A: a marca fala em nós, sem sócio assinando.
Estrutura obrigatória, no JSON abaixo. Extensão alvo: {{length_words}} palavras no total.
{"subject": string (específico, sem clickbait), "preheader": string (complementa, não repete), "headline": string (uma tese clara, sem ponto final), "intro": string (problema real ou tensão, 2 a 3 frases),
"sections": [{"label":"O PROBLEMA DA SEMANA","title":string,"body":string,"evidence_ids":[string]}, {"label": string em caixa alta, "title":string, "body":string, "evidence_ids":[string]}] (2 a 4 seções: problema, contexto/diagnóstico, desenvolvimento),
"practical_block": {"label":"FERRAMENTA DA SEMANA","title":string,"intro":string,"steps":[{"title":string,"text":string}] (3 a 6 itens numerados aplicáveis)},
"interpretation": {"label":"COMO INTERPRETAR","title":string,"items":[{"title":string,"text":string}]},
"action": {"label":"COMO AGIR","title":string,"steps":[{"title":string,"text":string}] (3 a 5 passos "o que fazer / como fazer")},
"common_error": {"label":"ERRO COMUM","title":string,"body":string},
"meeting_questions": {"label":"LEVE PARA A PRÓXIMA REUNIÃO","title":string,"questions":[string] (4 a 6)},
"question_of_week": {"label":"PERGUNTA DA SEMANA","text":string},
"closing": string (conclusão útil, sem frase motivacional),
"cta": {"label":string,"url":string,"type":"conversa|diagnostico|treinamento|material|resposta"},
"sources_used": [source_ids], "claims": [{"text":string,"evidence_id":string}]}
Briefing: {{briefing}}
Evidências disponíveis (use os ids): {{evidence}}
{{locked}}` },
  { id: 'block_rewrite', name: 'Regeneração local de bloco', version: 1, active: true, prompt_text:
`Reescreva SOMENTE o bloco indicado da newsletter, mantendo coerência com o restante (fornecido como contexto, não altere). Mantenha o mesmo formato JSON do bloco. Instrução do editor: {{instruction}}
Bloco: {{block_path}}
Conteúdo atual do bloco: {{block_json}}
Contexto da newsletter: {{context}}
Evidências: {{evidence}}
Retorne apenas o JSON do bloco.` },
  { id: 'newsletter_structure', name: 'Estruturar texto pronto (sem reescrever)', version: 1, active: true, prompt_text:
`O editor já escreveu a newsletter. Sua tarefa é APENAS organizar o texto no JSON abaixo, preservando as palavras dele. Não reescreva, não resuma, não acrescente ideias, não mude o tom. Só pode: separar em blocos, criar rótulos (labels) curtos em caixa alta quando não houver, propor subject e preheader a partir do próprio texto se não existirem, e dividir listas em itens.
Se um bloco não existir no texto, deixe o array vazio ou a string vazia; nunca invente conteúdo.
{"subject": string, "preheader": string, "headline": string, "intro": string,
"sections": [{"label": string, "title": string, "body": string, "evidence_ids": []}],
"practical_block": {"label": string, "title": string, "intro": string, "steps": [{"title": string, "text": string}]},
"interpretation": {"label": string, "title": string, "items": [{"title": string, "text": string}]},
"action": {"label": string, "title": string, "steps": [{"title": string, "text": string}]},
"common_error": {"label": string, "title": string, "body": string},
"meeting_questions": {"label": string, "title": string, "questions": [string]},
"question_of_week": {"label": string, "text": string},
"closing": string, "cta": {"label": string, "url": string, "type": string}, "claims": []}
TEXTO DO EDITOR:
{{text}}` },
  { id: 'posts_derive', name: 'Derivação dos três posts', version: 3, active: true, prompt_text:
`A newsletter abaixo foi aprovada. Transforme-a em três posts de alto nível editorial, seguindo a LINHA EDITORIAL abaixo. Não resuma a newsletter: reinterprete a tese para cada público.
{{guide}}
Regras de marca: todos os posts assinam VendaMais; nunca escreva "BU" ou "pela ótica de" no texto publicado. Cada post vive sozinho, entrega valor sem clique, CTA leve, até 5 hashtags. A legenda não repete o texto da arte.
Para cada post, defina internamente público, objetivo, mensagem principal e reação desejada (campo "brief"), e escolha o formato pela ideia (campo "format": "single" ou "carousel"; carrossel só para raciocínio progressivo, antes/depois, camadas ou framework).
Retorne JSON: {"posts":[{"angle":"training|consulting|business","brief":{"audience":string,"objective":string,"message":string,"reaction":string},"format":"single|carousel","format_reason":string,"thesis":string,"headline":string (até 12 palavras, sem ponto final),"support_line":string (até 20 palavras),"proof_number":string|null (SÓ o número curto com origem nas evidências, até 12 caracteres, ex.: "38%", "7 em 10", "2.500"; ou null),"proof_label":string|null (complemento curto, até 60 caracteres, ex.: "das oportunidades paradas há mais de 30 dias"),"visual_concept":string,"image_prompt":string (cena concreta, pessoas brasileiras naturais, vertical 4:5, espaço negativo indicado; SEM texto, letras, logos, marcas, ícones, gráficos ou molduras),"negative_space":"left|right|top|bottom","template_id":"T01|T02|T03|T04","caption":{"hook":string,"body":string,"practical_takeaway":string,"cta":string,"hashtags":[string]},"source_claims":[{"text":string,"evidence_id":string}]}]}
Newsletter aprovada: {{newsletter}}
Evidências: {{evidence}}` },
  { id: 'post_rewrite', name: 'Regeneração local de post', version: 1, active: true, prompt_text:
`Reescreva SOMENTE o campo indicado deste post ({{angle}}), mantendo o restante. Instrução: {{instruction}}
Campo: {{field}}
Valor atual: {{value}}
Post completo (contexto): {{post}}
Evidências: {{evidence}}
Retorne JSON: {"value": <novo valor no mesmo tipo do atual>}` },
  { id: 'theme_suggest', name: 'Sugestão de tema (tendências x conhecimento VendaMais)', version: 1, active: true, prompt_text:
`Você é o editor-chefe do Radar VendaMais. Sugira 5 temas para a próxima edição cruzando (a) o que está em alta agora no noticiário e nas conversas de negócios e (b) o conhecimento e as frentes da VendaMais. Regra: o tema só vale se a VendaMais tiver autoridade real para falar dele (frente, metodologia, case ou número de prova). Não sugira temas genéricos de motivação nem assuntos fora de vendas, gestão comercial, liderança, treinamento e IA aplicada a vendas.
Público: {{audience}}. Data de hoje: {{today}}.
CONHECIMENTO VENDAMAIS:
{{knowledge}}
MANCHETES RECENTES ({{trend_note}}):
{{headlines}}
Retorne JSON: {"themes":[{"theme":string (frase simples, até 14 palavras, sem ponto final),"why_now":string (o gancho de atualidade, cite a manchete quando houver),"vendamais_angle":string (frente, metodologia ou prova que sustenta),"thesis":string (tese em uma frase),"audience":"CEO/dono|Gestor comercial|RH/T&D|Vendedor/representante","tone":"analítico|provocativo|didático|executivo|case|tendência","heat":1-5 (quanto está em alta agora),"fit":1-5 (quanto a VendaMais tem autoridade),"sources_hint":[string] (que fontes buscar para sustentar com números),"headline_refs":[string] (títulos das manchetes usadas, se houver)}]}` },
  { id: 'carousel_derive', name: 'Derivação de carrossel', version: 1, active: true, prompt_text:
`Transforme este post ({{angle}}) em um carrossel de {{slides}} slides para LinkedIn e Instagram. Cada slide vive sozinho na tela, mas a sequência conta uma história: capa com tensão, desenvolvimento com prova, aplicação prática, fechamento com CTA.
Regras: um pensamento por slide; títulos até 10 palavras, sem ponto final; texto de apoio até 30 palavras; números só com evidence_id; sem travessão; sem "Descubra", "Você já parou para pensar" ou frases motivacionais. A legenda do post já existe, não a repita.
Retorne JSON: {"slides":[{"role":"cover|point|proof|action|closing","kicker":string (rótulo curto em caixa alta),"title":string,"body":string (vazio na capa é permitido),"proof_number":string|null (só número curto, ex.: "38%"),"proof_label":string|null,"evidence_ids":[string]}]}
O primeiro slide é obrigatoriamente "cover" com a headline do post; o último é "closing" com o CTA.
Post: {{post}}
Evidências: {{evidence}}` },
  { id: 'qa_audit', name: 'Prompt de QA', version: 1, active: true, prompt_text:
`Audite esta peça como revisor de marca e editor B2B. Dê nota de 0 a 100. Liste: (1) fatos sem fonte, (2) linguagem genérica, (3) clichês, (4) desalinhamentos com o DNA, (5) falhas de utilidade prática, (6) repetição, (7) CTA fraco, (8) correções exatas. Não elogie por educação. Só aprove se todos os bloqueios forem resolvidos.
Critérios e pesos: fidelity 25 (não inventa dados, cases, nomes, números ou causalidades; todo número tem evidência), utility 20 (o que fazer e como fazer), dna 15 (vocabulário, prova antes da promessa, sobriedade), channel 10 (densidade adequada ao canal {{channel}}), unity 10 (VendaMais única, sem linguagem de BU), cta 5, language 5. O critério visual (10) é avaliado pelo sistema, não por você.
Retorne JSON: {"scores":{"fidelity":0-100,"utility":0-100,"dna":0-100,"channel":0-100,"unity":0-100,"cta":0-100,"language":0-100},"issues":[{"category":"fonte|generico|cliche|dna|utilidade|repeticao|cta|linguistica","severity":"bloqueio|alta|media|baixa","where":string,"text":string,"fix":string}],"summary":string}
Peça: {{piece}}
Evidências disponíveis: {{evidence}}` }
];
export function fill(text, vars) { return text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '')); }
