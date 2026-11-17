// Read-only AI smoke tests: no database writes, email, publishing or scheduling.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { generateEditorial } from '../engine/editorial-server.js';
import { CLARITY_POLICY, clarityIssues, reviewGenerated } from '../engine/editorial-clarity.js';
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const base = config.match(/window.__VM_SUPABASE_URL__\s*=\s*"([^"]+)"/)[1];
const anon = config.match(/window.__VM_SUPABASE_ANON__\s*=\s*"([^"]+)"/)[1];
const outputDir = process.env.EDITORIAL_TEST_OUTPUT || '/workspace/scratch/a800e365f35b/editorial-test-results';
mkdirSync(outputDir, { recursive: true });
async function generate(body) {
  const response = await fetch(`${base}/functions/v1/text-generate`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai', max_tokens: 6000, ...body }), signal: AbortSignal.timeout(240000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`Geração/revisão: HTTP ${response.status}: ${result.error}`);
  return result;
}
const source = 'Fonte de teste editorial, sem estatísticas: a empresa recebe oportunidades comerciais, mas parte das negociações fica sem próximo passo registrado. A gestão deve examinar onde as oportunidades param, entender os motivos e combinar ações com a equipe antes de investir para atrair mais contatos. Nenhum resultado comercial foi medido. Não invente números, empresas nem pesquisas.';
const cases = [
  { id: 'instagram-pt', channel: 'Instagram', lang: 'português brasileiro' },
  { id: 'linkedin-pt', channel: 'LinkedIn', lang: 'português brasileiro' },
  { id: 'instagram-es', channel: 'Instagram', lang: 'espanhol empresarial LATAM natural' },
  { id: 'linkedin-es', channel: 'LinkedIn', lang: 'espanhol empresarial LATAM natural' },
  { id: 'carousel-pt', channel: 'carrossel Instagram e LinkedIn', lang: 'português brasileiro', carousel: true },
  { id: 'carousel-es', channel: 'carrossel Instagram e LinkedIn', lang: 'espanhol empresarial LATAM natural', carousel: true }
];
const deployed = process.argv.includes('--deployed');
const chosenCase = process.argv.find(a => a.startsWith('--case='))?.slice(7);
const selectedCases = chosenCase ? cases.filter(c => c.id === chosenCase) : cases;
const results = await Promise.allSettled(selectedCases.map(async item => {
  const schema = item.carousel ? '{"headline":string,"support_line":string,"caption":string,"slides":[{"role":"cover|point|action|closing","title":string,"body":string}]}' : '{"headline":string,"support_line":string,"caption":string,"image_prompt":string}';
  const body = { purpose: `posts.write:test-${item.id}`, system: 'Você escreve para gestores da VendaMais. Retorne apenas JSON.', prompt: `Crie uma publicação em ${item.lang}, para ${item.channel}, com uma mensagem central concreta e CTA para revisar as negociações na reunião comercial. ${item.carousel ? 'Escolha entre 3 e 5 slides, cada um acrescentando informação nova. A capa deve funcionar sozinha. Feche com um próximo passo.' : 'Escolha uma imagem única. Não use carrossel.'} Não invente fatos. JSON no schema ${schema}. Fonte: ${source}` };
  const start = Date.now();
  const result = deployed ? await generate(body) : await generateEditorial(body, generate);
  const value = JSON.parse(result.text);
  assert.equal(result.editorial?.passed, true);
  assert.deepEqual(clarityIssues(value), []);
  if (item.carousel) { assert.ok(value.slides.length >= 3 && value.slides.length <= 5); assert.equal(value.slides[0].role, 'cover'); assert.equal(value.slides.at(-1).role, 'closing'); }
  const record = { id: item.id, channel: item.channel, language: item.lang, elapsed_ms: Date.now() - start, editorial: result.editorial, content: value };
  writeFileSync(`${outputDir}/${item.id}.json`, JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ id: item.id, passed: true, headline: value.headline, slides: value.slides?.length, revisions: result.editorial.revisions, elapsed_ms: record.elapsed_ms }));
  return record;
}));
if (!deployed && !chosenCase) {
  try {
    const ambiguous = { headline: 'O futuro das vendas começa onde termina a execução', support_line: '', caption: 'Revise as oportunidades que estão paradas antes de ampliar a prospecção. Leve esse ponto à próxima reunião comercial.' };
    const result = await reviewGenerated(ambiguous, { purpose: 'posts.write:repair-test', context: source, call: async request => JSON.parse((await generate({ system: request.system, prompt: request.prompt, max_tokens: request.maxTokens })).text) });
    assert.ok(result.meta.revisions >= 1); assert.notEqual(result.value.headline, ambiguous.headline);
    writeFileSync(`${outputDir}/ambiguous-title-repair.json`, JSON.stringify({ before: ambiguous, after: result.value, editorial: result.meta }, null, 2));
    console.log(JSON.stringify({ id: 'ambiguous-title-repair', passed: true, before: ambiguous.headline, after: result.value.headline, revisions: result.meta.revisions }));
  } catch (error) { console.error(JSON.stringify({ id: 'ambiguous-title-repair', passed: false, error: error.message })); process.exitCode = 1; }
}
for (let i = 0; i < results.length; i++) if (results[i].status === 'rejected') { console.error(JSON.stringify({ id: selectedCases[i].id, passed: false, error: results[i].reason.message })); process.exitCode = 1; }
const currentResults = results.map((r, i) => r.status === 'fulfilled' ? { ...r.value, passed: true } : { id: selectedCases[i].id, passed: false, error: r.reason.message });
let previousResults = []; try { previousResults = JSON.parse(readFileSync(`${outputDir}/results.json`, 'utf8')); } catch {}
const combinedResults = chosenCase ? [...previousResults.filter(r => !selectedCases.some(c => c.id === r.id)), ...currentResults] : currentResults;
writeFileSync(`${outputDir}/results.json`, JSON.stringify(combinedResults, null, 2));
