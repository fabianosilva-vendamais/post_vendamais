// Provider-independent guard: never return a partial/empty JSON response as success.
// One automatic regeneration is safe: text generation has no publication side effects.
export function openAIJSONOptions(model, requested = 8000) {
  const reasoning = /^gpt-5(?:$|[.-])/.test(model || '');
  return { max_completion_tokens: Math.max(reasoning ? 4096 : 1, Number(requested) || 8000), ...(reasoning ? { reasoning_effort: 'low' } : {}) };
}
export function completeJSON(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty');
  const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!value || typeof value !== 'object') throw new Error('invalid schema');
  return value;
}
export async function generateCompleteJSON(body, generate) {
  let input = body;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generate(input);
    try {
      if (['length', 'max_tokens', 'MAX_TOKENS'].includes(result.finish_reason)) throw new Error('truncated');
      const value = completeJSON(result.text);
      return { ...result, text: JSON.stringify(value) };
    } catch {
      console.warn('text-json-incomplete', JSON.stringify({ purpose: body.purpose || 'legacy', attempt: attempt + 1, finish_reason: result.finish_reason || 'unknown', chars: result.text?.length || 0 }));
      input = { ...body, max_tokens: Math.min(24000, Math.max(8192, Math.ceil((Number(body.max_tokens) || 8000) * 1.75))), prompt: `${body.prompt}\n\nA tentativa anterior veio vazia ou incompleta. Gere novamente o objeto JSON COMPLETO, sem cercas de código nem comentários. Seja conciso, preservando todas as chaves, fatos, números, URLs e o texto do autor quando solicitado. Não continue o fragmento anterior.` };
    }
  }
  throw Object.assign(new Error('A IA não conseguiu concluir a resposta após a recuperação automática. O conteúdo salvo foi preservado; retome apenas as etapas pendentes.'), { status: 502 });
}
