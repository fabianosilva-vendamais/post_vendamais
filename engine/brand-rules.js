// brand_rules v1 — objeto estruturado derivado do DNA Criativo e do Manual de Marca v2.0 (set/2026).
// Fonte de verdade em runtime. Quando a marca mudar, este objeto muda primeiro (nova versão em brand_rules).
export const BRAND_RULES_V1 = {
  version: 1,
  brand: { name: 'VendaMais', spelling: 'VendaMais', forbidden_spellings: ['Venda Mais', 'VENDAMAIS', 'Venda-Mais'], thesis: 'Vendas levadas a sério', principle: 'A prova antes da promessa', default_signature_level: 'A' },
  newsletter: { name: 'Radar VendaMais', tagline: 'Vendas para quem influencia vendas', tagline_es: 'Ventas para quienes influyen en las ventas', signature_level: 'A', agenda: [
    { day: 'Segunda', title: 'Radar VendaMais', desc: 'Newsletter semanal para quem influencia vendas' },
    { day: 'Terça', title: 'E-zine do Raul', desc: 'Conteúdo autoral sobre vendas e gestão' },
    { day: 'Quinta', title: 'Podcast VendaMais', desc: 'Conversa entre sócios e convidados sobre operação comercial' } ] },
  colors: {
    navy: '#16263A', orange: '#E2742B', white: '#FFFFFF',
    navy_light: '#24364D', navy_dark: '#0D1723', sand: '#FAF7F2', line: '#E6E2DA', line_dark: '#324052',
    ink: '#1E1E1E', gray: '#5E6770', gray_light: '#9FB3C2', orange_light: '#F0A05A', orange_dark: '#B85A1C', orange_05: '#FDF3EB', orange_15: '#F8DFC9',
    semantic_ui_only: { success: '#16A34A', warning: '#EAB308', error: '#DC2626', info: '#2563EB' },
    forbidden: ['#013C3A', '#001F19', '#185CD9', '#161B87', '#111A2E', '#B08D4A', '#1F4249', '#EF4E2C', '#FF8A2B', '#000000', '#009AF9'],
    proportion: { navy: 55, orange: 20, white: 25 },
    rules: ['Máximo de três cores por peça', 'Um único recurso laranja por peça', 'Laranja nunca como fundo de bloco de texto', 'Sem gradiente, sem dourado, sem preto puro como fundo', 'Verde fora do sistema deste produto', 'Azul só como aviso semântico em interface'] },
  typography: {
    primary: { family: 'Obviously', status: 'not_installed', roles: { display: 'Condensed Bold', title: 'Semibold', text: 'Regular/Medium' } },
    fallback: { family: 'Poppins', roles: { title: 'SemiBold', label: 'Medium', body: 'Regular' } },
    rule: 'Uma peça usa Obviously ou Poppins, nunca as duas. Sem Obviously instalada, a peça inteira vai em Poppins.',
    social_scale: { display: 72, h1: 44, h2: 28, body: 16, caption: 12, label: 12 }, min_body_social: 16 },
  graphics: { symbol_v: { texture_opacity: 0.08, never: ['girado', 'inclinado', 'recortado'] }, orange_bar: { vertical_px: 5, horizontal_kicker: true, rule: 'Nunca vertical e horizontal na mesma peça' }, hexagon: 'Só retrato de sócio', plus_sign: 'Só dentro do nome da marca', forbidden: ['cruz isolada', 'gradiente', 'sombra longa', 'efeito 3D', 'ícone genérico', 'ilustração de personagem'] },
  logo: { versions: ['principal', 'negativo', 'laranja', 'simbolo_v'], min_width_px: 120, clear_space: 'altura do símbolo V', position_level_a: 'canto superior esquerdo', never: ['recriar com tipografia', 'gerar por IA', 'sombra', 'contorno', 'degradê', 'caixa branca sobre foto'] },
  grid: { social: { w: 1080, h: 1350, margin: 80, columns: 6 }, email: { width: 600, padding: 24 }, baseline: 8, radius: { button: 4, card: 12, band: 0 } },
  photo: { treatment: 'pele natural, contraste médio, sombras puxadas para navy, sem filtro', overlay_for_text: 'véu navy a 60% antes de texto branco', never_generate: ['rosto de sócio', 'foto documental de evento como prova'] },
  voice: {
    persons: { A: 'nós (institucional, factual, número ao lado)', B: 'eu (sócio, de campo)', ad: 'você (imperativo curto)' },
    pillars: ['Prático e de campo', 'Direto e provocador', 'Honesto até no erro', 'Método acima de talento'],
    use: ['vendas levadas a sério', 'método', 'campo', 'previsibilidade', 'governança', 'cultura comercial', 'rotina de execução', 'indicador', 'valor acima de preço', 'aprender fazendo', 'sem fórmula mágica', 'meta', 'funil', 'carteira', 'mix', 'positivação', 'cobertura', 'ticket', 'margem', 'canal', 'representante', 'política comercial'],
    avoid: ['energia', 'mindset', 'virada de chave', 'disruptivo', 'paixão por vendas', 'mentalidade vencedora', 'nossa metodologia exclusiva', 'solução completa', 'hub de soluções', 'mercado em geral', 'pessoal', 'galera', 'guerreiros', 'time do coração', 'campeões'],
    superlatives: ['o maior', 'a maior', 'o melhor', 'a melhor', 'número 1', 'número um', 'líder absoluto', 'gigantesc'],
    forbidden_constructions: ['Em um mundo onde', 'Descubra como', 'Chegou a hora de', 'Você já parou para pensar', 'Hoje vamos falar sobre', 'Nossa metodologia exclusiva', 'pela ótica da', 'pela ótica de', 'BU '],
    writing: ['Número antes do adjetivo', 'Verbo de ação', 'Título curto, sem ponto final', 'Sem travessão', 'Caixa alta só em rótulo e kicker', 'Máximo de dois adjetivos por frase', 'Sem construção "Não é X, é Y" repetida'],
    length: { newsletter_words: [700, 1200], newsletter_short: [400, 700], newsletter_deep: [1200, 1800], instagram_caption_chars: [400, 900], linkedin_post_chars: [900, 1500], hashtags_max: 5, headline_words_max: 12, hook_words_max: 8 } },
  angles: {
    training: { label: 'Treinamento', kicker: 'EDUCAÇÃO CORPORATIVA', audience: 'RH, T&D, líderes e gestores', lens: 'aplicação, prática, aprendizagem, acompanhamento, indicador, transferência para o campo', image: 'pessoas reais em sala, dinâmica, cocriação, liderança, quadro e interação', image_avoid: 'plateia comemorando, braços cruzados, high five de banco de imagens' },
    consulting: { label: 'Consultoria', kicker: 'GESTÃO COMERCIAL', audience: 'CEO, dono, diretor ou gerente comercial', lens: 'diagnóstico, governança, processo, rotina, forecast, indicadores, arquitetura comercial e sustentação', image: 'mesa de decisão, quadro de indicadores, executivos trabalhando, campo, reunião de diagnóstico', image_avoid: 'aperto de mão, gráfico flutuando, consultor apontando tela' },
    business: { label: 'Negócio', kicker: 'NEGÓCIO', audience: 'lideranças que olham crescimento, produtividade e performance', lens: 'tese de negócio, leitura de mercado, decisão gerencial, relação entre vendas, liderança, marketing, IA e crescimento', image: 'liderança, operação, mercado, tomada de decisão, vendas conectadas a crescimento e produtividade', image_avoid: 'foguete, alvo, lâmpada, xadrez, metáfora empresarial clichê' } },
  templates: [
    { id: 'T01', name: 'Foto cheia + overlay navy', desc: 'Foto 4:5 inteira, véu navy a 60%, headline branca, barra laranja vertical, logo negativo', needs: ['image'] },
    { id: 'T02', name: 'Fundo branco + foto em bloco', desc: 'Fundo branco, foto em bloco superior, headline navy, número ou dado em laranja', needs: ['image'] },
    { id: 'T03', name: 'Fundo navy + imagem recortada', desc: 'Fundo navy, imagem em bloco recortado, frase curta, símbolo V como marcador', needs: ['image'] },
    { id: 'T04', name: 'Card editorial', desc: 'Card limpo em areia sobre branco, dado ou prova em display, apoio visual discreto', needs: [] },
    { id: 'T06', name: 'Manchete editorial', desc: 'Tipografia grande em display, número de prova gigante em laranja, faixa de foto diagonal na base, símbolo V como textura. Para tese forte ou dado de impacto', needs: [] },
    { id: 'T05', name: 'Retrato de sócio', desc: 'Só para peça assinada por sócio (nível B), retrato oficial em hexágono, assinatura no rodapé', needs: ['portrait', 'partner'] } ],
  qa: { threshold: 85, criteria: [
    { id: 'fidelity', label: 'Fidelidade às fontes', weight: 25 }, { id: 'utility', label: 'Utilidade prática', weight: 20 }, { id: 'dna', label: 'DNA verbal', weight: 15 }, { id: 'channel', label: 'Ajuste ao canal', weight: 10 }, { id: 'unity', label: 'Unidade da marca', weight: 10 }, { id: 'visual', label: 'Qualidade visual', weight: 10 }, { id: 'cta', label: 'CTA', weight: 5 }, { id: 'language', label: 'Revisão linguística', weight: 5 } ],
    blockers: ['Venda Mais separado', 'Superlativo sem evidência', 'Logo gerado por IA ou asset não oficial', 'Gradiente em peça social', 'Cor fora da paleta', 'Dado numérico sem source_id', 'Cliente citado sem fonte', 'Headline ilegível em preview mobile'] },
  partners: [
    { id: 'raul', name: 'Raul Candeloro', role: 'Fundador e sócio', territory: 'Alta performance, gestão de vendas e IA aplicada a vendas' },
    { id: 'marcelo', name: 'Marcelo Caetano', role: 'Sócio-diretor', territory: 'Performance comercial, liderança, representação e BPO de gestão' },
    { id: 'karen', name: 'Karen Jardzwski', role: 'Sócia-diretora · Educação Corporativa', territory: 'Educação corporativa, cultura de aprendizagem, cooperativismo e games' },
    { id: 'jorge', name: 'Jorge Brucinski', role: 'Sócio · Educação Corporativa', territory: 'Facilitação sênior e formação de líderes' },
    { id: 'leandro', name: 'Leandro Biscola', role: 'Sócio · Diretor de Consultoria', territory: 'Consultoria comercial, arquitetura de receita e cultura de vendas' },
    { id: 'fabiano', name: 'Fabiano Silva', role: 'Sócio · Diretor Comercial, Marketing e Novos Negócios', territory: 'Gestão comercial e de carteira, marketing, novos negócios e desenho de proposta' },
    { id: 'guilherme', name: 'Guilherme Rasmussen', role: 'Sócio · Diretor Administrativo', territory: 'Liderança estratégica e vendas, a partir de RH, financeiro e administrativo' } ]
};

