import { CLARITY_POLICY, CLARITY_VERSION, needsClarityReview, reviewGenerated } from './editorial-clarity.js';

// Older clients do not send purpose. Classify only social creation, never analysis,
// audits, or structuring the author's finished newsletter without rewriting it.
export function editorialPurpose(body) {
  if (body.purpose) return body.purpose;
  const prompt = String(body.prompt || '');
  if (/audite|auditoria|an[aá]lise de fontes|APENAS organizar|SOMENTE organizar/i.test(prompt)) return '';
  if (/"posts"\s*:|"slides"\s*:|post aprovado|post completo|reescreva.{0,80}(?:post|slide)|adapte.{0,80}(?:post|carrossel)/is.test(prompt)) return 'posts.derive:legacy';
  return '';
}

export async function generateEditorial(body, generate, { enabled = true } = {}) {
  const purpose = editorialPurpose(body);
  const preserveAuthor = purpose === 'newsletter.structure' || /APENAS organizar|SOMENTE organizar/i.test(String(body.prompt || ''));
  const system = enabled && !preserveAuthor && !String(body.system || '').includes(CLARITY_VERSION)
    ? `${body.system || ''}\n${CLARITY_POLICY}` : body.system || '';
  const result = await generate({ ...body, system });
  if (!enabled || !needsClarityReview(purpose)) return result;
  let content;
  try { content = JSON.parse(result.text); } catch { throw new Error('A geração não devolveu JSON completo. O conteúdo anterior foi preservado.'); }
  const reviewed = await reviewGenerated(content, {
    purpose, context: body.prompt,
    call: async request => {
      const reply = await generate({ ...body, ...request, max_tokens: request.maxTokens });
      try { return JSON.parse(reply.text); } catch { throw new Error('A revisão não devolveu JSON completo. O conteúdo anterior foi preservado.'); }
    }
  });
  return { ...result, text: JSON.stringify(reviewed.value), editorial: reviewed.meta };
}