export const DEFAULT_ASSETS = [
  { id: 'asset_logo_principal', type: 'logo_primary', label: 'Logo principal (navy sobre claro)', file_url: 'assets/brand/logo-principal.png', version: 1, active: true, metadata: { note: 'Arquivo enviado em 11/09/2026. Cores pré-migração (petróleo/coral). Substituir quando o arquivo no navy #16263A / laranja #E2742B existir.' } },
  { id: 'asset_logo_negativo', type: 'logo_negative', label: 'Logo negativo (branco)', file_url: 'assets/brand/logo-negativo.png', version: 1, active: true, metadata: {} },
  { id: 'asset_logo_invertido', type: 'logo_negative_v', label: 'Logo negativo com V laranja', file_url: 'assets/brand/logo-invertido.png', version: 1, active: true, metadata: {} },
  { id: 'asset_simbolo_v', type: 'symbol_v', label: 'Símbolo V', file_url: 'assets/brand/simbolo-v.jpg', version: 1, active: true, metadata: { note: 'JPG com fundo branco. Enviar PNG/SVG com transparência para textura a 8%.' } },
  { id: 'asset_logo_linkedin', type: 'logo_square', label: 'Logo quadrado (LinkedIn)', file_url: 'assets/brand/logo-linkedin.png', version: 1, active: true, metadata: {} }
];
